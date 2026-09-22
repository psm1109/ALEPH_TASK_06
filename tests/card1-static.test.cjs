const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read("public/index.html");
const app = read("public/app.js");
const schema = read("supabase/schema.sql");
const migration = read("supabase/card1-migrate-existing-data.sql");

assert.match(html, /id="auth-screen"/);
assert.match(html, /id="login-form"/);
assert.match(html, /id="signup-form"/);
assert.match(html, /id="logout-button"/);
assert.match(html, /id="app-shell" class="app-shell" hidden/);

assert.match(app, /@supabase\/supabase-js@2\.116\.0/);
assert.match(app, /signUp\(/);
assert.match(app, /signInWithPassword\(/);
assert.match(app, /signOut\(/);
assert.match(app, /Authorization: `Bearer \$\{state\.session\.access_token\}`/);
assert.match(app, /const GENERIC_LOGIN_ERROR = "이메일 또는 비밀번호를 확인해 주세요\."/);
assert.doesNotMatch(app, /[?&](access_token|refresh_token)=/);

assert.match(schema, /revoke all on table public\.plan_versions from anon, authenticated/);
assert.match(schema, /to authenticated/);
assert.match(schema, /user_id = auth\.uid\(\)/);
assert.doesNotMatch(schema, /create policy\s+"public [^"]+"/i);
assert.match(migration, /where workspace_id = 'pds-main' and user_id is null/);
assert.match(migration, /alter column user_id set not null/);

for (const publicFile of ["public/index.html", "public/styles.css", "public/app.js", "public/config.js"]) {
  const source = read(publicFile);
  assert.doesNotMatch(source, /sb_secret_|service_role|JWT_SECRET/i, `${publicFile} contains a forbidden secret marker`);
}

console.log("card1 static checks: 20 passed");
