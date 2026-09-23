// Paste this whole file into DevTools Console on the signed-in deployed app.
// It prints only redacted evidence, revokes the current server session, reuses
// the exact same access token once, and then removes the local session copy.
(async () => {
  const storageKey = Object.keys(localStorage).find((key) => key.includes("auth-token"));
  const session = storageKey ? JSON.parse(localStorage.getItem(storageKey) || "null") : null;
  if (!session?.access_token) throw new Error("로그인된 Supabase 세션을 찾지 못했습니다.");

  const token = session.access_token;
  const claims = JSON.parse(
    atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(4 * Math.ceil(token.split(".")[1].length / 4), "=")),
  );
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const fingerprint = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  const config = window.__PDS_CONFIG__;
  const baseUrl = config.supabaseUrl.replace(/\/$/, "");
  const url = `${baseUrl}/rest/v1/plan_versions?select=id&limit=0`;
  const method = "GET";
  const headers = {
    apikey: config.supabasePublishableKey,
    Authorization: `Bearer ${token}`,
  };
  const summarize = async (response) => {
    const text = await response.text();
    if (text === "[]") return { status: response.status, body: "[]" };
    try {
      const body = JSON.parse(text);
      return {
        status: response.status,
        body: { code: body.code || null, message: body.message || null },
      };
    } catch {
      return { status: response.status, body: text ? "[본문 생략]" : "" };
    }
  };

  const before = await fetch(url, { method, headers }).then(summarize);
  const logout = await fetch(`${baseUrl}/auth/v1/logout?scope=local`, {
    method: "POST",
    headers,
  });
  const after = await fetch(url, { method, headers }).then(summarize);
  const report = {
    checked_at: new Date().toISOString(),
    identity: "Supabase access-token JWT의 sub + 활성 auth.sessions session_id",
    token: `[가림] (SHA-256: ${fingerprint}…)`,
    issued_at: new Date(claims.iat * 1000).toISOString(),
    expires_at: new Date(claims.exp * 1000).toISOString(),
    lifetime_seconds: claims.exp - claims.iat,
    request: {
      url,
      method,
      same_url: true,
      same_method: true,
      same_access_token_reused: true,
      token_in_url: url.includes(token),
    },
    before_logout: before,
    logout_status: logout.status,
    after_logout: after,
  };

  localStorage.removeItem(storageKey);
  window.__PDS_CARD3_EVIDENCE__ = report;
  console.log("CARD3_SESSION_EVIDENCE");
  console.log(JSON.stringify(report, null, 2));
  console.log("검사가 끝났습니다. 결과를 저장한 뒤 페이지를 새로고침하세요.");
})();
