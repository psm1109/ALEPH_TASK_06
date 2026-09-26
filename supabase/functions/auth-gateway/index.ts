const corsOrigin = Deno.env.get("AUTH_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": corsOrigin,
  "Access-Control-Allow-Headers": "apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

type ThrottleSubjects = { accountHash: string; ipHash: string | null };
type ThrottleStatus = { allowed: boolean; retryAfterSeconds: number };

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json; charset=utf-8" },
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

function readInjectedKey(dictionaryName: string, legacyName: string) {
  const dictionary = Deno.env.get(dictionaryName);
  if (dictionary) {
    const parsed = JSON.parse(dictionary);
    const value = String(parsed.default || Object.values(parsed)[0] || "");
    if (value) return value;
  }
  return String(Deno.env.get(legacyName) || "");
}

async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)),
  );
  return [...signature].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function throttleSubjects(request: Request, email: string): Promise<ThrottleSubjects> {
  const secret = String(Deno.env.get("AUTH_THROTTLE_HMAC_SECRET") || "");
  if (secret.length < 32) throw new Error("Missing login throttle key");
  const normalizedEmail = email.trim().toLocaleLowerCase("en-US");
  // Use only the edge-injected address. A client-supplied forwarding fallback
  // would let an attacker choose a new IP bucket on every request.
  const clientIp = String(request.headers.get("cf-connecting-ip") || "").trim();
  return {
    accountHash: await hmacHex(secret, `account:${normalizedEmail}`),
    ipHash: clientIp ? await hmacHex(secret, `ip:${clientIp}`) : null,
  };
}

async function throttleRpc(
  functionName: "auth_login_throttle_check" | "auth_login_throttle_fail" | "auth_login_throttle_clear",
  subjects: ThrottleSubjects,
): Promise<ThrottleStatus> {
  const supabaseUrl = String(Deno.env.get("SUPABASE_URL") || "");
  const secretKey = readInjectedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !secretKey) throw new Error("Missing login throttle service configuration");

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: secretKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_account_hash: subjects.accountHash,
      p_ip_hash: subjects.ipHash,
    }),
  });
  if (!response.ok) throw new Error("Login throttle request failed");
  if (functionName === "auth_login_throttle_clear") {
    return { allowed: true, retryAfterSeconds: 0 };
  }

  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row.allowed !== "boolean") throw new Error("Invalid login throttle response");
  return {
    allowed: row.allowed,
    retryAfterSeconds: Math.max(0, Number(row.retry_after_seconds) || 0),
  };
}

function throttled(status: ThrottleStatus) {
  const retryAfterSeconds = Math.max(1, Math.ceil(status.retryAfterSeconds));
  return json(
    { error: "Authentication temporarily limited", retry_after_seconds: retryAfterSeconds },
    429,
    { "Retry-After": String(retryAfterSeconds) },
  );
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
    const publishableKey = readInjectedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    if (!supabaseUrl || !publishableKey) return json({ error: "Authentication service unavailable" }, 503);
    const subjects = mode === "login" ? await throttleSubjects(request, credentials.email) : null;
    if (subjects) {
      const status = await throttleRpc("auth_login_throttle_check", subjects);
      if (!status.allowed) return throttled(status);
    }
    const authPath = mode === "login" ? "/auth/v1/token?grant_type=password" : "/auth/v1/signup";
    let upstream: Response;
    try {
      upstream = await fetch(`${supabaseUrl}${authPath}`, {
        method: "POST",
        headers: { apikey: publishableKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          gotrue_meta_security: { captcha_token: captchaToken },
        }),
      });
    } finally {
      credentials.password = "";
    }

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamCode = String(result.code || result.error_code || "");
      if (subjects && upstreamCode === "invalid_credentials") {
        const status = await throttleRpc("auth_login_throttle_fail", subjects);
        if (!status.allowed) return throttled(status);
      }
      return json({ error: "Authentication failed" }, upstream.status === 429 ? 429 : 401);
    }
    if (subjects) await throttleRpc("auth_login_throttle_clear", subjects);
    return json(safeAuthResult(result), upstream.status);
  } catch {
    return json({ error: "Authentication failed" }, 400);
  }
});
