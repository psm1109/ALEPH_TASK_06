const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return json({ error: "Authentication required" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !adminKey) return json({ error: "Account service unavailable" }, 503);

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json({ error: "Authentication required" }, 401);
    const user = await userResponse.json();
    if (!user?.id || typeof user.id !== "string") return json({ error: "Authentication required" }, 401);

    const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    });
    if (!deleteResponse.ok) return json({ error: "Account deletion failed" }, 502);
    return json({ deleted: true });
  } catch {
    return json({ error: "Account deletion failed" }, 502);
  }
});
