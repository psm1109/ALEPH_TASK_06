const WORKSPACE_ID = "ccna-main";

const initialPlan = {
  id: "preview-v1",
  workspace_id: WORKSPACE_ID,
  version: 1,
  title: "CCNA 취득",
  start_date: "2026-09-21",
  end_date: "2026-11-01",
  priority: "high",
  success_criteria: "CCNA 자격증 취득",
  expected_days: 40,
  created_at: "2026-09-21T00:00:00+09:00",
};

const initialTaskSeeds = [
  { seed_key: "jeremy-it-lab", title: "Jeremy’s IT Lab 유튜브 강의 Day 할당량 시청", due_date: "2026-11-01", priority: "high", tags: ["강의", "유튜브"], estimated_minutes: 60 },
  { seed_key: "lab-practice", title: "Lab 실습하기", due_date: "2026-11-01", priority: "high", tags: ["실습"], estimated_minutes: 90 },
  { seed_key: "exam-simulator", title: "CCNA Exam Simulator 문제 풀기", due_date: "2026-11-01", priority: "high", tags: ["문제풀이"], estimated_minutes: 60 },
  { seed_key: "anki-review", title: "오늘 배운 내용 Anki 카드로 복습하기", due_date: "2026-11-01", priority: "medium", tags: ["복습", "Anki"], estimated_minutes: 30 },
  { seed_key: "blog-review", title: "블로그에 배운 내용을 복습할 수 있도록 글로 정리하기", due_date: "2026-11-01", priority: "medium", tags: ["복습", "블로그"], estimated_minutes: 45 },
];

const previewTasks = initialTaskSeeds.map((task, index) => ({
  ...task,
  id: `preview-${index + 1}`,
  workspace_id: WORKSPACE_ID,
  plan_version: 1,
  is_completed: false,
  completed_at: null,
  created_at: initialPlan.created_at,
  updated_at: initialPlan.created_at,
}));

const state = {
  config: readConfig(),
  connected: false,
  loading: false,
  versions: [initialPlan],
  activities: [],
  reflections: [],
  tasks: previewTasks,
  taskExecutions: [],
  completionEvents: [],
  editingTaskId: null,
  executingTaskId: null,
  editingExecutionId: null,
  pendingTaskIds: new Set(),
  taskQuery: {
    search: "",
    status: "all",
    priority: "all",
    tag: "all",
    sort: "due_asc",
  },
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  connectionStatus: $("#connection-status"),
  connectionLabel: $("#connection-label"),
  notice: $("#notice"),
  planDialog: $("#plan-dialog"),
  activityDialog: $("#activity-dialog"),
  reflectionDialog: $("#reflection-dialog"),
  taskDialog: $("#task-dialog"),
  taskExecutionDialog: $("#task-execution-dialog"),
  planForm: $("#plan-form"),
  activityForm: $("#activity-form"),
  reflectionForm: $("#reflection-form"),
  taskForm: $("#task-form"),
  taskExecutionForm: $("#task-execution-form"),
};

function readConfig() {
  const embedded = window.__PDS_CONFIG__ ?? {};
  const config = normalizeConfig({
    url: embedded.supabaseUrl,
    publishableKey: embedded.supabasePublishableKey,
  });
  return config.url && config.publishableKey.startsWith("sb_publishable_") ? config : null;
}

function normalizeConfig(config) {
  return {
    url: String(config.url || "").trim().replace(/\/$/, ""),
    publishableKey: String(config.publishableKey || "").trim(),
  };
}

function hasConfig() {
  return Boolean(state.config?.url && state.config?.publishableKey);
}

async function supabaseRequest(table, { method = "GET", query = "", body } = {}) {
  if (!hasConfig()) throw new Error("Supabase 연결 정보가 필요합니다.");

  const response = await fetch(`${state.config.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: state.config.publishableKey,
      "Content-Type": "application/json",
      Prefer: ["POST", "PATCH"].includes(method) ? "return=representation" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.message || payload.hint || payload.details || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Supabase 요청에 실패했습니다. (${response.status})`);
  }

  if (response.status === 204) return [];
  return response.json();
}

