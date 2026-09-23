import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";
import { encryptAuthCredentials } from "./auth-crypto.mjs";

const WORKSPACE_ID = "pds-main";
const EXPORT_SCHEMA_VERSION = "2.0.0";
const GENERIC_LOGIN_ERROR = "이메일 또는 비밀번호를 확인해 주세요.";

const state = {
  config: readConfig(),
  authClient: null,
  session: null,
  connected: false,
  loading: false,
  versions: [],
  reflections: [],
  tasks: [],
  taskExecutions: [],
  completionEvents: [],
  editingTaskId: null,
  editingExecutionId: null,
  editingReflectionId: null,
  seeEvidenceType: "planned",
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
  authScreen: $("#auth-screen"),
  authNotice: $("#auth-notice"),
  loginTab: $("#login-tab"),
  signupTab: $("#signup-tab"),
  loginForm: $("#login-form"),
  signupForm: $("#signup-form"),
  appShell: $("#app-shell"),
  signedInEmail: $("#signed-in-email"),
  logoutButton: $("#logout-button"),
  connectionStatus: $("#connection-status"),
  connectionLabel: $("#connection-label"),
  notice: $("#notice"),
  planDialog: $("#plan-dialog"),
  reflectionDialog: $("#reflection-dialog"),
  taskDialog: $("#task-dialog"),
  taskExecutionDialog: $("#task-execution-dialog"),
  planForm: $("#plan-form"),
  reflectionForm: $("#reflection-form"),
  taskForm: $("#task-form"),
  taskExecutionForm: $("#task-execution-form"),
  accountAccessBar: $("#account-access-bar"),
  exportDataButton: $("#export-data-button"),
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

async function requestProtectedAuth(mode, email, password) {
  const endpoint = `${state.config.url}/functions/v1/auth-gateway`;
  const headers = { apikey: state.config.publishableKey };
  const keyResponse = await fetch(endpoint, { headers, cache: "no-store" });
  if (!keyResponse.ok) throw new Error("인증 보호 키를 불러오지 못했습니다.");
  const { public_key: publicKey } = await keyResponse.json();
  if (!publicKey) throw new Error("인증 보호 키가 올바르지 않습니다.");

  const encrypted = await encryptAuthCredentials(publicKey, email, password);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...encrypted }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("인증 요청을 처리하지 못했습니다.");
  return payload;
}

async function persistProtectedSession(payload) {
  if (!payload.access_token || !payload.refresh_token) return null;
  const { data, error } = await state.authClient.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (error || !data.session) throw new Error("인증 세션을 저장하지 못했습니다.");
  return data.session;
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  elements.loginTab.classList.toggle("is-active", isLogin);
  elements.signupTab.classList.toggle("is-active", !isLogin);
  elements.loginTab.setAttribute("aria-selected", String(isLogin));
  elements.signupTab.setAttribute("aria-selected", String(!isLogin));
  elements.loginForm.hidden = !isLogin;
  elements.signupForm.hidden = isLogin;
  elements.authNotice.hidden = true;
  const firstInput = (isLogin ? elements.loginForm : elements.signupForm).elements.email;
  firstInput.focus({ preventScroll: true });
}

function showAuthNotice(message, type = "error") {
  elements.authNotice.textContent = message;
  elements.authNotice.className = `auth-notice${type === "success" ? " success" : ""}`;
  elements.authNotice.hidden = false;
}

function clearDiaryState() {
  state.connected = false;
  state.versions = [];
  state.reflections = [];
  state.tasks = [];
  state.taskExecutions = [];
  state.completionEvents = [];
  state.pendingTaskIds.clear();
}

function showSignedOutScreen(message = "") {
  state.session = null;
  clearDiaryState();
  elements.appShell.hidden = true;
  elements.authScreen.hidden = false;
  elements.loginForm.reset();
  elements.signupForm.reset();
  setAuthMode("login");
  if (message) showAuthNotice(message, "success");
}

