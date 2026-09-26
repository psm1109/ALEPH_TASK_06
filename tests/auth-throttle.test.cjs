const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const sql = read("supabase/login-throttle.sql");
const schema = read("supabase/schema.sql");
const gateway = read("supabase/functions/auth-gateway/index.ts");
const app = read("public/app.js");
const html = read("public/index.html");

assert.match(sql, /private\.auth_login_throttle/);
assert.match(sql, /scope in \('account', 'ip'\)/);
assert.match(sql, /subject_hash text not null/);
assert.doesNotMatch(sql, /\bemail\b\s+(?:text|varchar)/i);
assert.doesNotMatch(sql, /\bip_address\b|\braw_ip\b/i);
assert.match(sql, /when 3 then 2/);
assert.match(sql, /when 4 then 5/);
assert.match(sql, /when 5 then 15/);
assert.match(sql, /when 6 then 30/);
assert.match(sql, /when 7 then 60/);
assert.match(sql, /when 8 then 120/);
assert.match(sql, /v_failure_count >= 9 then p_now \+ interval '15 minutes'/);
assert.match(sql, /Retrying during a cooldown never increases the count/);
assert.match(sql, /last_failed_at < v_now - interval '24 hours'/);
assert.match(sql, /security definer/g);
assert.match(sql, /revoke all on function public\.auth_login_throttle_check/);
assert.match(sql, /grant execute on function public\.auth_login_throttle_check\(text, text\) to service_role/);
assert.match(schema, /private\.auth_login_throttle/);

assert.match(gateway, /AUTH_THROTTLE_HMAC_SECRET/);
assert.match(gateway, /crypto\.subtle\.sign\("HMAC"/);
assert.match(gateway, /cf-connecting-ip/);
assert.match(gateway, /auth_login_throttle_check/);
assert.match(gateway, /auth_login_throttle_fail/);
assert.match(gateway, /auth_login_throttle_clear/);
assert.match(gateway, /upstreamCode === "invalid_credentials"/);
assert.match(gateway, /"Retry-After": String\(retryAfterSeconds\)/);
assert.doesNotMatch(gateway, /setTimeout|setInterval/);
assert.doesNotMatch(gateway, /console\.(?:log|debug|info|warn|error)\(/);

assert.match(html, /id="login-submit"/);
assert.match(app, /error\.status === 429/);
assert.match(app, /retry_after_seconds/);
assert.match(app, /startLoginCooldown/);
assert.match(app, /loginCooldownUntil/);
assert.match(app, /로그인 시도가 잠시 제한되었습니다/);
assert.doesNotMatch(app, /localStorage[^\n]*(?:login|throttle|failure|attempt)/i);

console.log("auth throttle checks: 36 passed");
