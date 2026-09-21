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

const state = {
  config: readConfig(),
  connected: false,
  loading: false,
  versions: [initialPlan],
  activities: [],
  reflections: [],
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
  planForm: $("#plan-form"),
  activityForm: $("#activity-form"),
  reflectionForm: $("#reflection-form"),
};

function readConfig() {
  const embedded = window.__PDS_CONFIG__ ?? {};
  const config = normalizeConfig({ url: embedded.supabaseUrl, key: embedded.supabaseAnonKey });
  return config.url && config.key ? config : null;
}

function normalizeConfig(config) {
  return {
    url: String(config.url || "").trim().replace(/\/$/, ""),
    key: String(config.key || "").trim(),
  };
}

function hasConfig() {
  return Boolean(state.config?.url && state.config?.key);
}

async function supabaseRequest(table, { method = "GET", query = "", body } = {}) {
  if (!hasConfig()) throw new Error("Supabase 연결 정보가 필요합니다.");

  const response = await fetch(`${state.config.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: {
      apikey: state.config.key,
      Authorization: `Bearer ${state.config.key}`,
      "Content-Type": "application/json",
      Prefer: method === "POST" ? "return=representation" : "return=minimal",
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
    showNotice("Supabase 연결 설정이 없습니다. public/config.js에 Project URL과 anon key를 입력해 주세요.", "error");
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

    const [activities, reflections] = await Promise.all([
      supabaseRequest("activity_logs", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=activity_date.desc,created_at.desc`,
      }),
      supabaseRequest("reflections", {
        query: `workspace_id=eq.${WORKSPACE_ID}&order=reflection_date.desc,created_at.desc`,
      }),
    ]);

    state.versions = versions.sort((a, b) => b.version - a.version);
    state.activities = activities;
    state.reflections = reflections;
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