async function showSignedInApp(session, { reload = true } = {}) {
  state.session = session;
  elements.signedInEmail.textContent = session.user.email || "로그인 사용자";
  elements.authScreen.hidden = true;
  elements.appShell.hidden = false;
  if (reload) await connectAndLoad({ announce: false });
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (!elements.loginForm.reportValidity() || !state.authClient) return;
  const formData = new FormData(elements.loginForm);
  setLoading(true);
  elements.authNotice.hidden = true;
  try {
    const payload = await requestProtectedAuth(
      "login",
      String(formData.get("email") || "").trim(),
      String(formData.get("password") || ""),
    );
    const session = await persistProtectedSession(payload);
    if (!session) {
      showAuthNotice(GENERIC_LOGIN_ERROR);
      return;
    }
    elements.loginForm.reset();
    await showSignedInApp(session);
    showNotice("로그인했습니다. 이 계정의 기록만 불러왔습니다.", "success", 3200);
  } catch {
    showAuthNotice(GENERIC_LOGIN_ERROR);
  } finally {
    elements.loginForm.elements.password.value = "";
    setLoading(false);
  }
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  if (!elements.signupForm.reportValidity() || !state.authClient) return;
  const formData = new FormData(elements.signupForm);
  const password = String(formData.get("password") || "");
  if (password !== String(formData.get("password_confirm") || "")) {
    elements.signupForm.elements.password.value = "";
    elements.signupForm.elements.password_confirm.value = "";
    showAuthNotice("비밀번호 확인 값이 서로 다릅니다.");
    return;
  }

  setLoading(true);
  elements.authNotice.hidden = true;
  try {
    const payload = await requestProtectedAuth(
      "signup",
      String(formData.get("email") || "").trim(),
      password,
    );
    const session = await persistProtectedSession(payload);

    elements.signupForm.reset();
    if (session) {
      await showSignedInApp(session);
      showNotice("계정을 만들고 로그인했습니다. 이제 내 기록만 저장됩니다.", "success", 3800);
      return;
    }

    setAuthMode("login");
    showAuthNotice("가입 요청을 처리했습니다. 받은 편지함에서 확인한 뒤 로그인해 주세요.", "success");
  } catch {
    showAuthNotice("가입 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    elements.signupForm.elements.password.value = "";
    elements.signupForm.elements.password_confirm.value = "";
    setLoading(false);
  }
}

async function handleLogout() {
  if (!state.authClient) return;
  elements.logoutButton.disabled = true;
  try {
    const { error } = await state.authClient.auth.signOut({ scope: "local" });
    if (error) throw error;
    showSignedOutScreen("로그아웃했습니다. 다시 로그인하기 전에는 자료를 열 수 없습니다.");
  } catch {
    showNotice("로그아웃하지 못했습니다. 네트워크 연결을 확인해 주세요.", "error");
  } finally {
    elements.logoutButton.disabled = false;
  }
}

async function supabaseRequest(table, { method = "GET", query = "", body } = {}) {
  if (!hasConfig()) throw new Error("Supabase 연결 정보가 필요합니다.");
  if (!state.session?.access_token) throw new Error("로그인이 필요합니다.");

  const response = await fetch(`${state.config.url}/functions/v1/diary-data/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: state.config.publishableKey,
      Authorization: `Bearer ${state.session.access_token}`,
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
    const versions = await supabaseRequest(
      "plan_versions",
      { query: `workspace_id=eq.${WORKSPACE_ID}&order=version.desc` },
    );

    const [reflections, tasks, taskExecutions, completionEvents] = await Promise.all([
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

    state.versions = versions.sort((a, b) => b.version - a.version);
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
  return state.versions[0] || null;
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

function toSeoulISODate(value = new Date()) {
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

function executionDate(executionLog) {
  return toSeoulISODate(executionLog.start_time);
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
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(date);
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Seoul" }).format(date);
}

function formatExecutionDate(value) {
  const date = parseLocalDate(value);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date);
  const todayLabel = value === toSeoulISODate() ? " · 오늘" : "";
  return `${formatDate(value)} (${weekday})${todayLabel}`;
}

function calculateDDay(endDate) {
  const today = parseLocalDate(toSeoulISODate());
  const target = parseLocalDate(endDate);
  const days = Math.ceil((target - today) / 86400000);
  if (days === 0) return "D-DAY";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

function getProgress(plan) {
  const completedDays = new Set(state.taskExecutions.map(executionDate).filter(Boolean)).size;
  const percent = Math.min(100, Math.round((completedDays / plan.expected_days) * 100));
  return { completedDays, percent };
}

function renderPlan() {
  const plan = currentPlan();
  const hasPlan = Boolean(plan);
  $$('[data-plan-required]').forEach((button) => {
    button.disabled = !hasPlan;
    button.title = hasPlan ? "" : "첫 계획을 먼저 세워 주세요.";
  });

  const planButton = $("#edit-plan-button");
  planButton.textContent = hasPlan ? "✎ 계획 수정" : "＋ 첫 계획 세우기";
  planButton.className = `button ${hasPlan ? "secondary" : "primary"}`;
  $("#plan-card-title").textContent = hasPlan ? "현재 계획" : "첫 계획 세우기";

  if (!plan) {
    $("#goal-title").textContent = "아직 세운 계획이 없어요";
    $("#task-plan-title").textContent = "계획을 세우면 할 일을 만들 수 있어요";
    $("#d-day").textContent = "-";
    $("#date-range").textContent = "-";
    $("#success-criteria").textContent = "직접 정해 주세요";
    $("#expected-days").textContent = "-";
    $("#plan-version-chip").textContent = "시작 전";
    $("#progress-percent").textContent = "0%";
    $("#progress-ring").style.setProperty("--progress", 0);
    $("#priority").textContent = "-";
    $("#priority").className = "priority";
    $("#plan-carryover").hidden = true;
    $("#plan-carryover-note").textContent = "";
    $("#progress-caption").innerHTML = "첫 계획을 세우면<br />기록을 시작할 수 있어요.";
    return;
  }

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

  const carryover = $("#plan-carryover");
  const carryoverNote = String(plan.carryover_note || "").trim();
  carryover.hidden = !carryoverNote;
  $("#plan-carryover-note").textContent = carryoverNote;

  $("#progress-caption").innerHTML = completedDays
    ? `${completedDays}일의 실행을 쌓았어요.<br />오늘도 흐름을 이어가요.`
    : "아직 시작하지 않았어요.<br />첫 걸음을 내디뎌요.";
}

function renderWeek() {
  const now = parseLocalDate(toSeoulISODate());
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
    const entries = state.taskExecutions.filter((item) => executionDate(item) === iso);
    const minutes = entries.reduce((sum, item) => sum + Number(item.actual_minutes || 0), 0);
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
  return !task.is_completed && String(task.due_date).slice(0, 10) < toSeoulISODate();
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
    list.innerHTML = currentPlan()
      ? '<div class="task-empty"><strong>조건에 맞는 할 일이 없어요</strong><p>새 할 일을 만들거나 검색·필터 조건을 바꿔 보세요.</p></div>'
      : '<div class="task-empty"><strong>첫 계획을 먼저 세워 주세요</strong><p>계획을 저장하면 그 계획에 연결할 할 일을 만들 수 있습니다.</p></div>';
    return;
  }

  list.innerHTML = tasks.map((task) => {
    const taskId = escapeHTML(task.id);
    const tags = (task.tags || []).map((tag) => `<span class="task-tag">#${escapeHTML(tag)}</span>`).join("");
    const overdue = isOverdue(task);
    const today = toSeoulISODate();
    const todayExecutionLogs = state.taskExecutions.filter((log) =>
      String(log.task_id) === String(task.id) && executionDate(log) === today,
    );
    const linkedLogs = todayExecutionLogs.length ? `
      <details class="task-linked-logs">
        <summary>오늘 실행 기록 ${todayExecutionLogs.length}건</summary>
        <div class="task-linked-log-list">
          ${todayExecutionLogs.map((log) => `
            <div class="task-linked-log">
              <div><strong>${formatTime(log.start_time)} → ${formatTime(log.end_time)} · ${formatMinutes(log.actual_minutes)}</strong><br />
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
    list.innerHTML = '<div class="task-empty"><strong>아직 실행 기록이 없어요</strong><p>상단의 ‘실행 기록’ 버튼에서 연결할 할 일을 선택해 보세요.</p></div>';
    return;
  }

  const groups = new Map();
  [...state.taskExecutions]
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .forEach((log) => {
      const date = executionDate(log);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(log);
    });
  const today = toISODate(new Date());

  list.innerHTML = [...groups.entries()].map(([date, logs]) => {
    const totalMinutes = logs.reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0);
    return `
      <details class="execution-date-group" ${date === today ? "open" : ""}>
        <summary>
          <span class="execution-date-heading"><strong>${formatExecutionDate(date)}</strong><small>${logs.length}건</small></span>
          <span class="execution-date-total">총 ${formatMinutes(totalMinutes)}</span>
        </summary>
        <div class="execution-date-logs">
          ${logs.map((log) => `
            <article class="linked-log-card">
              <div><h3>${escapeHTML(taskTitle(log.task_id))}</h3></div>
              <div class="linked-log-time">
                <span>${formatTime(log.start_time)} → ${formatTime(log.end_time)}</span>
                <strong>실제 소요 ${formatMinutes(log.actual_minutes)}</strong>
                <span>막힌 이유 · ${escapeHTML(log.blocker_reason || "없음")}</span>
              </div>
              <div class="execution-actions">
                <button class="execution-action" type="button" data-action="edit-execution" data-execution-id="${escapeHTML(log.id)}">수정</button>
                <button class="execution-action delete" type="button" data-action="delete-execution" data-execution-id="${escapeHTML(log.id)}">삭제</button>
              </div>
            </article>
          `).join("")}
        </div>
      </details>
    `;
  }).join("");
}

