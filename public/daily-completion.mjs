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

export function completedTaskIdsForDate(events, tasks, date, today = toSeoulISODate()) {
  // Today's display follows the current checkbox state. A completion event
  // becomes historical evidence only after that Seoul calendar day ends.
  if (date === today) {
    return new Set(tasks
      .filter((task) => isTaskCompletedToday(task, today))
      .map((task) => String(task.id)));
  }

  const ids = new Set(events
    .filter((event) => (event.completed_day || toSeoulISODate(event.completed_at)) === date)
    .map((event) => String(event.task_id)));
  return ids;
}

export function completionEventsForPeriod(events, startDate, endDate) {
  if (!startDate || !endDate) return [];
  return events
    .map((event) => ({
      ...event,
      completed_day: event.completed_day || toSeoulISODate(event.completed_at),
    }))
    .filter((event) => event.completed_day >= startDate && event.completed_day <= endDate)
    .sort((a, b) => {
      const dayOrder = b.completed_day.localeCompare(a.completed_day);
      if (dayOrder) return dayOrder;
      return new Date(b.completed_at || 0) - new Date(a.completed_at || 0);
    });
}

export function weeklyDayRecord(events, tasks, executionLogs, date, today = toSeoulISODate()) {
  const completionCount = completedTaskIdsForDate(events, tasks, date, today).size;
  const entries = executionLogs.filter((log) => toSeoulISODate(log.start_time) === date);
  return {
    completionCount,
    executionCount: entries.length,
    minutes: entries.reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0),
  };
}
