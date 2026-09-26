const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const app = read("public/app.js");
const html = read("public/index.html");
const schema = read("supabase/schema.sql");
const accountDelete = read("supabase/functions/account-delete/index.ts");
const cascadeMigration = read("supabase/card5-account-delete-cascade.sql");
const contract = JSON.parse(read("contracts/pds-schema-v2.json"));

assert.match(html, /id="export-data-button"/);
assert.match(html, /id="delete-account-button"/);
assert.match(html, /계정을 삭제하면 데이터베이스에 저장된 이 계정의 계획·할 일·실행·완료·지연·회고 자료도 함께 삭제되며 복구할 수 없습니다/);
assert.ok(html.indexOf('id="logout-button"') < html.indexOf('class="account-danger"'));
assert.match(app, /pds-diary-export/);
assert.match(app, /functions\/v1\/account-delete/);
assert.match(app, /데이터베이스에 저장된 이 계정의 계획·할 일·실행·완료·지연·회고 자료도 함께 삭제되며 복구할 수 없습니다/);
assert.match(accountDelete, /auth\/v1\/user/);
assert.match(accountDelete, /auth\/v1\/admin\/users/);
assert.match(accountDelete, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(accountDelete, /encodeURIComponent\(user\.id\)/);
assert.match(schema, /references auth\.users\(id\) on delete cascade/);
for (const table of contract.export.data_collections) {
  assert.match(cascadeMigration, new RegExp(`alter table public\\.${table}`));
}
assert.equal((cascadeMigration.match(/on delete cascade/g) || []).length, contract.export.data_collections.length);
assert.deepEqual(contract.export.data_collections, [
  "plan_versions", "tasks", "task_execution_logs", "task_completion_events", "task_missed_days", "reflections",
]);
console.log("card 5 account lifecycle checks: 20 passed");