async function connectAndLoad({ announce = true } = {}) {
  if (!hasConfig()) {
    setConnectionState("error", "Supabase 설정 누락");
    showNotice("Supabase 연결 설정이 없습니다. public/config.js에 Project URL과 sb_publishable_ 키를 입력해 주세요.", "error");
    return false;
  }

  setLoading(true);
  try {
    let versions = await supabaseRequest(
      "plan_versions",
      { query: `workspace_id=eq.${WORKSPACE_ID}&order=version.desc` },
    );

    if (!versions.length) {
      versions = await supabaseRequest("plan_versions", {
        method: "POST",
        body: [{
          workspace_id: WORKSPACE_ID,
          version: 1,
          title: initialPlan.title,
          start_date: initialPlan.start_date,
          end_date: initialPlan.end_date,
          priority: initialPlan.priority,
          success_criteria: initialPlan.success_criteria,
          expected_days: initialPlan.expected_days,
        }],
      });
    }

    let [activities, reflections, tasks, taskExecutions, completionEvents] = await Promise.all([
      supabaseRequest("activity_logs", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=activity_date.desc,created_at.desc`,
      }),
      supabaseRequest("reflections", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=reflection_date.desc,created_at.desc`,
      }),
      supabaseRequest("tasks", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=created_at.asc`,
      }),
      supabaseRequest("task_execution_logs", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=start_time.desc`,
      }),
      supabaseRequest("task_completion_events", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=completed_at.desc`,
      }),
    ]);

    if (!tasks.length) {
      const latestPlanVersion = versions[0]?.version || 1;
      tasks = await supabaseRequest("tasks", {
        method: "POST",
        body: initialTaskSeeds.map((task) => ({
          ...task,
          workspace_id: WORKSPACE_ID,
          plan_version: latestPlanVersion,
        })),
      });
    }

    state.versions = versions.sort((a, b) => b.version - a.version);
    state.activities = activities;
    state.reflections = reflections;
    state.tasks = tasks;
    state.taskExecutions = taskExecutions;
    state.completionEvents = completionEvents;
    state.connected = true;
    setConnectionState("connected", "Supabase 저장됨");
    if (announce) showNotice("Supabase에서 최신 기록을 불러왔습니다.", "success", 2800);
    renderAll();
    return true;
  } catch (error) {
    state.connected = false;
    setConnectionState("error", "Supabase 연결 실패");
    showNotice(`Supabase에 연결하지 못했습니다. ${error.message}`, "error");
    return false;
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  $$(`button[type="submit"], .modal .button.primary`).forEach((button) => {
    button.disabled = isLoading;
  });
}

function setConnectionState(status, label) {
  elements.connectionStatus.classList.toggle("is-connected", status === "connected");
  elements.connectionStatus.classList.toggle("is-error", status === "error");
  elements.connectionLabel.textContent = label;
}

let noticeTimer;
function showNotice(message, type = "warning", dismissAfter = 0) {
  clearTimeout(noticeTimer);
  elements.notice.textContent = message;
  elements.notice.className = `notice${type === "warning" ? "" : ` ${type}`}`;
  elements.notice.hidden = false;
  if (dismissAfter) {
    noticeTimer = setTimeout(() => { elements.notice.hidden = true; }, dismissAfter);
  }
}

function currentPlan() {
  return state.versions[0] || initialPlan;
}

function parseLocalDate(value) {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value, separator = ".") {
  const date = parseLocalDate(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join(separator);
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, "0")}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function calculateDDay(endDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = parseLocalDate(endDate);
  const days = Math.ceil((target - today) / 86400000);
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function getProgress(plan) {
  const completedDays = new Set(state.activities.map((item) => item.activity_date)).size;
  const percent = Math.min(100, Math.round((completedDays / plan.expected_days) * 100));
  return { completedDays, percent };
}

function renderPlan() {
  const plan = currentPlan();
  const { completedDays, percent } = getProgress(plan);
  $("#goal-title").textContent = plan.title;
  $("#task-plan-title").textContent = `${plan.title} 할 일`;
  $("#d-day").textContent = calculateDDay(plan.end_date);
  $("#date-range").textContent = `${formatDate(plan.start_date)} – ${formatDate(plan.end_date)}`;
  $("#success-criteria").textContent = plan.success_criteria;
  $("#expected-days").textContent = `${plan.expected_days}일`;
  $("#plan-version-chip").textContent = `v${plan.version}`;
  $("#progress-percent").textContent = `${percent}%`;
  $("#progress-ring").style.setProperty("--progress", percent);

  const priority = $("#priority");
  const priorityMap = { high: "높음", medium: "보통", low: "낮음" };
  priority.textContent = priorityMap[plan.priority] || plan.priority;
  priority.className = `priority ${plan.priority}`;

  $("#progress-caption").innerHTML = completedDays
    ? `${completedDays}일의 실행을 쌓았어요.<br />오늘도 흐름을 이어가요.`
    : "아직 시작하지 않았어요.<br />첫 걸음을 내디뎌요.";
}

function renderWeek() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = new Date(now);
  const day = monday.getDay();
  monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  $("#week-range").textContent = `${formatDate(toISODate(monday))} – ${formatDate(toISODate(sunday))}`;

  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
  const weekGrid = $("#week-grid");
  weekGrid.innerHTML = "";
  let weekEntryCount = 0;

  weekdays.forEach((weekday, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = toISODate(date);
    const entries = state.activities.filter((item) => item.activity_date === iso);
    const minutes = entries.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
    weekEntryCount += entries.length;
    const cell = document.createElement("div");
    cell.className = `day-cell${entries.length ? " has-entry" : ""}`;
    cell.innerHTML = `<strong>${date.getMonth() + 1}.${date.getDate()}<br />(${weekday})</strong><span class="day-dot">${entries.length ? "✓" : ""}</span><small>${minutes ? `${minutes}분` : "-"}</small>`;
    weekGrid.append(cell);
  });

  $("#week-empty").hidden = weekEntryCount > 0;
}

function renderTaskTagFilter() {
  const select = $("#task-tag-filter");
  const tags = [...new Set(state.tasks.flatMap((task) => Array.isArray(task.tags) ? task.tags : []))]
    .sort((a, b) => a.localeCompare(b, "ko"));
  select.innerHTML = '<option value="all">전체 태그</option>' + tags
    .map((tag) => `<option value="${escapeHTML(tag)}">${escapeHTML(tag)}</option>`)
    .join("");
  if (tags.includes(state.taskQuery.tag)) select.value = state.taskQuery.tag;
  else {
    state.taskQuery.tag = "all";
    select.value = "all";
  }
}

function filteredAndSortedTasks() {
  const query = state.taskQuery;
  const search = query.search.trim().toLocaleLowerCase("ko");
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const comparators = {
    due_asc: (a, b) => String(a.due_date).localeCompare(String(b.due_date)),
    priority_desc: (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority],
    created_desc: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    estimated_asc: (a, b) => Number(a.estimated_minutes) - Number(b.estimated_minutes),
    estimated_desc: (a, b) => Number(b.estimated_minutes) - Number(a.estimated_minutes),
    title_asc: (a, b) => a.title.localeCompare(b.title, "ko"),
  };

  return state.tasks
    .filter((task) => {
      const searchable = `${task.title} ${(task.tags || []).join(" ")}`.toLocaleLowerCase("ko");
      if (search && !searchable.includes(search)) return false;
      if (query.status === "active" && task.is_completed) return false;
      if (query.status === "completed" && !task.is_completed) return false;
      if (query.priority !== "all" && task.priority !== query.priority) return false;
      if (query.tag !== "all" && !(task.tags || []).includes(query.tag)) return false;
      return true;
    })
    .sort((a, b) => {
      const primary = (comparators[query.sort] || comparators.due_asc)(a, b);
      return primary || Number(a.id) - Number(b.id) || String(a.id).localeCompare(String(b.id));
    });
}

function formatMinutes(value) {
  const minutes = Number(value);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`;
}

function isOverdue(task) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return !task.is_completed && parseLocalDate(task.due_date) < today;
}

function renderTasks() {
  renderTaskTagFilter();
  const tasks = filteredAndSortedTasks();
  const completedCount = state.tasks.filter((task) => task.is_completed).length;
  const sortLabels = {
    due_asc: "마감 임박순",
    priority_desc: "우선순위 높은 순",
    created_desc: "최근 등록순",
    estimated_asc: "예상 시간 짧은 순",
    estimated_desc: "예상 시간 긴 순",
    title_asc: "이름 가나다순",
  };

  $("#task-progress-count").textContent = `${completedCount} / ${state.tasks.length} 완료`;
  $("#task-result-count").textContent = `검색 결과 ${tasks.length}개`;
  $("#active-sort-label").textContent = sortLabels[state.taskQuery.sort];
  $("#task-sort").value = state.taskQuery.sort;
  $("#task-status-filter").value = state.taskQuery.status;
  $("#task-priority-filter").value = state.taskQuery.priority;

  const list = $("#task-list");
  if (!tasks.length) {
    list.innerHTML = '<div class="task-empty"><strong>조건에 맞는 할 일이 없어요</strong><p>검색어나 필터 조건을 바꿔 보세요.</p></div>';
    return;
  }

  list.innerHTML = tasks.map((task) => {
    const taskId = escapeHTML(task.id);
    const tags = (task.tags || []).map((tag) => `<span class="task-tag">#${escapeHTML(tag)}</span>`).join("");
    const overdue = isOverdue(task);
    const executionLogs = state.taskExecutions.filter((log) => String(log.task_id) === String(task.id));
    const linkedLogs = executionLogs.length ? `
      <details class="task-linked-logs">
        <summary>이 할 일의 실행 기록 ${executionLogs.length}건</summary>
        <div class="task-linked-log-list">
          ${executionLogs.map((log) => `
            <div class="task-linked-log">
              <div><strong>${formatTimestamp(log.start_time)} → ${formatTimestamp(log.end_time)} · ${formatMinutes(log.actual_minutes)}</strong><br />
              막힌 이유 · ${escapeHTML(log.blocker_reason || "없음")}</div>
              <div class="execution-actions">
                <button class="execution-action" type="button" data-action="edit-execution" data-execution-id="${escapeHTML(log.id)}">수정</button>
                <button class="execution-action delete" type="button" data-action="delete-execution" data-execution-id="${escapeHTML(log.id)}">삭제</button>
              </div>
            </div>
          `).join("")}
        </div>
      </details>
    ` : "";
    return `
      <article class="task-item${task.is_completed ? " is-completed" : ""}">
        <input
          class="task-check"
          type="checkbox"
          data-action="toggle-task"
          data-task-id="${taskId}"
          aria-label="${task.is_completed ? "진행 중으로 되돌리기" : "완료로 변경"}: ${escapeHTML(task.title)}"
          ${task.is_completed ? "checked" : ""}
          ${state.pendingTaskIds.has(String(task.id)) ? "disabled" : ""}
        />
        <div class="task-main">
          <h3 class="task-title">${escapeHTML(task.title)}</h3>
          <div class="task-meta">
            <span class="priority ${task.priority}">${priorityLabel(task.priority)}</span>
            <span class="${overdue ? "due-overdue" : ""}">▣ ${formatDate(task.due_date)}${overdue ? " · 지남" : ""}</span>
            <span>◷ ${formatMinutes(task.estimated_minutes)}</span>
            ${tags}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-icon-button record" type="button" data-action="record-execution" data-task-id="${taskId}" aria-label="실행 기록 남기기: ${escapeHTML(task.title)}">기록</button>
          <button class="task-icon-button" type="button" data-action="edit-task" data-task-id="${taskId}" aria-label="할 일 수정: ${escapeHTML(task.title)}">수정</button>
          <button class="task-icon-button delete" type="button" data-action="delete-task" data-task-id="${taskId}" aria-label="할 일 삭제: ${escapeHTML(task.title)}">삭제</button>
        </div>
        ${linkedLogs}
      </article>
    `;
  }).join("");
}

function taskTitle(taskId) {
  return findTask(taskId)?.title || "삭제된 할 일";
}

function renderTaskExecutions() {
  $("#execution-log-count").textContent = `${state.taskExecutions.length}건`;
  const list = $("#all-task-execution-list");
  if (!state.taskExecutions.length) {
    list.innerHTML = '<div class="task-empty"><strong>아직 할 일 실행 기록이 없어요</strong><p>할 일의 ‘기록’ 버튼에서 실제 실행 시간을 남겨보세요.</p></div>';
    return;
  }

  list.innerHTML = state.taskExecutions.map((log) => `
    <article class="linked-log-card">
      <div><h3>${escapeHTML(taskTitle(log.task_id))}</h3><p>할 일 #${escapeHTML(log.task_id)}에 연결된 기록</p></div>
      <div class="linked-log-time">
        <span>${formatTimestamp(log.start_time)} → ${formatTimestamp(log.end_time)}</span>
        <strong>실제 소요 ${formatMinutes(log.actual_minutes)}</strong>
        <span>막힌 이유 · ${escapeHTML(log.blocker_reason || "없음")}</span>
      </div>
      <div class="execution-actions">
        <button class="execution-action" type="button" data-action="edit-execution" data-execution-id="${escapeHTML(log.id)}">수정</button>
        <button class="execution-action delete" type="button" data-action="delete-execution" data-execution-id="${escapeHTML(log.id)}">삭제</button>
      </div>
    </article>
  `).join("");
}

function renderCompletionSummary() {
  const totalMinutes = state.taskExecutions.reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0);
  $("#see-completion-count").textContent = state.completionEvents.length;
  $("#see-execution-count").textContent = state.taskExecutions.length;
  $("#see-actual-time").textContent = formatMinutes(totalMinutes || 0);

  const list = $("#completion-event-list");
  if (!state.completionEvents.length) {
    list.innerHTML = '<div class="task-empty"><strong>아직 완료 기록이 없어요</strong><p>할 일을 완료하면 항목별로 한 번만 집계됩니다.</p></div>';
    return;
  }
  list.innerHTML = state.completionEvents.map((event) => `
    <div class="completion-event"><strong>✓ ${escapeHTML(taskTitle(event.task_id))}</strong><time>${formatTimestamp(event.completed_at)}</time></div>
  `).join("");
}