function actualMinutesForTask(taskId) {
  return state.taskExecutions
    .filter((log) => String(log.task_id) === String(taskId))
    .reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0);
}

function isMeaningfulBlocker(value) {
  const normalized = String(value || "").trim().toLocaleLowerCase("ko");
  return Boolean(normalized) && !["없음", "없었음", "없어요", "none", "n/a", "-"].includes(normalized);
}

function blockerReasonsForTask(taskId) {
  return [...new Set(state.taskExecutions
    .filter((log) => String(log.task_id) === String(taskId) && isMeaningfulBlocker(log.blocker_reason))
    .map((log) => String(log.blocker_reason).trim()))];
}

function formatSignedMinutes(value) {
  const minutes = Number(value || 0);
  if (!minutes) return "0분";
  return `${minutes > 0 ? "+" : "−"}${formatMinutes(Math.abs(minutes))}`;
}

function getSeeSummary() {
  const tasks = [...state.tasks];
  const completedTasks = tasks.filter((task) => task.is_completed);
  const overdueTasks = tasks.filter(isOverdue);
  const blockedTasks = tasks.filter((task) => blockerReasonsForTask(task.id).length > 0);
  const expectedMinutes = tasks.reduce((sum, task) => sum + Number(task.estimated_minutes || 0), 0);
  const actualMinutes = state.taskExecutions.reduce((sum, log) => sum + Number(log.actual_minutes || 0), 0);
  return {
    tasks,
    completedTasks,
    overdueTasks,
    blockedTasks,
    expectedMinutes,
    actualMinutes,
    gapMinutes: actualMinutes - expectedMinutes,
  };
}

