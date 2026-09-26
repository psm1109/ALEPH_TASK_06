const corsOrigin = Deno.env.get("AUTH_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function readPrivateJwk() {
  const encoded = Deno.env.get("AUTH_PRIVATE_JWK_B64");
  if (!encoded) throw new Error("Missing authentication encryption key");
  return JSON.parse(new TextDecoder().decode(decodeBase64(encoded)));
}

function publicJwk(privateJwk: JsonWebKey) {
  return {
    kty: privateJwk.kty,
    n: privateJwk.n,
    e: privateJwk.e,
    alg: "RSA-OAEP-256",
    ext: true,
    key_ops: ["encrypt"],
  };
}

async function decryptCredentials(body: Record<string, unknown>, privateJwk: JsonWebKey) {
  const encryptedKey = decodeBase64(String(body.encrypted_key || ""));
  const iv = decodeBase64(String(body.iv || ""));
  const ciphertext = decodeBase64(String(body.ciphertext || ""));
  if (encryptedKey.length === 0 || iv.length !== 12 || ciphertext.length === 0) {
    throw new Error("Invalid encrypted request");
  }

  const rsaKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, rsaKey, encryptedKey);
  const aesKey = await crypto.subtle.importKey("raw", rawAesKey, "AES-GCM", false, ["decrypt"]);
  const clearBytes = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext),
  );

  try {
    const credentials = JSON.parse(new TextDecoder().decode(clearBytes));
    return {
      email: String(credentials.email || "").trim(),
      password: String(credentials.password || ""),
    };
  } finally {
    clearBytes.fill(0);
    new Uint8Array(rawAesKey).fill(0);
  }
}

function safeAuthResult(upstream: Record<string, unknown>) {
  return {
    access_token: upstream.access_token,
    refresh_token: upstream.refresh_token,
    expires_in: upstream.expires_in,
    expires_at: upstream.expires_at,
    token_type: upstream.token_type,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  let privateJwk: JsonWebKey;
  try {
    privateJwk = readPrivateJwk();
  } catch {
    return json({ error: "Authentication service unavailable" }, 503);
  }

  if (request.method === "GET") return json({ public_key: publicJwk(privateJwk) });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (Number(request.headers.get("content-length") || 0) > 16_384) {
      return json({ error: "Invalid request" }, 413);
    }
    const body = await request.json();
    const mode = body.mode === "signup" ? "signup" : body.mode === "login" ? "login" : "";
    if (!mode) return json({ error: "Invalid request" }, 400);
    const captchaToken = String(body.captcha_token || "");
    if (!captchaToken) return json({ error: "Authentication failed" }, 400);

    const credentials = await decryptCredentials(body, privateJwk);
    if (!credentials.email || !credentials.password) return json({ error: "Invalid request" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) return json({ error: "Authentication service unavailable" }, 503);
    const authPath = mode === "login" ? "/auth/v1/token?grant_type=password" : "/auth/v1/signup";
    let upstream: Response;
    try {
      upstream = await fetch(`${supabaseUrl}${authPath}`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          gotrue_meta_security: { captcha_token: captchaToken },
        }),
      });
    } finally {
      credentials.password = "";
    }

    if (!upstream.ok) return json({ error: "Authentication failed" }, 401);
    const result = await upstream.json();
    return json(safeAuthResult(result), upstream.status);
  } catch {
    return json({ error: "Authentication failed" }, 400);
  }
});