function renderTimeline() {
  const timeline = $("#history-timeline");
  timeline.innerHTML = "";
  state.versions.slice(0, 3).forEach((version, index) => {
    const item = document.createElement("div");
    item.className = `timeline-item${index === 0 ? " current" : ""}`;
    const first = version.version === 1;
    item.innerHTML = `
      <div class="timeline-top"><span><span class="lock">${first ? "▣" : "◆"}</span> v${version.version} · ${first ? "최초 작성" : "계획 수정"}</span>${index === 0 ? "<span>현재</span>" : ""}</div>
      <p>${escapeHTML(version.title)}</p>
      <small>${formatTimestamp(version.created_at) || formatDate(version.start_date)}</small>
    `;
    timeline.append(item);
  });
}

function renderActivities() {
  const list = $("#activity-list");
  if (!state.activities.length) {
    list.innerHTML = emptyState("▷", "아직 실행 기록이 없어요", "오늘 실천한 학습을 첫 기록으로 남겨보세요.");
    return;
  }

  list.innerHTML = state.activities.map((item) => `
    <article class="record-card">
      <span class="record-icon" aria-hidden="true">✓</span>
      <div class="record-copy"><h3>${formatDate(item.activity_date)} · ${Number(item.minutes)}분</h3><p>${escapeHTML(item.note)}</p></div>
      <div class="record-meta">계획 v${item.plan_version}<br />${formatTimestamp(item.created_at)}</div>
    </article>
  `).join("");
}

