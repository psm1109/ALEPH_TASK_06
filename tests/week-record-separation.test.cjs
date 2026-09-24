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
  const {
    toSeoulISODate, millisecondsUntilNextSeoulDay, inclusiveISODateCount, inclusiveISODates,
  } = await dailyCompletion();
  assert.equal(toSeoulISODate("2026-09-23T14:59:59.000Z"), "2026-09-23");
  assert.equal(toSeoulISODate("2026-09-23T15:00:00.000Z"), "2026-09-24");
  assert.equal(millisecondsUntilNextSeoulDay(new Date("2026-09-23T14:59:59.000Z")), 1100);
  assert.equal(inclusiveISODateCount("2026-09-21", "2026-09-24"), 4);
  assert.equal(inclusiveISODateCount("2026-09-24", "2026-09-24"), 1);
  assert.equal(inclusiveISODateCount("2026-09-25", "2026-09-24"), 0);
  assert.deepEqual(inclusiveISODates("2026-09-21", "2026-09-24"), [
    "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24",
  ]);
});

test("오늘 완료한 할 일만 체크 상태이며 다음 날 초기화 대상이 된다", async () => {
  const { isTaskCompletedToday, taskNeedsDailyReset } = await dailyCompletion();
  const task = { is_completed: true, completed_at: "2026-09-23T14:30:00.000Z" };
  assert.equal(isTaskCompletedToday(task, "2026-09-23"), true);
  assert.equal(isTaskCompletedToday(task, "2026-09-24"), false);
  assert.equal(taskNeedsDailyReset(task, "2026-09-24"), true);
  assert.equal(taskNeedsDailyReset({ ...task, is_completed: false }, "2026-09-24"), false);
});

test("같은 할 일의 실행 기록은 날짜마다 완료 한 건으로 묶는다", async () => {
  const { completionRecordsFromExecutions } = await dailyCompletion();
  const logs = [
    { task_id: 7, start_time: "2026-09-22T01:00:00Z", end_time: "2026-09-22T02:00:00Z" },
    { task_id: 7, start_time: "2026-09-22T03:00:00Z", end_time: "2026-09-22T04:00:00Z" },
    { task_id: 7, start_time: "2026-09-23T01:00:00Z", end_time: "2026-09-23T02:00:00Z" },
  ];
  const records = completionRecordsFromExecutions(logs);
  assert.deepEqual(records.map((record) => record.completed_day), ["2026-09-23", "2026-09-22"]);
  assert.deepEqual(records.map((record) => record.task_id), [7, 7]);
});

test("돌아보기 완료 수는 집계 기간의 실행 기록으로 만든 완료를 합산한다", async () => {
  const { completionRecordsFromExecutions } = await dailyCompletion();
  const logs = [
    { task_id: 7, start_time: "2026-09-21T01:00:00Z", end_time: "2026-09-21T02:00:00Z" },
    { task_id: 7, start_time: "2026-09-22T01:00:00Z", end_time: "2026-09-22T02:00:00Z" },
    { task_id: 7, start_time: "2026-09-23T01:00:00Z", end_time: "2026-09-23T02:00:00Z" },
    { task_id: 8, start_time: "2026-09-24T01:00:00Z", end_time: "2026-09-24T02:00:00Z" },
  ];
  const records = completionRecordsFromExecutions(logs, "2026-09-22", "2026-09-23");
  assert.deepEqual(records.map((record) => record.completed_day), ["2026-09-23", "2026-09-22"]);
  assert.deepEqual(records.map((record) => record.task_id), [7, 7]);
});

test("실제 시간은 집계 기간의 실행 기록만 날짜별 합산 대상으로 사용한다", async () => {
  const { executionLogsInPeriod } = await dailyCompletion();
  const logs = [
    { id: 1, start_time: "2026-09-21T01:00:00Z", actual_minutes: 10 },
    { id: 2, start_time: "2026-09-22T01:00:00Z", actual_minutes: 30 },
    { id: 3, start_time: "2026-09-22T03:00:00Z", actual_minutes: 40 },
    { id: 4, start_time: "2026-09-23T01:00:00Z", actual_minutes: 50 },
    { id: 5, start_time: "2026-09-24T01:00:00Z", actual_minutes: 60 },
  ];
  const records = executionLogsInPeriod(logs, "2026-09-22", "2026-09-23");
  assert.deepEqual(records.map((record) => record.id), [4, 3, 2]);
  assert.equal(records.reduce((sum, record) => sum + record.actual_minutes, 0), 120);
});