function renderSeeEvidence(summary) {
  const definitions = {
    planned: { title: "계획 수의 근거 기록", description: "현재 계획에 연결된, 삭제되지 않은 모든 할 일입니다.", tasks: summary.tasks },
    completed: { title: "완료 수의 근거 기록", description: "지금 완료 체크가 유지된 할 일만 포함합니다.", tasks: summary.completedTasks },
    overdue: { title: "지연 수의 근거 기록", description: "완료되지 않았고 마감일이 서울 기준 오늘보다 앞선 할 일입니다.", tasks: summary.overdueTasks },
    blocked: { title: "막힘 수의 근거 기록", description: "실행 기록에 실제 막힌 이유가 한 번이라도 남은 할 일입니다.", tasks: summary.blockedTasks },
    expected: { title: "예상 시간의 근거 기록", description: "각 할 일에 저장된 예상 시간의 합계입니다.", tasks: summary.tasks },
    actual: { title: "실제 시간의 근거 기록", description: "실행 기록이 있는 할 일별 실제 시간 합계입니다.", tasks: summary.tasks.filter((task) => actualMinutesForTask(task.id) > 0) },
    gap: { title: "예상 대비 차이의 근거 기록", description: "할 일별 실제 시간에서 예상 시간을 뺀 값입니다.", tasks: summary.tasks },
  };
  const selected = definitions[state.seeEvidenceType] || definitions.planned;
  $("#see-evidence-title").textContent = selected.title;
  $("#see-evidence-description").textContent = selected.description;
  $("#see-evidence-count").textContent = `${selected.tasks.length}건`;
  $$("#see-metrics [data-see-evidence]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.seeEvidence === state.seeEvidenceType);
  });

  const list = $("#see-evidence-list");
  if (!selected.tasks.length) {
    list.innerHTML = '<div class="task-empty"><strong>해당하는 근거 기록이 없어요</strong><p>조건에 맞는 할 일이 생기면 여기에 표시됩니다.</p></div>';
    return;
  }

  list.innerHTML = selected.tasks.map((task) => {
    const actualMinutes = actualMinutesForTask(task.id);
    const gapMinutes = actualMinutes - Number(task.estimated_minutes || 0);
    const blockers = blockerReasonsForTask(task.id);
    return `
      <article class="see-evidence-item">
        <div class="see-evidence-main">
          <strong>${escapeHTML(task.title)}</strong>
          <span class="see-status ${task.is_completed ? "completed" : isOverdue(task) ? "overdue" : "active"}">${task.is_completed ? "완료" : isOverdue(task) ? "지연" : "진행 중"}</span>
        </div>
        <div class="see-evidence-values">
          <span>마감 ${formatDate(task.due_date)}</span>
          <span>예상 ${formatMinutes(task.estimated_minutes)}</span>
          <span>실제 ${formatMinutes(actualMinutes)}</span>
          <span>차이 ${formatSignedMinutes(gapMinutes)}</span>
        </div>
        ${blockers.length ? `<p><strong>막힘 이유</strong> · ${blockers.map(escapeHTML).join(" · ")}</p>` : ""}
      </article>
    `;
  }).join("");
}