function renderReflections() {
  const list = $("#reflection-list");
  if (!state.reflections.length) {
    list.innerHTML = emptyState("◌", "아직 작성한 회고가 없어요", "잘한 점과 다음 행동을 정리해 보세요.");
    return;
  }

  const moodMap = { great: "아주 좋아요", good: "좋아요", okay: "보통이에요", hard: "아쉬워요" };
  list.innerHTML = state.reflections.map((item) => `
    <article class="record-card">
      <span class="record-icon" aria-hidden="true">◌</span>
      <div class="record-copy">
        <h3>${formatDate(item.reflection_date)} · ${moodMap[item.mood] || item.mood}</h3>
        <p><strong>잘한 점</strong> · ${escapeHTML(item.went_well)}<br /><strong>다음 행동</strong> · ${escapeHTML(item.next_action)}</p>
      </div>
      <div class="record-meta">계획 v${item.plan_version}<br />${formatTimestamp(item.created_at)}</div>
    </article>
  `).join("");
}

function renderFullHistory() {
  const list = $("#full-history");
  list.innerHTML = state.versions.map((version, index) => `
    <article class="version-card${index === 0 ? " current" : ""}">
      <span class="version-number">v${version.version}</span>
      <div class="version-content">
        <h3>${escapeHTML(version.title)} ${version.version === 1 ? '<span class="version-chip">최초 계획</span>' : ""}</h3>
        <div class="version-specs">
          <span>${formatDate(version.start_date)} – ${formatDate(version.end_date)}</span>
          <span>우선순위 ${priorityLabel(version.priority)}</span>
          <span>예상 ${version.expected_days}일</span>
          <span>성공 기준 · ${escapeHTML(version.success_criteria)}</span>
        </div>
      </div>
      <time class="record-meta">${formatTimestamp(version.created_at) || "미연결 미리보기"}</time>
    </article>
  `).join("");
}

