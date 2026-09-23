import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { encryptAuthCredentials } from "../public/auth-crypto.mjs";

function requiredEnvironment(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} 환경 변수가 필요합니다.`);
  return value;
}

async function readPublicConfig() {
  const source = await readFile(new URL("../public/config.js", import.meta.url), "utf8");
  const url = source.match(/supabaseUrl:\s*["']([^"']+)["']/)?.[1];
  const publishableKey = source.match(/supabasePublishableKey:\s*["']([^"']+)["']/)?.[1];
  if (!url || !publishableKey) throw new Error("public/config.js의 Supabase 설정을 읽지 못했습니다.");
  return { url: url.replace(/\/$/, ""), publishableKey };
}

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("access token의 만료 정보를 읽지 못했습니다.");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function summarizeResponse(status, body) {
  if (body.trim() === "[]") return { status, body: "[]" };
  try {
    const parsed = JSON.parse(body);
    return {
      status,
      body: {
        code: parsed.code || null,
        message: parsed.message || null,
      },
    };
  } catch {
    return { status, body: body ? "[응답 본문 생략]" : "" };
  }
}

async function login(config, email, password) {
  const endpoint = `${config.url}/functions/v1/auth-gateway`;
  const baseHeaders = { apikey: config.publishableKey };
  const keyResponse = await fetch(endpoint, { headers: baseHeaders, cache: "no-store" });
  if (!keyResponse.ok) throw new Error("auth-gateway 공개 키 요청에 실패했습니다.");
  const { public_key: publicKey } = await keyResponse.json();
  const encrypted = await encryptAuthCredentials(publicKey, email, password);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...baseHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "login", ...encrypted }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw new Error("시험 계정 로그인에 실패했습니다.");
  return payload.access_token;
}

async function main() {
  const config = await readPublicConfig();
  const email = requiredEnvironment("PDS_TEST_EMAIL");
  const password = requiredEnvironment("PDS_TEST_PASSWORD");
  const accessToken = await login(config, email, password);
  const claims = decodeJwtPayload(accessToken);
  const testedUrl = `${config.url}/rest/v1/plan_versions?select=id&limit=0`;
  const testedMethod = "GET";
  const testedHeaders = {
    apikey: config.publishableKey,
    Authorization: `Bearer ${accessToken}`,
  };

  const beforeResponse = await fetch(testedUrl, { method: testedMethod, headers: testedHeaders });
  const beforeBody = await beforeResponse.text();

  const logoutResponse = await fetch(`${config.url}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers: testedHeaders,
  });
  if (!logoutResponse.ok) throw new Error(`서버 로그아웃에 실패했습니다. (${logoutResponse.status})`);

  // Deliberately reuse the exact same token, URL, method, and headers once to
  // prove that server-side session removal—not a changed request—causes denial.
  const afterResponse = await fetch(testedUrl, { method: testedMethod, headers: testedHeaders });
  const afterBody = await afterResponse.text();
  const issuedAt = Number(claims.iat);
  const expiresAt = Number(claims.exp);
  const report = {
    checked_at: new Date().toISOString(),
    identity: "Supabase access-token JWT의 sub + 활성 auth.sessions session_id",
    token: `[가림] (SHA-256: ${createHash("sha256").update(accessToken).digest("hex").slice(0, 12)}…)`,
    token_in_url: false,
    expires_at: new Date(expiresAt * 1000).toISOString(),
    lifetime_seconds: expiresAt - issuedAt,
    request: {
      url: testedUrl,
      method: testedMethod,
      same_access_token_reused: true,
    },
    before_logout: summarizeResponse(beforeResponse.status, beforeBody),
    after_logout: summarizeResponse(afterResponse.status, afterBody),
  };

  console.log(JSON.stringify(report, null, 2));
  if (beforeResponse.status !== 200 || ![401, 403].includes(afterResponse.status)) {
    throw new Error("기대 결과(로그인 200, 로그아웃 후 401/403)와 다릅니다.");
  }
}

main().catch((error) => {
  console.error(`세션 폐기 검사 실패: ${error.message}`);
  process.exitCode = 1;
});
