const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");

test("계획을 수정해도 기존 할 일을 유지해 할 일 수를 표시한다", () => {
  assert.match(html, /data-see-evidence="planned"><span>할 일 수<\/span><strong id="see-task-count">/);
  assert.doesNotMatch(html, /id="see-plan-count"/);
  assert.match(app, /function tasksForCurrentPlan\(tasks = state\.tasks\) \{\s*return currentPlan\(\) \? \[\.\.\.tasks\] : \[\];\s*\}/);
  assert.doesNotMatch(app, /tasksForCurrentPlan[\s\S]{0,180}task\.plan_version/);
  assert.match(app, /\$\("#see-task-count"\)\.textContent = tasksForCurrentPlan\(summary\.tasks\)\.length/);
});

test("일반 근거 기록은 제목만 표시하고 막힘 기록은 날짜와 이유를 표시한다", () => {
  const evidenceRenderer = app.slice(
    app.indexOf("function renderSeeEvidence"),
    app.indexOf("function renderCompletionHistory"),
  );
  assert.match(evidenceRenderer, /<article class="see-evidence-item"><strong>\$\{escapeHTML\(task\.title\)\}<\/strong><\/article>/);
  assert.match(evidenceRenderer, /<strong>\$\{escapeHTML\(record\.task_title\)\}<\/strong>/);
  assert.doesNotMatch(evidenceRenderer, /see-evidence-values|see-status/);
  assert.match(evidenceRenderer, /state\.seeEvidenceType === "blocked"/);
  assert.match(evidenceRenderer, /record\.blocked_day/);
  assert.match(evidenceRenderer, /escapeHTML\(record\.blocker_reason\)/);
  assert.match(app, /\$\("#see-blocked-count"\)\.textContent = summary\.periodBlockerRecords\.length/);
});

test("완료 수는 집계 기간의 완료 기록을 세고 날짜별 펼치기로 표시한다", () => {
  const evidenceRenderer = app.slice(
    app.indexOf("function renderSeeEvidence"),
    app.indexOf("function renderCompletionHistory"),
  );
  assert.match(html, /data-see-evidence="completed"><span>완료 수<\/span>[\s\S]*?<small>실행 기록이 있는 할 일<\/small>/);
  assert.match(app, /\$\("#see-completion-count"\)\.textContent = summary\.periodCompletionEvents\.length/);
  assert.match(evidenceRenderer, /state\.seeEvidenceType === "completed"/);
  assert.match(evidenceRenderer, /<details class="execution-date-group">/);
  assert.match(evidenceRenderer, /taskTitle\(event\.task_id\)/);
});

test("예상 시간은 일일 합계에 집계 시작일부터 오늘까지 일수를 곱한다", () => {
  const evidenceRenderer = app.slice(
    app.indexOf("function renderSeeEvidence"),
    app.indexOf("function renderCompletionHistory"),
  );
  assert.match(html, /data-see-evidence="expected"><span>예상 시간<\/span>[\s\S]*?<small>일일 합계 × 시작일부터 오늘<\/small>/);
  assert.match(app, /const dailyExpectedMinutes = tasks\.reduce/);
  assert.match(app, /const expectedElapsedDays = plan \? inclusiveISODateCount\(plan\.start_date, toSeoulISODate\(\)\) : 0/);
  assert.match(app, /const elapsedExpectedMinutes = dailyExpectedMinutes \* expectedElapsedDays/);
  assert.match(app, /\$\("#see-expected-time"\)\.textContent = formatMinutes\(summary\.elapsedExpectedMinutes\)/);
  assert.match(evidenceRenderer, /state\.seeEvidenceType === "expected"/);
  assert.match(evidenceRenderer, /escapeHTML\(task\.title\)/);
  assert.match(evidenceRenderer, /formatMinutes\(task\.estimated_minutes\)/);
  assert.match(app, /gapMinutes: actualMinutes - dailyExpectedMinutes/);
});