function priorityLabel(value) {
  return ({ high: "높음", medium: "보통", low: "낮음" })[value] || value;
}

function emptyState(icon, title, description) {
  return `<div class="empty-state"><span aria-hidden="true">${icon}</span><h3>${title}</h3><p>${description}</p></div>`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function renderAll() {
  renderPlan();
  renderWeek();
  renderTasks();
  renderTaskExecutions();
  renderCompletionSummary();
  renderTimeline();
  renderActivities();
  renderReflections();
  renderFullHistory();
}

function switchView(view) {
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `${view}-view`));
  $$(".journey-step").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  $$(".nav-item").forEach((button) => button.classList.remove("is-active"));
  const matchingNav = $(`.nav-item[data-view="${view}"]`);
  if (matchingNav) matchingNav.classList.add("is-active");
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillPlanForm() {
  const plan = currentPlan();
  elements.planForm.elements.title.value = plan.title;
  elements.planForm.elements.start_date.value = plan.start_date;
  elements.planForm.elements.end_date.value = plan.end_date;
  elements.planForm.elements.priority.value = plan.priority;
  elements.planForm.elements.expected_days.value = plan.expected_days;
  elements.planForm.elements.success_criteria.value = plan.success_criteria;
}

function findTask(taskId) {
  return state.tasks.find((task) => String(task.id) === String(taskId));
}

function findExecutionLog(executionId) {
  return state.taskExecutions.find((log) => String(log.id) === String(executionId));
}

function parseTags(value) {
  return [...new Set(String(value || "")
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, ""))
    .filter(Boolean))]
    .slice(0, 10);
}

function openTaskDialog(task = null) {
  if (!requireConnection()) return;
  state.editingTaskId = task?.id ?? null;
  elements.taskForm.reset();
  $("#task-dialog-title").textContent = task ? "할 일 수정" : "할 일 만들기";
  $("#save-task-button").textContent = task ? "변경 내용 저장" : "할 일 저장";
  elements.taskForm.elements.title.value = task?.title || "";
  elements.taskForm.elements.due_date.value = task?.due_date || currentPlan().end_date;
  elements.taskForm.elements.priority.value = task?.priority || "medium";
  elements.taskForm.elements.estimated_minutes.value = task?.estimated_minutes || 60;
  elements.taskForm.elements.tags.value = (task?.tags || []).join(", ");
  elements.taskDialog.showModal();
}

function toDateTimeLocalValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function executionMinutesFromForm() {
  const start = new Date(elements.taskExecutionForm.elements.start_time.value);
  const end = new Date(elements.taskExecutionForm.elements.end_time.value);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function updateExecutionDurationPreview() {
  const minutes = executionMinutesFromForm();
  elements.taskExecutionForm.elements.actual_minutes.value = minutes ? formatMinutes(minutes) : "시간을 확인해 주세요";
}

function openTaskExecutionDialog(task, executionLog = null) {
  if (!task || !requireConnection()) return;
  state.executingTaskId = task.id;
  state.editingExecutionId = executionLog?.id ?? null;
  elements.taskExecutionForm.reset();
  const end = executionLog ? new Date(executionLog.end_time) : new Date();
  const start = executionLog ? new Date(executionLog.start_time) : new Date(end.getTime() - 60 * 60000);
  elements.taskExecutionForm.elements.start_time.value = toDateTimeLocalValue(start);
  elements.taskExecutionForm.elements.end_time.value = toDateTimeLocalValue(end);
  elements.taskExecutionForm.elements.blocker_reason.value = executionLog?.blocker_reason || "";
  $("#task-execution-dialog-title").textContent = executionLog ? "실행 기록 수정" : "실행 기록 남기기";
  $("#save-task-execution-button").textContent = executionLog ? "변경 내용 저장" : "실행 기록 저장";
  $("#execution-task-title").textContent = `“${task.title}”에 연결되는 기록입니다.`;
  updateExecutionDurationPreview();
  elements.taskExecutionDialog.showModal();
}

function handleExecutionAction(button) {
  const executionLog = findExecutionLog(button.dataset.executionId);
  if (!executionLog) return;
  if (button.dataset.action === "edit-execution") {
    openTaskExecutionDialog(findTask(executionLog.task_id), executionLog);
  }
  if (button.dataset.action === "delete-execution") {
    void deleteExecutionLog(executionLog);
  }
}

async function deleteExecutionLog(executionLog) {
  if (!requireConnection()) return;
  const task = findTask(executionLog.task_id);
  if (!window.confirm(`“${task?.title || "할 일"}”의 실행 기록을 삭제할까요?\n삭제한 기록은 되돌릴 수 없습니다.`)) return;

  setLoading(true);
  try {
    await supabaseRequest("task_execution_logs", {
      method: "DELETE",
      query: `id=eq.${encodeURIComponent(executionLog.id)}&workspace_id=eq.${WORKSPACE_ID}`,
    });
    state.taskExecutions = state.taskExecutions.filter((log) => String(log.id) !== String(executionLog.id));
    renderTasks();
    renderTaskExecutions();
    renderCompletionSummary();
    showNotice("실행 기록을 삭제했습니다. 원래 계획과 할 일은 변경되지 않았습니다.", "success", 3200);
  } catch (error) {
    showNotice(`실행 기록을 삭제하지 못했습니다. ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function refreshCompletionEvents() {
  state.completionEvents = await supabaseRequest("task_completion_events", {
    query: `workspace_id=eq.${WORKSPACE_ID}&order=completed_at.desc`,
  });
  renderCompletionSummary();
}

async function updateTask(taskId, changes, successMessage) {
  setLoading(true);
  try {
    const [saved] = await supabaseRequest("tasks", {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(taskId)}&workspace_id=eq.${WORKSPACE_ID}`,
      body: { ...changes, updated_at: new Date().toISOString() },
    });
    if (!saved) throw new Error("변경된 할 일을 찾지 못했습니다.");
    state.tasks = state.tasks.map((task) => String(task.id) === String(taskId) ? saved : task);
    renderTasks();
    showNotice(successMessage, "success", 2600);
    return saved;
  } catch (error) {
    renderTasks();
    showNotice(`할 일을 변경하지 못했습니다. ${error.message}`, "error");
    return null;
  } finally {
    setLoading(false);
  }
}

