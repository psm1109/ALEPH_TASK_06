const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const html = read("public/index.html");
const app = read("public/app.js");
const evidenceSql = read("supabase/card2-password-evidence.sql");
const schema = read("supabase/schema.sql");

assert.equal((html.match(/type="password"/g) || []).length, 3);
assert.match(app, /auth\.signUp\(/);
assert.match(app, /auth\.signInWithPassword\(/);
assert.match(app, /loginForm\.elements\.password\.value = ""/);
assert.match(app, /signupForm\.elements\.password\.value = ""/);
assert.match(app, /signupForm\.elements\.password_confirm\.value = ""/);
assert.doesNotMatch(app, /console\.(?:log|debug|info|warn|error)\(/);
assert.doesNotMatch(schema, /^\s*(?:password|password_hash|encrypted_password)\s+/im);

assert.match(evidenceSql, /auth\.users/);
assert.match(evidenceSql, /encrypted_password as bcrypt_hash/);
assert.match(evidenceSql, /count\(distinct encrypted_password\)/);
assert.match(evidenceSql, /same_password_has_different_hashes/);
assert.match(evidenceSql, /Never write the shared password/);

console.log("card2 password checks: 13 passed");