test("같은 할 일의 막힘 이유도 실행 기록마다 각각 센다", async () => {
  const { blockerRecordsFromExecutions } = await dailyCompletion();
  const logs = [
    { id: 1, task_id: 7, start_time: "2026-09-22T01:00:00Z", blocker_reason: "자료를 찾지 못함" },
    { id: 2, task_id: 7, start_time: "2026-09-22T03:00:00Z", blocker_reason: "환경 설정 오류" },
    { id: 3, task_id: 7, start_time: "2026-09-23T01:00:00Z", blocker_reason: "없음" },
    { id: 4, task_id: 8, start_time: "2026-09-23T03:00:00Z", blocker_reason: "로그인 실패" },
    { id: 5, task_id: 9, start_time: "2026-09-24T01:00:00Z", blocker_reason: "기간 밖 기록" },
  ];
  assert.deepEqual(blockerRecordsFromExecutions(logs, "2026-09-22", "2026-09-23"), [
    { id: 4, task_id: 8, blocked_day: "2026-09-23", blocked_at: "2026-09-23T03:00:00Z", blocker_reason: "로그인 실패" },
    { id: 2, task_id: 7, blocked_day: "2026-09-22", blocked_at: "2026-09-22T03:00:00Z", blocker_reason: "환경 설정 오류" },
    { id: 1, task_id: 7, blocked_day: "2026-09-22", blocked_at: "2026-09-22T01:00:00Z", blocker_reason: "자료를 찾지 못함" },
  ]);
});

test("한 할 일의 막힘 기록이 네 건이면 막힘 수도 네 건이다", async () => {
  const { blockerRecordsFromExecutions } = await dailyCompletion();
  const logs = Array.from({ length: 4 }, (_, index) => ({
    id: index + 1,
    task_id: 7,
    start_time: `2026-09-2${index + 1}T01:00:00Z`,
    blocker_reason: `막힘 이유 ${index + 1}`,
  }));
  assert.equal(blockerRecordsFromExecutions(logs, "2026-09-21", "2026-09-24").length, 4);
});

test("실행 기록이 있는 날짜에만 해당 할 일이 자동 완료된다", async () => {
  const { taskHasExecutionForDate } = await dailyCompletion();
  const log = { id: 1, task_id: 7, start_time: "2026-09-23T01:00:00Z" };
  assert.equal(taskHasExecutionForDate([log], 7, "2026-09-23"), true);
  assert.equal(taskHasExecutionForDate([log], 7, "2026-09-22"), false);
  assert.equal(taskHasExecutionForDate([], 7, "2026-09-23"), false);
});

test("주간 칸의 완료와 실행 시간은 같은 실행 기록에서 계산한다", async () => {
  const { weeklyDayRecord } = await dailyCompletion();
  const date = "2026-09-23";
  const first = { task_id: 7, start_time: "2026-09-23T01:05:00Z", actual_minutes: 40 };
  const second = { task_id: 7, start_time: "2026-09-23T03:05:00Z", actual_minutes: 49 };
  const otherTask = { task_id: 8, start_time: "2026-09-23T05:05:00Z", actual_minutes: 11 };
  assert.deepEqual(weeklyDayRecord([], date), {
    completionCount: 0, executionCount: 0, minutes: 0,
  });
  assert.deepEqual(weeklyDayRecord([first, second], date), {
    completionCount: 1, executionCount: 2, minutes: 89,
  });
  assert.deepEqual(weeklyDayRecord([first, second, otherTask], date), {
    completionCount: 2, executionCount: 3, minutes: 100,
  });
  assert.deepEqual(weeklyDayRecord([first], "2026-09-22"), {
    completionCount: 0, executionCount: 0, minutes: 0,
  });
});

test("완료 체크는 직접 조작할 수 없고 실행 기록에 따라 렌더링한다", () => {
  const app = read("public/app.js");
  assert.match(app, /const completed = todayExecutionLogs\.length > 0/);
  assert.match(app, /title="완료 상태는 오늘 실행 기록에 따라 자동으로 정해집니다\."[\s\S]*?disabled/);
  assert.doesNotMatch(app, /data-action="toggle-task"/);
  assert.doesNotMatch(app, /addEventListener\("change"[\s\S]*?toggle-task/);
  assert.match(app, /completionRecordsFromExecutions\(state\.taskExecutions, plan\.start_date, plan\.end_date\)/);
  assert.match(app, /weeklyDayRecord\(state\.taskExecutions, iso\)/);
});

test("실행 기록 변경 직후 주간과 할 일과 돌아보기를 함께 갱신한다", () => {
  const app = read("public/app.js");
  assert.match(app, /state\.taskExecutions = state\.taskExecutions\.filter[\s\S]*?renderWeek\(\);[\s\S]*?renderTasks\(\);[\s\S]*?renderCompletionSummary\(\)/);
  assert.match(app, /state\.taskExecutions\.unshift\(saved\)[\s\S]*?renderWeek\(\);[\s\S]*?renderTasks\(\);[\s\S]*?renderCompletionSummary\(\)/);
  assert.match(app, /document\.addEventListener\("visibilitychange"/);
  assert.match(app, /await resetExpiredTaskCompletions\(toSeoulISODate\(\)\)/);
});

test("기존 완료 이벤트 테이블은 소유자별로 보호한다", () => {
  for (const file of ["supabase/schema.sql", "supabase/daily-completion.sql"]) {
    const sql = read(file);
    assert.match(sql, /on public\.task_completion_events \(user_id, task_id, completed_day\)/);
  }
  assert.match(read("supabase/schema.sql"), /create policy "owner task completion events read"/);
});
