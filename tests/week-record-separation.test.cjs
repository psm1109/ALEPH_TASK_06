const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const app = read("public/app.js");
const html = read("public/index.html");
const styles = read("public/styles.css");

assert.match(app, /function completionDate\(completionEvent\) \{\s*return toSeoulISODate\(completionEvent\.completed_at\);\s*\}/);
assert.match(app, /const completions = state\.completionEvents\.filter\(\(item\) => completionDate\(item\) === iso\);/);
assert.match(app, /const executionLogs = state\.taskExecutions\.filter\(\(item\) => executionDate\(item\) === iso\);/);
assert.match(app, /const minutes = executionLogs\.reduce\(\(sum, item\) => sum \+ Number\(item\.actual_minutes \|\| 0\), 0\);/);
assert.match(app, /completions\.length \? "✓" : ""/);
assert.match(app, /minutes \? `\$\{minutes\}분` : "-"/);
assert.match(app, /async function refreshCompletionEvents\(\)[\s\S]*?renderWeek\(\);[\s\S]*?renderCompletionSummary\(\);/);
assert.match(styles, /\.day-cell\.has-completion \.day-dot/);
assert.match(styles, /\.day-cell\.has-execution small/);
assert.match(html, /할 일을 완료하거나 Do 탭에서 실행 시간을 남겨 보세요/);
assert.doesNotMatch(app, /day-cell\$\{entries\.length \? " has-entry"/);

console.log("week record separation checks: 11 passed");
