const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

async function dailyCompletion() {
  return import(pathToFileURL(path.join(root, "public/daily-completion.mjs")).href);
}

test("서울 자정을 기준으로 날짜를 구분한다", async () => {
  const { toSeoulISODate, millisecondsUntilNextSeoulDay } = await dailyCompletion();
  assert.equal(toSeoulISODate("2026-09-23T14:59:59.000Z"), "2026-09-23");
  assert.equal(toSeoulISODate("2026-09-23T15:00:00.000Z"), "2026-09-24");
  assert.equal(millisecondsUntilNextSeoulDay(new Date("2026-09-23T14:59:59.000Z")), 1100);
});

test("오늘 완료한 할 일만 체크 상태이며 다음 날 초기화 대상이 된다", async () => {
  const { isTaskCompletedToday, taskNeedsDailyReset } = await dailyCompletion();
  const task = { is_completed: true, completed_at: "2026-09-23T14:30:00.000Z" };
  assert.equal(isTaskCompletedToday(task, "2026-09-23"), true);
  assert.equal(isTaskCompletedToday(task, "2026-09-24"), false);
  assert.equal(taskNeedsDailyReset(task, "2026-09-24"), true);
  assert.equal(taskNeedsDailyReset({ ...task, is_completed: false }, "2026-09-24"), false);
});

test("같은 할 일을 여러 날 완료하면 각 날짜에 체크한다", async () => {
  const { completedTaskIdsForDate } = await dailyCompletion();
  const events = [
    { task_id: 7, completed_day: "2026-09-22", completed_at: "2026-09-22T10:00:00Z" },
    { task_id: 7, completed_day: "2026-09-23", completed_at: "2026-09-23T10:00:00Z" },
  ];
  assert.deepEqual([...completedTaskIdsForDate(events, [], "2026-09-22", "2026-09-24")], ["7"]);
  assert.deepEqual([...completedTaskIdsForDate(events, [], "2026-09-23", "2026-09-24")], ["7"]);
  assert.equal(completedTaskIdsForDate(events, [], "2026-09-24", "2026-09-24").size, 0);
});

test("오늘 체크를 풀면 즉시 사라지고 다음 날에는 남아 있던 기록만 보인다", async () => {
  const { completedTaskIdsForDate } = await dailyCompletion();
  const task = { id: 7, is_completed: true, completed_at: "2026-09-23T14:00:00Z" };
  const firstEvent = { task_id: 7, completed_day: "2026-09-22", completed_at: "2026-09-22T14:00:00Z" };
  assert.deepEqual([...completedTaskIdsForDate([firstEvent], [task], "2026-09-23", "2026-09-23")], ["7"]);
  const sameDayEvent = { task_id: 7, completed_day: "2026-09-23", completed_at: task.completed_at };
  assert.equal(completedTaskIdsForDate([firstEvent, sameDayEvent], [task], "2026-09-23", "2026-09-23").size, 1);
  const unchecked = { ...task, is_completed: false, completed_at: null };
  assert.equal(completedTaskIdsForDate([firstEvent, sameDayEvent], [unchecked], "2026-09-23", "2026-09-23").size, 0);
  assert.deepEqual([...completedTaskIdsForDate([firstEvent], [unchecked], "2026-09-22", "2026-09-23")], ["7"]);
});

test("주간 칸에서 완료 체크와 실행 시간을 독립적으로 계산한다", async () => {
  const { weeklyDayRecord } = await dailyCompletion();
  const date = "2026-09-23";
  const completedTask = { id: 7, is_completed: true, completed_at: "2026-09-23T12:00:00Z" };
  const execution = { task_id: 7, start_time: "2026-09-23T12:05:00Z", actual_minutes: 89 };
  assert.deepEqual(weeklyDayRecord([], [completedTask], [], date, date), {
    completionCount: 1, executionCount: 0, minutes: 0,
  });
  assert.deepEqual(weeklyDayRecord([], [], [execution], date, date), {
    completionCount: 0, executionCount: 1, minutes: 89,
  });
  assert.deepEqual(weeklyDayRecord([], [completedTask], [execution], date, date), {
    completionCount: 1, executionCount: 1, minutes: 89,
  });
  assert.deepEqual(weeklyDayRecord([], [{ ...completedTask, is_completed: false }], [execution], date, date), {
    completionCount: 0, executionCount: 1, minutes: 89,
  });
});

test("완료 직후 주간 화면을 갱신하고 날짜 변경 시 저장 상태를 동기화한다", () => {
  const app = read("public/app.js");
  assert.match(app, /weeklyDayRecord\(\s*state\.completionEvents, state\.tasks, state\.taskExecutions, iso/);
  assert.match(app, /state\.tasks = state\.tasks\.map\([\s\S]*?renderWeek\(\);\s*renderTasks\(\);/);
  assert.match(app, /document\.addEventListener\("visibilitychange"/);
  assert.match(app, /await resetExpiredTaskCompletions\(toSeoulISODate\(\)\)/);
});

test("당일 해제는 이벤트를 제거하고 자정 후 초기화는 전날 이벤트를 보존한다", () => {
  for (const file of ["supabase/schema.sql", "supabase/daily-completion.sql"]) {
    const sql = read(file);
    assert.match(sql, /on public\.task_completion_events \(user_id, task_id, completed_day\)/);
    assert.match(sql, /on conflict \(user_id, task_id, completed_day\)\s+do update set completed_at = excluded\.completed_at/);
    assert.match(sql, /elsif old\.is_completed = true and new\.is_completed = false then/);
    assert.match(sql, /delete from public\.task_completion_events\s+where user_id = old\.user_id and task_id = old\.id\s+and completed_day = \(now\(\) at time zone 'Asia\/Seoul'\)::date/);
  }
});