function renderCompletionHistory(summary) {
  const list = $("#completion-event-list");
  if (!summary.completedTasks.length) {
    list.innerHTML = '<div class="task-empty"><strong>현재 완료된 할 일이 없어요</strong><p>완료 체크가 유지된 할 일만 여기에 표시됩니다.</p></div>';
    return;
  }

  const groups = new Map();
  [...summary.completedTasks]
    .sort((a, b) => new Date(b.completed_at || b.updated_at || b.created_at) - new Date(a.completed_at || a.updated_at || a.created_at))
    .forEach((task) => {
      const date = toSeoulISODate(task.completed_at || task.updated_at || task.created_at);
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(task);
    });
  const today = toSeoulISODate();

  list.innerHTML = [...groups.entries()].map(([date, tasks]) => {
    const dateActualMinutes = tasks.reduce((sum, task) => sum + actualMinutesForTask(task.id), 0);
    return `
      <details class="execution-date-group completion-date-group" ${date === today ? "open" : ""}>
        <summary>
          <span class="execution-date-heading"><strong>${formatExecutionDate(date)}</strong><small>${tasks.length}건 완료</small></span>
          <span class="execution-date-total">총 ${formatMinutes(dateActualMinutes)}</span>
        </summary>
        <div class="completion-date-list">
          ${tasks.map((task) => {
            const actualMinutes = actualMinutesForTask(task.id);
            return `
              <article class="completion-task-card">
                <div><strong>✓ ${escapeHTML(task.title)}</strong><small>${formatTime(task.completed_at || task.updated_at || task.created_at)} 완료</small></div>
                <div class="completion-task-times">
                  <span>예상 ${formatMinutes(task.estimated_minutes)}</span>
                  <strong>실행 기록 합계 ${formatMinutes(actualMinutes)}</strong>
                  <span>차이 ${formatSignedMinutes(actualMinutes - Number(task.estimated_minutes || 0))}</span>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </details>
    `;
  }).join("");
}

function latestPlanImprovement() {
  const plan = currentPlan();
  if (!plan) return null;
  return state.reflections.find((reflection) =>
    Number(reflection.plan_version) === Number(plan.version) && String(reflection.next_action || "").trim(),
  );
}

function renderCompletionSummary() {
  const summary = getSeeSummary();
  const plan = currentPlan();
  $("#see-period-label").textContent = plan
    ? `${formatDate(plan.start_date)} – ${formatDate(plan.end_date)}`
    : "첫 계획을 세우면 집계 기간이 표시됩니다.";
  $("#see-plan-count").textContent = summary.tasks.length;
  $("#see-completion-count").textContent = summary.completedTasks.length;
  $("#see-overdue-count").textContent = summary.overdueTasks.length;
  $("#see-blocked-count").textContent = summary.blockedTasks.length;
  $("#see-expected-time").textContent = formatMinutes(summary.expectedMinutes);
  $("#see-actual-time").textContent = formatMinutes(summary.actualMinutes);
  $("#see-time-gap").textContent = formatSignedMinutes(summary.gapMinutes);
  renderSeeEvidence(summary);
  renderCompletionHistory(summary);

  const improvement = latestPlanImprovement();
  $("#next-plan-note").textContent = improvement?.next_action || "아직 정한 고칠 점이 없습니다.";
}

function renderTimeline() {
  const timeline = $("#history-timeline");
  timeline.innerHTML = "";
  if (!state.versions.length) {
    timeline.innerHTML = '<div class="task-empty"><strong>아직 계획 기록이 없어요</strong><p>첫 계획을 세우면 여기에 보관됩니다.</p></div>';
    return;
  }
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

function renderReflections() {
  const list = $("#reflection-list");
  if (!state.reflections.length) {
    list.innerHTML = emptyState("◌", "아직 작성한 회고가 없어요", "잘한 점과 다음 계획으로 넘길 고칠 점을 정리해 보세요.");
    return;
  }

  const moodMap = { great: "아주 좋아요", good: "좋아요", okay: "보통이에요", hard: "아쉬워요" };
  list.innerHTML = state.reflections.map((item) => `
    <article class="record-card">
      <span class="record-icon" aria-hidden="true">◌</span>
      <div class="record-copy">
        <h3>${formatDate(item.reflection_date)} · ${moodMap[item.mood] || item.mood}</h3>
        <p><strong>잘한 점</strong> · ${escapeHTML(item.went_well)}<br /><strong>다음 계획으로 넘길 고칠 점</strong> · ${escapeHTML(item.next_action)}</p>
      </div>
      <div class="record-meta">
        <span>계획 v${item.plan_version}<br />${formatTimestamp(item.updated_at || item.created_at)}${item.updated_at && item.updated_at !== item.created_at ? " · 수정됨" : ""}</span>
        <div class="reflection-actions">
          <button class="execution-action" type="button" data-action="edit-reflection" data-reflection-id="${escapeHTML(item.id)}">수정</button>
          <button class="execution-action delete" type="button" data-action="delete-reflection" data-reflection-id="${escapeHTML(item.id)}">삭제</button>
        </div>
      </div>
    </article>
  `).join("");
}

function renderFullHistory() {
  const list = $("#full-history");
  if (!state.versions.length) {
    list.innerHTML = emptyState("▤", "아직 계획 기록이 없어요", "첫 계획을 세우면 작성 시점 그대로 여기에 보관됩니다.");
    return;
  }
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
          ${version.carryover_note ? `<span>이전 회고 · ${escapeHTML(version.carryover_note)}</span>` : ""}
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

function createExportPayload() {
  return {
    format: "pds-diary-export",
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    workspace_id: WORKSPACE_ID,
    timezone: "Asia/Seoul",
    units: {
      plan_expected_time: "day",
      task_expected_time: "minute",
      execution_actual_time: "minute",
    },
    data: {
      plan_versions: state.versions,
      tasks: state.tasks,
      task_execution_logs: state.taskExecutions,
      task_completion_events: state.completionEvents,
      reflections: state.reflections,
    },
  };
}

async function exportAllData() {
  if (!requireConnection()) return;
  elements.exportDataButton.disabled = true;
  elements.exportDataButton.textContent = "최신 자료 확인 중…";
  try {
    const loaded = await connectAndLoad({ announce: false });
    if (!loaded) return;
    const payload = createExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `pds-diary-${WORKSPACE_ID}-${toSeoulISODate()}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
    showNotice(
      `전체 자료를 JSON 파일로 내보냈습니다. 계획 ${payload.data.plan_versions.length}건 · 할 일 ${payload.data.tasks.length}건 · 실행 ${payload.data.task_execution_logs.length}건 · 회고 ${payload.data.reflections.length}건`,
      "success",
      5200,
    );
  } catch (error) {
    showNotice(`자료를 내보내지 못했습니다. ${error.message}`, "error");
  } finally {
    elements.exportDataButton.disabled = false;
    elements.exportDataButton.textContent = "전체 자료 내보내기";
  }
}

function renderAll() {
  renderPlan();
  renderWeek();
  renderTasks();
  renderTaskExecutions();
  renderCompletionSummary();
  renderTimeline();
  renderReflections();
  renderFullHistory();
}

function switchView(view) {
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.id === `${view}-view`));
  $$(".nav-item").forEach((button) => button.classList.remove("is-active"));
  const matchingNav = $(`.nav-item[data-view="${view}"]`);
  if (matchingNav) matchingNav.classList.add("is-active");
  elements.accountAccessBar.hidden = view !== "plan";
  history.replaceState(null, "", `#${view}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function fillPlanForm() {
  const plan = currentPlan();
  elements.planForm.reset();
  $("#plan-dialog-title").textContent = plan ? "계획 수정" : "첫 계획 세우기";
  $("#plan-dialog-copy").textContent = plan
    ? "저장하면 기존 계획은 유지되고 새 버전이 추가됩니다."
    : "목표와 성공 기준, 기간을 직접 정해 주세요.";
  $("#save-plan-button").textContent = plan ? "새 버전으로 저장" : "첫 계획 저장";
  if (!plan) {
    const today = toSeoulISODate();
    elements.planForm.elements.start_date.value = today;
    elements.planForm.elements.end_date.value = today;
    elements.planForm.elements.priority.value = "medium";
    elements.planForm.elements.expected_days.value = 1;
    return;
  }
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

function findReflection(reflectionId) {
  return state.reflections.find((reflection) => String(reflection.id) === String(reflectionId));
}

function sortReflections() {
  state.reflections.sort((a, b) =>
    String(b.reflection_date).localeCompare(String(a.reflection_date))
    || new Date(b.created_at) - new Date(a.created_at),
  );
}

function openReflectionDialog(reflection = null) {
  if (!requireConnection()) return;
  if (!currentPlan()) {
    showNotice("회고를 작성하기 전에 첫 계획을 세워 주세요.", "error");
    return;
  }
  state.editingReflectionId = reflection?.id ?? null;
  elements.reflectionForm.reset();
  elements.reflectionForm.elements.reflection_date.value = reflection?.reflection_date || toSeoulISODate();
  elements.reflectionForm.elements.mood.value = reflection?.mood || "great";
  elements.reflectionForm.elements.went_well.value = reflection?.went_well || "";
  elements.reflectionForm.elements.next_action.value = reflection?.next_action || "";
  $("#reflection-dialog-title").textContent = reflection ? "회고 기록 수정" : "과정 돌아보기";
  $("#save-reflection-button").textContent = reflection ? "변경 내용 저장" : "회고 저장";
  elements.reflectionDialog.showModal();
}

async function deleteReflection(reflection) {
  if (!reflection || !requireConnection()) return;
  if (!window.confirm(`${formatDate(reflection.reflection_date)} 회고 기록을 삭제할까요?\n삭제한 기록은 되돌릴 수 없습니다.`)) return;

  setLoading(true);
  try {
    await supabaseRequest("reflections", {
      method: "DELETE",
      query: `id=eq.${encodeURIComponent(reflection.id)}&workspace_id=eq.${WORKSPACE_ID}`,
    });
    state.reflections = state.reflections.filter((item) => String(item.id) !== String(reflection.id));
    renderAll();
    showNotice("회고 기록을 삭제했습니다.", "success", 2800);
  } catch (error) {
    showNotice(`회고 기록을 삭제하지 못했습니다. ${error.message}`, "error");
  } finally {
    setLoading(false);
  }
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
  const plan = currentPlan();
  if (!plan) {
    showNotice("할 일을 만들기 전에 첫 계획을 세워 주세요.", "error");
    return;
  }
  state.editingTaskId = task?.id ?? null;
  elements.taskForm.reset();
  $("#task-dialog-title").textContent = task ? "할 일 수정" : "할 일 만들기";
  $("#save-task-button").textContent = task ? "변경 내용 저장" : "할 일 저장";
  elements.taskForm.elements.title.value = task?.title || "";
  elements.taskForm.elements.due_date.value = task?.due_date || plan.end_date;
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

function openTaskExecutionDialog(task = null, executionLog = null) {
  if (!requireConnection()) return;
  if (!state.tasks.length) {
    showNotice("실행 기록을 연결할 할 일을 먼저 만들어 주세요.", "error");
    return;
  }
  state.editingExecutionId = executionLog?.id ?? null;
  elements.taskExecutionForm.reset();
  const taskSelect = elements.taskExecutionForm.elements.task_id;
  taskSelect.innerHTML = state.tasks
    .map((item) => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.title)}</option>`)
    .join("");
  const selectedTaskId = executionLog?.task_id ?? task?.id ?? state.tasks[0].id;
  taskSelect.value = String(selectedTaskId);
  const end = executionLog ? new Date(executionLog.end_time) : new Date();
  const start = executionLog ? new Date(executionLog.start_time) : new Date(end.getTime() - 60 * 60000);
  elements.taskExecutionForm.elements.start_time.value = toDateTimeLocalValue(start);
  elements.taskExecutionForm.elements.end_time.value = toDateTimeLocalValue(end);
  elements.taskExecutionForm.elements.blocker_reason.value = executionLog?.blocker_reason || "";
  $("#task-execution-dialog-title").textContent = executionLog ? "실행 기록 수정" : "실행 기록 남기기";
  $("#save-task-execution-button").textContent = executionLog ? "변경 내용 저장" : "실행 기록 저장";
  $("#execution-task-title").textContent = task
    ? `“${task.title}”이 선택되었습니다. 필요하면 다른 할 일로 바꿀 수 있습니다.`
    : "실행한 할 일을 선택하면 기록이 해당 할 일에 자동으로 연결됩니다.";
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
    renderPlan();
    renderWeek();
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
    renderCompletionSummary();
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
  elements.loginTab.addEventListener("click", () => setAuthMode("login"));
  elements.signupTab.addEventListener("click", () => setAuthMode("signup"));
  elements.loginForm.addEventListener("submit", (event) => void handleLoginSubmit(event));
  elements.signupForm.addEventListener("submit", (event) => void handleSignupSubmit(event));
  elements.logoutButton.addEventListener("click", () => void handleLogout());
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", () => {
    button.closest("dialog")?.close();
  }));
  $$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$('[data-open-task-execution]').forEach((button) => button.addEventListener("click", () => openTaskExecutionDialog()));
  elements.exportDataButton.addEventListener("click", () => void exportAllData());

  $("#edit-plan-button").addEventListener("click", () => {
    if (!requireConnection()) return;
    fillPlanForm();
    elements.planDialog.showModal();
  });
  $$('[data-open-reflection]').forEach((button) => button.addEventListener("click", () => openReflectionDialog()));
  $("#add-task-button").addEventListener("click", () => openTaskDialog());

  $("#see-metrics").addEventListener("click", (event) => {
    const metric = event.target.closest("[data-see-evidence]");
    if (!metric) return;
    state.seeEvidenceType = metric.dataset.seeEvidence;
    renderCompletionSummary();
    $("#see-evidence-card").focus({ preventScroll: true });
  });

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
      if (saved) await refreshCompletionEvents();
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
    if (button.dataset.action === "edit-task" && task) openTaskDialog(task);
    if (button.dataset.action === "delete-task") void deleteTask(button.dataset.taskId);
  });

  $("#all-task-execution-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button) handleExecutionAction(button);
  });

  $("#reflection-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const reflection = findReflection(button.dataset.reflectionId);
    if (button.dataset.action === "edit-reflection" && reflection) openReflectionDialog(reflection);
    if (button.dataset.action === "delete-reflection" && reflection) void deleteReflection(reflection);
  });

  elements.taskForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireConnection()) return;
    const plan = currentPlan();
    if (!plan) {
      showNotice("할 일을 저장하기 전에 첫 계획을 세워 주세요.", "error");
      return;
    }
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
          plan_version: plan.version,
          is_completed: false,
        }],
      });
      state.tasks.push(saved);
      elements.taskDialog.close();
      renderTasks();
      renderCompletionSummary();
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
    const data = Object.fromEntries(new FormData(elements.taskExecutionForm));
    const task = findTask(data.task_id);
    const minutes = executionMinutesFromForm();
    if (!task) {
      showNotice("실행 기록을 연결할 할 일을 선택해 주세요.", "error");
      return;
    }
    if (!minutes) {
      showNotice("끝난 시각은 시작 시각보다 뒤여야 합니다.", "error");
      return;
    }

    const originalPlanSnapshot = JSON.stringify(currentPlan());
    const payload = {
      task_id: task.id,
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
        body: [{ ...payload, workspace_id: WORKSPACE_ID }],
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
      elements.taskExecutionDialog.close();
      renderPlan();
      renderWeek();
      renderTasks();
      renderTaskExecutions();
      renderCompletionSummary();
      showNotice(
        `${editing ? "실행 기록을 수정했습니다." : "실행 기록을 저장했습니다."} “${task.title}” 할 일에 연결되었고 원래 계획 값은 그대로 유지됩니다.`,
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
      const previousPlan = currentPlan();
      const plan = {
        workspace_id: WORKSPACE_ID,
        version: previousPlan ? previousPlan.version + 1 : 1,
        title: data.title.trim(),
        start_date: data.start_date,
        end_date: data.end_date,
        priority: data.priority,
        success_criteria: data.success_criteria.trim(),
        expected_days: Number(data.expected_days),
        carryover_note: previousPlan ? latestPlanImprovement()?.next_action || "" : "",
      };
      const [saved] = await supabaseRequest("plan_versions", { method: "POST", body: [plan] });
      state.versions.unshift(saved);
      elements.planDialog.close();
      renderAll();
      showNotice(
        previousPlan
          ? `계획 v${saved.version}을 저장했습니다.${saved.carryover_note ? " 회고의 고칠 점 한 줄도 함께 넘겼습니다." : ""} 이전 버전은 그대로 보관됩니다.`
          : "첫 계획을 저장했습니다. 이제 계획에 연결할 할 일을 만들어 보세요.",
        "success",
        4200,
      );
    } catch (error) {
      showNotice(`계획을 저장하지 못했습니다. ${error.message}`, "error");
      await connectAndLoad({ announce: false });
    } finally {
      setLoading(false);
    }
  });

  elements.reflectionForm.addEventListener("submit", async (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    if (!requireConnection()) return;
    const plan = currentPlan();
    if (!plan) {
      showNotice("회고를 저장하기 전에 첫 계획을 세워 주세요.", "error");
      return;
    }
    const data = Object.fromEntries(new FormData(elements.reflectionForm));
    const editingReflectionId = state.editingReflectionId;
    const editing = editingReflectionId !== null;
    const payload = {
      reflection_date: data.reflection_date,
      mood: data.mood,
      went_well: data.went_well.trim(),
      next_action: data.next_action.trim(),
      ...(editing ? { updated_at: new Date().toISOString() } : {}),
    };
    setLoading(true);
    try {
      const [saved] = await supabaseRequest("reflections", editing ? {
        method: "PATCH",
        query: `id=eq.${encodeURIComponent(editingReflectionId)}&workspace_id=eq.${WORKSPACE_ID}`,
        body: payload,
      } : {
        method: "POST",
        body: [{
          ...payload,
          workspace_id: WORKSPACE_ID,
          plan_version: plan.version,
        }],
      });
      if (!saved) throw new Error(`${editing ? "수정할" : "저장된"} 회고 기록을 찾지 못했습니다.`);
      if (editing) {
        state.reflections = state.reflections.map((reflection) =>
          String(reflection.id) === String(editingReflectionId) ? saved : reflection,
        );
      } else {
        state.reflections.unshift(saved);
      }
      sortReflections();
      state.editingReflectionId = null;
      elements.reflectionDialog.close();
      renderAll();
      showNotice(`회고 기록을 ${editing ? "수정" : "저장"}했습니다.`, "success", 2800);
    } catch (error) {
      showNotice(`회고 기록을 ${editing ? "수정" : "저장"}하지 못했습니다. ${error.message}`, "error");
    } finally {
      setLoading(false);
    }
  });
}

async function initialize() {
  bindEvents();
  renderAll();
  const route = location.hash.slice(1);
  if (["plan", "do", "see", "history"].includes(route)) switchView(route);
  if (!hasConfig()) {
    showSignedOutScreen();
    showAuthNotice("Supabase 연결 설정이 없습니다. public/config.js를 확인해 주세요.");
    return;
  }

  state.authClient = createClient(state.config.url, state.config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  state.authClient.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED" && session) {
      state.session = session;
      return;
    }
    if (event === "SIGNED_OUT") {
      window.setTimeout(() => {
        if (state.session) showSignedOutScreen();
      }, 0);
    }
  });

  const { data, error } = await state.authClient.auth.getSession();
  if (error || !data.session) {
    showSignedOutScreen();
    return;
  }
  await showSignedInApp(data.session);
}

void initialize();
