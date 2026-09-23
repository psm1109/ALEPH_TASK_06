const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const schema = read("supabase/schema.sql");
const app = read("public/app.js");
const verifier = read("scripts/verify-session-revocation.mjs");

assert.match(schema, /from auth\.sessions/);
assert.match(schema, /auth\.sessions\.id::text = nullif\(auth\.jwt\(\) ->> 'session_id'/);
assert.match(schema, /auth\.sessions\.user_id = auth\.uid\(\)/);
assert.match(schema, /security definer\s+set search_path = ''/);
assert.match(schema, /alter role authenticator set pgrst\.db_pre_request = 'private\.check_auth_session'/);
assert.match(schema, /raise insufficient_privilege/);
assert.match(schema, /select private\.is_auth_session_active\(\)/);

assert.match(app, /Authorization: `Bearer \$\{state\.session\.access_token\}`/);
assert.doesNotMatch(app, /[?&](?:access_token|refresh_token|session_id)=/);
assert.match(verifier, /const testedMethod = "GET"/);
assert.match(verifier, /same_access_token_reused: true/);
assert.equal((verifier.match(/fetch\(testedUrl, \{ method: testedMethod, headers: testedHeaders \}\)/g) || []).length, 2);
assert.match(verifier, /expires_at:/);
assert.match(verifier, /lifetime_seconds:/);
assert.match(verifier, /token_in_url: false/);
assert.match(verifier, /\[가림\]/);

function assertNoPrivateSecrets(source, label) {
  const forbidden = [
    /sb_secret_[A-Za-z0-9_-]{16,}/g,
    /-----BEGIN (?:RSA )?PRIVATE KEY-----/g,
    /AUTH_PRIVATE_JWK_B64\s*=\s*[A-Za-z0-9+/=]{40,}/g,
    /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s<]+/g,
  ];
  for (const pattern of forbidden) {
    assert.equal(pattern.test(source), false, `${label} contains a private secret`);
  }

  for (const token of source.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
    try {
      const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
      assert.notEqual(claims.role, "service_role", `${label} contains a service-role JWT`);
    } catch (error) {
      if (error instanceof assert.AssertionError) throw error;
    }
  }
}

function sourceFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    if ([".git", "node_modules"].includes(entry.name)) return [];
    if (entry.name === ".env.auth.local") return [];
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(absolutePath) : [absolutePath];
  });
}

for (const absolutePath of sourceFiles(root)) {
  const source = fs.readFileSync(absolutePath);
  if (!source.includes(0)) assertNoPrivateSecrets(source.toString("utf8"), path.relative(root, absolutePath));
}

console.log("card3 session checks: 18 passed");