async function deleteTask(taskId) {
  const task = findTask(taskId);
  if (!task || !requireConnection()) return;
  if (!window.confirm(`“${task.title}” 할 일을 삭제할까요?\n삭제한 할 일은 되돌릴 수 없습니다.`)) return;

  setLoading(true);
  try {
    await supabaseRequest("tasks", {
      method: "DELETE",
      query: `id=eq.${encodeURIComponent(taskId)}&workspace_id=eq.${WORKSPACE_ID}`,
    });
    state.tasks = state.tasks.filter((item) => String(item.id) !== String(taskId));
    state.taskExecutions = state.taskExecutions.filter((log) => String(log.task_id) !== String(taskId));
    state.completionEvents = state.completionEvents.filter((event) => String(event.task_id) !== String(taskId));
    renderAll();
    showNotice("할 일을 삭제했습니다.", "success", 2600);
  } catch (error) {
    showNotice(`할 일을 삭제하지 못했습니다. ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function requireConnection() {
  if (state.connected) return true;
  showNotice("기록을 저장할 수 없습니다. public/config.js의 Supabase 설정과 연결 상태를 확인해 주세요.", "error");
  return false;
}

function bindEvents() {
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
    button.closest("dialog")?.close();
  }));
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-open-activity]').forEach((button) => button.addEventListener("click", () => {
    if (!requireConnection()) return;
    elements.activityForm.reset();
    elements.activityForm.elements.activity_date.value = toISODate(new Date());
    elements.activityForm.elements.minutes.value = 60;
    elements.activityDialog.showModal();
  }));

  $("#edit-plan-button").addEventListener("click", () => {
    if (!requireConnection()) return;
    fillPlanForm();
    elements.planDialog.showModal();
  });
  $("#add-reflection-button").addEventListener("click", () => {
    if (!requireConnection()) return;
    elements.reflectionForm.reset();
    elements.reflectionForm.elements.reflection_date.value = toISODate(new Date());
    elements.reflectionDialog.showModal();
  });
  $("#add-task-button").addEventListener("click", () => openTaskDialog());

  $("#task-search").addEventListener("input", (event) => {
    state.taskQuery.search = event.target.value;
    renderTasks();
  });
  $("#task-status-filter").addEventListener("change", (event) => {
    state.taskQuery.status = event.target.value;
    renderTasks();
  });
  $("#task-priority-filter").addEventListener("change", (event) => {
    state.taskQuery.priority = event.target.value;
    renderTasks();
  });
  $("#task-tag-filter").addEventListener("change", (event) => {
    state.taskQuery.tag = event.target.value;
    renderTasks();
  });
  $("#task-sort").addEventListener("change", (event) => {
    state.taskQuery.sort = event.target.value;
    renderTasks();
  });

  $("#task-list").addEventListener("change", async (event) => {
    const checkbox = event.target.closest('[data-action="toggle-task"]');
    if (!checkbox) return;
    const task = findTask(checkbox.dataset.taskId);
    if (!task || !requireConnection()) {
      renderTasks();
      return;
    }
    const pendingId = String(task.id);
    if (state.pendingTaskIds.has(pendingId)) {
      renderTasks();
      return;
    }
    state.pendingTaskIds.add(pendingId);
    renderTasks();
    const completed = checkbox.checked;
    try {
      const saved = await updateTask(task.id, {
        is_completed: completed,
        completed_at: completed ? new Date().toISOString() : null,
      }, completed ? "할 일을 완료로 변경했습니다." : "할 일을 다시 진행 중으로 되돌렸습니다.");
      if (saved && completed) await refreshCompletionEvents();
    } catch (error) {
      showNotice(`완료 집계를 불러오지 못했습니다. ${error.message}`, "error");
    } finally {
      window.setTimeout(() => {
        state.pendingTaskIds.delete(pendingId);
        renderTasks();
      }, 700);
    }
  });

  $("#task-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.matches('input[type="checkbox"]')) return;
    if (["edit-execution", "delete-execution"].includes(button.dataset.action)) {
      handleExecutionAction(button);
      return;
    }
    const task = findTask(button.dataset.taskId);
    if (button.dataset.action === "record-execution" && task) openTaskExecutionDialog(task);
    if (button.dataset.action === "edit-task" && task) openTaskDialog(task);
    if (button.dataset.action === "delete-task") void deleteTask(button.dataset.taskId);
  });

  $("#all-task-execution-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) handleExecutionAction(button);
  });

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireConnection()) return;
    const data = Object.fromEntries(new FormData(elements.taskForm));
    const payload = {
      title: data.title.trim(),
      due_date: data.due_date,
      priority: data.priority,
      tags: parseTags(data.tags),
      estimated_minutes: Number(data.estimated_minutes),
    };

    if (state.editingTaskId !== null) {
      const saved = await updateTask(state.editingTaskId, payload, "할 일 내용을 수정했습니다.");
      if (saved) elements.taskDialog.close();
      return;
    }

    setLoading(true);
    try {
      const [saved] = await supabaseRequest("tasks", {
        method: "POST",
        body: [{
          ...payload,
          workspace_id: WORKSPACE_ID,
          plan_version: currentPlan().version,
          is_completed: false,
        }],
      });
      state.tasks.push(saved);
      elements.taskDialog.close();
      renderTasks();
      showNotice("새 할 일을 만들었습니다.", "success", 2600);
    } catch (error) {
      showNotice(`할 일을 만들지 못했습니다. ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  });

  ["start_time", "end_time"].forEach((name) => {
    elements.taskExecutionForm.elements[name].addEventListener("input", updateExecutionDurationPreview);
  });

  elements.taskExecutionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireConnection()) return;
    const task = findTask(state.executingTaskId);
    const minutes = executionMinutesFromForm();
    if (!task || !minutes) {
      showNotice("끝난 시각은 시작 시각보다 뒤여야 합니다.", "error");
      return;
    }

    const originalPlanSnapshot = JSON.stringify(currentPlan());
    const data = Object.fromEntries(new FormData(elements.taskExecutionForm));
    const payload = {
      start_time: new Date(data.start_time).toISOString(),
      end_time: new Date(data.end_time).toISOString(),
      actual_minutes: minutes,
      blocker_reason: data.blocker_reason.trim(),
    };
    const editingExecutionId = state.editingExecutionId;
    const editing = editingExecutionId !== null;
    setLoading(true);
    try {
      const [saved] = await supabaseRequest("task_execution_logs", editing ? {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(editingExecutionId)}&workspace_id=eq.${WORKSPACE_ID}`,
        body: payload,
      } : {
        method: "POST",
        body: [{ ...payload, workspace_id: WORKSPACE_ID, task_id: task.id }],
      });
      if (!saved) throw new Error("저장된 실행 기록을 찾지 못했습니다.");
      if (JSON.stringify(currentPlan()) !== originalPlanSnapshot) {
        throw new Error("원래 계획 값이 변경되어 저장을 중단했습니다.");
      }
      if (editing) {
        state.taskExecutions = state.taskExecutions.map((log) =>
          String(log.id) === String(editingExecutionId) ? saved : log,
        );
      } else {
        state.taskExecutions.unshift(saved);
      }
      state.editingExecutionId = null;
      state.executingTaskId = null;
      elements.taskExecutionDialog.close();
      renderTasks();
      renderTaskExecutions();
      renderCompletionSummary();
      showNotice(
        `${editing ? "실행 기록을 수정했습니다." : "실행 기록을 저장했습니다."} 원래 계획 값은 그대로 유지됩니다.`,
        "success",
        3600,
      );
    } catch (error) {
      showNotice(`실행 기록을 ${editing ? "수정" : "저장"}하지 못했습니다. ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  });

  elements.planForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!requireConnection()) return;
    const data = Object.fromEntries(new FormData(elements.planForm));
    if (data.end_date < data.start_date) {
      showNotice("마감일은 시작일보다 빠를 수 없습니다.", "error");
      return;
    }

    setLoading(true);
    try {
      const plan = {
        workspace_id: WORKSPACE_ID,
        version: currentPlan().version + 1,
        title: data.title.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        priority: data.priority,
        success_criteria: data.success_criteria.trim(),
        expected_days: Number(data.expected_days),
      };
      const [saved] = await supabaseRequest("plan_versions", { method: "POST", body: [plan] });
      state.versions.unshift(saved);
      elements.planDialog.close();
      renderAll();
      showNotice(`계획 v${saved.version}을 저장했습니다. 이전 버전은 그대로 보관됩니다.`, "success", 3800);
    } catch (error) {
      showNotice(`계획을 저장하지 못했습니다. ${error.message}`, "error");
      await connectAndLoad({ announce: false });
    } finally {
      setLoading(false);
    }
  });

  elements.activityForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!requireConnection()) return;
    const data = Object.fromEntries(new FormData(elements.activityForm));
    setLoading(true);
    try {
      const [saved] = await supabaseRequest("activity_logs", {
        method: "POST",
        body: [{
          workspace_id: WORKSPACE_ID,
          plan_version: currentPlan().version,
          activity_date: data.activity_date,
          minutes: Number(data.minutes),
          note: data.note.trim(),
        }],
      });
      state.activities.unshift(saved);
      elements.activityDialog.close();
      renderAll();
      showNotice("실행 기록을 저장했습니다.", "success", 2800);
    } catch (error) {
      showNotice(`실행 기록을 저장하지 못했습니다. ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  });

  elements.reflectionForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!requireConnection()) return;
    const data = Object.fromEntries(new FormData(elements.reflectionForm));
    setLoading(true);
    try {
      const [saved] = await supabaseRequest("reflections", {
        method: "POST",
        body: [{
          workspace_id: WORKSPACE_ID,
          plan_version: currentPlan().version,
          reflection_date: data.reflection_date,
          mood: data.mood,
          went_well: data.went_well.trim(),
          next_action: data.next_action.trim(),
        }],
      });
      state.reflections.unshift(saved);
      elements.reflectionDialog.close();
      renderAll();
      showNotice("회고를 저장했습니다.", "success", 2800);
    } catch (error) {
      showNotice(`회고를 저장하지 못했습니다. ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  });
}

function initialize() {
  bindEvents();
  renderAll();
  const route = location.hash.slice(1);
  if (["plan", "do", "see", "history"].includes(route)) switchView(route);
  connectAndLoad({ announce: false });
}

initialize();
