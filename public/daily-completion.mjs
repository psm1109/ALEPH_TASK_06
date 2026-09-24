export function toSeoulISODate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isTaskCompletedToday(task, today = toSeoulISODate()) {
  return task.is_completed === true && toSeoulISODate(task.completed_at) === today;
}

export function taskNeedsDailyReset(task, today = toSeoulISODate()) {
  return task.is_completed === true && !isTaskCompletedToday(task, today);
}

export function millisecondsUntilNextSeoulDay(now = new Date()) {
  const [year, month, day] = toSeoulISODate(now).split("-").map(Number);
  const nextMidnight = Date.UTC(year, month - 1, day + 1) - 9 * 60 * 60 * 1000;
  return Math.max(1000, nextMidnight - now.getTime() + 100);
}

export function taskHasExecutionForDate(executionLogs, taskId, date) {
  return executionLogs.some((log) => (
    String(log.task_id) === String(taskId) && toSeoulISODate(log.start_time) === date
  ));
}

export function completionRecordsFromExecutions(executionLogs, startDate = "", endDate = "") {
  const records = new Map();
  for (const log of executionLogs) {
    const completedDay = toSeoulISODate(log.start_time);
    if (!completedDay) continue;
    if (startDate && completedDay < startDate) continue;
    if (endDate && completedDay > endDate) continue;
    const key = `${String(log.task_id)}:${completedDay}`;
    const previous = records.get(key);
    if (!previous || new Date(log.end_time || log.start_time) > new Date(previous.completed_at)) {
      records.set(key, {
        task_id: log.task_id,
        completed_day: completedDay,
        completed_at: log.end_time || log.start_time,
      });
    }
  }
  return [...records.values()].sort((a, b) => {
    const dayOrder = b.completed_day.localeCompare(a.completed_day);
    if (dayOrder) return dayOrder;
    return new Date(b.completed_at || 0) - new Date(a.completed_at || 0);
  });
}

export function weeklyDayRecord(executionLogs, date) {
  const entries = executionLogs.filter((log) => toSeoulISODate(log.start_time) === date);
  return {
    completionCount: new Set(entries.map((log) => String(log.task_id))).size,
    executionCount: entries.length,
    minutes: entries.reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0),
  };
}
