import { forwardResponse } from "./forward-response.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, prefer",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

const allowedTables = new Set([
  "plan_versions",
  "reflections",
  "tasks",
  "task_execution_logs",
  "task_completion_events",
]);
const allowedMethods = new Set(["GET", "POST", "PATCH", "DELETE"]);

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function responseHeaders(upstream: Response) {
  const headers = new Headers(corsHeaders);
  for (const name of ["content-type", "content-range", "preference-applied"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function parseTable(requestUrl: URL) {
  const marker = "/diary-data/";
  const markerIndex = requestUrl.pathname.indexOf(marker);
  if (markerIndex < 0) return "";
  const remainder = requestUrl.pathname.slice(markerIndex + marker.length);
  return decodeURIComponent(remainder.split("/")[0] || "");
}

function restHeaders(request: Request, anonKey: string) {
  const headers = new Headers({
    apikey: anonKey,
    Authorization: request.headers.get("authorization") || "",
    "Content-Type": "application/json",
  });
  for (const name of ["accept", "prefer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function forward(upstream: Response) {
  return forwardResponse(upstream, responseHeaders(upstream));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (!allowedMethods.has(request.method)) return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }
  if (Number(request.headers.get("content-length") || 0) > 1_048_576) {
    return json({ error: "Request too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return json({ error: "Data service unavailable" }, 503);

  const requestUrl = new URL(request.url);
  const table = parseTable(requestUrl);
  if (!allowedTables.has(table)) return json({ error: "Not found" }, 404);

  const headers = restHeaders(request, anonKey);
  const idFilter = requestUrl.searchParams.get("id");

  // A normal RLS table request hides a foreign row as `200 []`. For a request
  // that names one primary key, probe through the caller's JWT before any write
  // and turn both a foreign row and a missing row into the same explicit 404.
  if (idFilter?.startsWith("eq.")) {
    const probeUrl = new URL(`${supabaseUrl}/rest/v1/${table}`);
    probeUrl.searchParams.set("id", idFilter);
    probeUrl.searchParams.set("select", "id");
    probeUrl.searchParams.set("limit", "1");
    const probe = await fetch(probeUrl, { headers });
    if (!probe.ok) return forward(probe);
    const rows = await probe.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return json({ code: "PGRST116", message: "The requested diary record was not found." }, 404);
    }
  }

  const restUrl = new URL(`${supabaseUrl}/rest/v1/${table}`);
  restUrl.search = requestUrl.search;
  const body = ["POST", "PATCH"].includes(request.method) ? await request.arrayBuffer() : undefined;
  const upstream = await fetch(restUrl, { method: request.method, headers, body });
  return forward(upstream);
});
