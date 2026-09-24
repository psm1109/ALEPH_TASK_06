import { toSeoulISODate } from "./daily-completion.mjs";

function nextISODate(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function missedDaysToRecord(
  tasks, completionEvents, recordedDays, today, workspaceId, { startDate = "", endDate = "" } = {},
) {
  const completed = new Set(completionEvents.map((event) =>
    `${event.task_id}:${event.completed_day || toSeoulISODate(event.completed_at)}`));
  const recorded = new Set(recordedDays.map((event) => `${event.task_id}:${event.missed_day}`));
  const pending = [];

  for (const task of tasks) {
    const createdDay = toSeoulISODate(task.created_at);
    const firstDay = startDate || createdDay;
    if (!firstDay) continue;
    // The review treats the current task list as the plan's daily target, so
    // every plan day through today must use the same task count.
    for (let day = firstDay; day <= today && (!endDate || day <= endDate); day = nextISODate(day)) {
      const key = `${task.id}:${day}`;
      if (completed.has(key) || recorded.has(key)) continue;
      pending.push({
        workspace_id: workspaceId,
        task_id: task.id,
        missed_day: day,
        task_title: task.title,
        due_date: task.due_date,
      });
      recorded.add(key);
    }
  }

  return pending;
}
