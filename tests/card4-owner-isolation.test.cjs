const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const edgeFunction = fs.readFileSync(
  path.join(root, "supabase", "functions", "diary-data", "index.ts"),
  "utf8",
);
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const config = fs.readFileSync(path.join(root, "supabase", "config.toml"), "utf8");
const verifier = fs.readFileSync(path.join(root, "scripts", "verify-owner-isolation.mjs"), "utf8");

const checks = [
  () => assert.match(app, /functions\/v1\/diary-data\/\$\{table\}/),
  () => assert.match(config, /\[functions\.diary-data\][\s\S]*verify_jwt = false/),
  () => assert.match(edgeFunction, /allowedTables = new Set/),
  () => assert.match(edgeFunction, /authorization\.toLowerCase\(\)\.startsWith\("bearer "\)/),
  () => assert.match(edgeFunction, /idFilter\?\.startsWith\("eq\."\)/),
  () => assert.match(edgeFunction, /if \(!probe\.ok\) return forward\(probe\)/),
  () => assert.match(edgeFunction, /rows\.length === 0/),
  () => assert.match(edgeFunction, /"The requested diary record was not found\."/),
  () => assert.match(edgeFunction, /\}, 404\)/),
  () => assert.match(edgeFunction, /\["POST", "PATCH"\]\.includes\(request\.method\)/),
  () => assert.doesNotMatch(edgeFunction, /service[_-]?role/i),
  () => assert.doesNotMatch(edgeFunction, /x-user-id/i),
  () => assert.match(verifier, /counts_before/),
  () => assert.match(verifier, /counts_after/),
  () => assert.match(verifier, /a_to_b/),
  () => assert.match(verifier, /b_to_a/),
  () => assert.match(verifier, /spoofing/),
  () => assert.match(verifier, /unauthenticated/),
  () => assert.doesNotMatch(verifier, /console\.log\([^)]*(token|password)/i),
];

let passed = 0;
for (const check of checks) {
  check();
  passed += 1;
}

console.log(`카드 4 소유자 격리 검사 ${passed}개 통과`);
