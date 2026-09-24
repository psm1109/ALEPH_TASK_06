const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const moduleUrl = pathToFileURL(path.join(root, "public/missed-days.mjs")).href;

test("오늘까지 날짜마다 미완료 기록을 만들고 완료한 날은 제외한다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const task = {
    id: 7, title: "네트워크 공부", due_date: "2026-09-22",
    created_at: "2026-09-21T16:00:00Z",
  };
  const completion = { task_id: 7, completed_day: "2026-09-23" };
  assert.deepEqual(missedDaysToRecord([task], [completion], [], "2026-09-24", "pds-main")
    .map((record) => record.missed_day), ["2026-09-22", "2026-09-24"]);
  assert.deepEqual(missedDaysToRecord([task], [], [], "2026-09-24", "pds-main")
    .map((record) => record.missed_day), ["2026-09-22", "2026-09-23", "2026-09-24"]);
  assert.deepEqual(missedDaysToRecord([task], [{ task_id: 7, completed_day: "2026-09-22" }], [], "2026-09-24", "pds-main")
    .map((record) => record.missed_day), ["2026-09-23", "2026-09-24"]);
});

test("계획 시작일이 없으면 할 일을 만든 날부터 오늘까지 기록한다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const task = {
    id: 8, title: "실습", due_date: "2026-09-22",
    created_at: "2026-09-22T15:10:00Z",
  };
  assert.deepEqual(missedDaysToRecord([task], [], [], "2026-09-25", "pds-main")
    .map((record) => record.missed_day), ["2026-09-23", "2026-09-24", "2026-09-25"]);
  assert.deepEqual(missedDaysToRecord([{ ...task, due_date: "2026-09-26" }], [], [], "2026-09-25", "pds-main")
    .map((record) => record.missed_day), ["2026-09-23", "2026-09-24", "2026-09-25"]);
});

test("어제 할 일 다섯 개 중 세 개를 실행했다면 나머지 두 개를 기록한다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const tasks = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    title: `할 일 ${index + 1}`,
    due_date: "2026-10-01",
    created_at: "2026-09-22T01:00:00Z",
  }));
  const completed = [1, 2, 3].map((taskId) => ({ task_id: taskId, completed_day: "2026-09-23" }));
  const records = missedDaysToRecord(
    tasks, completed, [], "2026-09-24", "pds-main",
    { startDate: "2026-09-23", endDate: "2026-09-23" },
  );
  assert.deepEqual(records.map((record) => record.task_id), [4, 5]);
  assert.ok(records.every((record) => record.missed_day === "2026-09-23"));
});

test("할 일 다섯 개와 나흘간 완료 열두 건이면 지연은 여덟 건이다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const tasks = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    title: `할 일 ${index + 1}`,
    due_date: "2026-10-01",
    created_at: "2026-09-24T01:00:00Z",
  }));
  const completed = [
    [1, 2, 3],
    [1, 2, 3],
    [1, 2, 3],
    [1, 2, 3],
  ].flatMap((taskIds, dayIndex) => taskIds.map((taskId) => ({
    task_id: taskId,
    completed_day: `2026-09-${String(21 + dayIndex).padStart(2, "0")}`,
  })));
  const records = missedDaysToRecord(
    tasks, completed, [], "2026-09-24", "pds-main",
    { startDate: "2026-09-21", endDate: "2026-11-01" },
  );
  assert.equal(records.length, 8);
  assert.deepEqual(records.map((record) => record.task_id), [4, 4, 4, 4, 5, 5, 5, 5]);
});

test("현재 계획의 집계 기간 밖 날짜는 기록하지 않는다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const task = {
    id: 8, title: "실습", due_date: "2026-09-30",
    created_at: "2026-09-20T01:00:00Z",
  };
  assert.deepEqual(missedDaysToRecord(
    [task], [], [], "2026-09-26", "pds-main",
    { startDate: "2026-09-22", endDate: "2026-09-24" },
  ).map((record) => record.missed_day), ["2026-09-22", "2026-09-23", "2026-09-24"]);
});

test("이미 기록된 날짜를 다시 저장하지 않고 이후 완료로 지난 미완료를 지우지 않는다", async () => {
  const { missedDaysToRecord } = await import(moduleUrl);
  const task = {
    id: 9, title: "복습", due_date: "2026-09-22",
    created_at: "2026-09-22T02:00:00Z",
    is_completed: true, completed_at: "2026-09-24T01:00:00Z",
  };
  const existing = [{ task_id: 9, missed_day: "2026-09-22" }];
  assert.deepEqual(missedDaysToRecord([task], [], existing, "2026-09-24", "pds-main"), [
    { workspace_id: "pds-main", task_id: 9, missed_day: "2026-09-23", task_title: "복습", due_date: "2026-09-22" },
    { workspace_id: "pds-main", task_id: 9, missed_day: "2026-09-24", task_title: "복습", due_date: "2026-09-22" },
  ]);
});

test("집계 화면과 내보내기가 날짜별 미완료 기록을 사용한다", () => {
  const app = fs.readFileSync(path.join(root, "public/app.js"), "utf8");
  const edge = fs.readFileSync(path.join(root, "supabase/functions/diary-data/index.ts"), "utf8");
  const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts/pds-schema-v2.json"), "utf8"));
  assert.match(app, /missedDaysToRecord\(/);
  assert.match(app, /missedDaysForCurrentPlan\(summary\.tasks\)\.length/);
  assert.match(app, /completionRecordsFromExecutions\(state\.taskExecutions, plan\.start_date, plan\.end_date\)/);
  assert.match(app, /\[\],\s*toSeoulISODate\(\),\s*WORKSPACE_ID/);
  assert.match(app, /const currentPlanTasks = currentVersion \? tasks : \[\]/);
  assert.match(app, /startDate: currentVersion\?\.start_date, endDate: currentVersion\?\.end_date/);
  assert.match(app, /task_missed_days: state\.missedDays/);
  assert.match(app, /on_conflict=user_id,task_id,missed_day/);
  assert.match(edge, /"task_missed_days"/);
  assert.ok(contract.export.data_collections.includes("task_missed_days"));
});

test("신규·기존 DB 모두 날짜별 미완료 기록을 소유자별로 보호한다", () => {
  for (const relativePath of ["supabase/schema.sql", "supabase/daily-missed-days.sql"]) {
    const sql = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.match(sql, /create table if not exists public\.task_missed_days/);
    assert.match(sql, /on public\.task_missed_days \(user_id, task_id, missed_day\)/);
    assert.match(sql, /alter table public\.task_missed_days enable row level security/);
    assert.match(sql, /create policy "owner task missed days read"/);
    assert.match(sql, /create policy "owner task missed days insert"/);
    assert.match(sql, /grant select, insert on table public\.task_missed_days to authenticated/);
  }
});
