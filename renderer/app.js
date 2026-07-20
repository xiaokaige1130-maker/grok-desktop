/* global grokDesktop */
/**
 * Grok Desktop 0.6 — product shell
 * Views: chat | memory | skills | plugins | settings
 * Features: multi-agent tabs, diff cards, content search, plan panel
 */

const $ = (id) => document.getElementById(id);

// macOS hiddenInset: mark platform so CSS can enable -webkit-app-region drag surfaces
(function applyPlatformClass() {
  try {
    const p = (typeof grokDesktop !== "undefined" && grokDesktop.platform) || "";
    if (p) document.body.classList.add(`platform-${p}`);
    // Settings shortcut list: show ⌘ instead of Ctrl on macOS
    if (p === "darwin") {
      document.querySelectorAll("kbd.mod-key").forEach((el) => {
        el.textContent = "⌘";
      });
    }
  } catch {
    /* ignore */
  }
})();

/**
 * Electron does NOT support window.prompt (always returns null).
 * Use this in-app modal for text input / confirms.
 * @returns {Promise<string|null>} null if cancelled; string (may be empty) if OK with input;
 *          for confirm-only mode returns "1" on OK and null on cancel.
 */
function askModal({
  title = "提示",
  message = "",
  defaultValue = "",
  placeholder = "",
  okLabel = "确定",
  cancelLabel = "取消",
  input = true,
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    const root = $("app-modal");
    const titleEl = $("app-modal-title");
    const msgEl = $("app-modal-msg");
    const inputEl = $("app-modal-input");
    const okBtn = $("app-modal-ok");
    const cancelBtn = $("app-modal-cancel");
    if (!root || !okBtn) {
      // fallback — still broken for prompt, but avoid crash
      if (input) resolve(window.prompt(message || title, defaultValue));
      else resolve(window.confirm(message || title) ? "1" : null);
      return;
    }

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      root.classList.add("hidden");
      document.removeEventListener("keydown", onKey, true);
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      root.querySelectorAll("[data-modal-cancel]").forEach((el) => {
        el.onclick = null;
      });
      resolve(value);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
      } else if (e.key === "Enter" && (!input || document.activeElement === inputEl)) {
        e.preventDefault();
        e.stopPropagation();
        finish(input ? String(inputEl.value ?? "") : "1");
      }
    };

    titleEl.textContent = title;
    msgEl.textContent = message || "";
    okBtn.textContent = okLabel;
    cancelBtn.textContent = cancelLabel;
    okBtn.classList.toggle("danger", !!danger);
    okBtn.classList.toggle("primary", !danger);

    if (input) {
      inputEl.classList.remove("hidden");
      inputEl.value = defaultValue ?? "";
      inputEl.placeholder = placeholder || "";
    } else {
      inputEl.classList.add("hidden");
      inputEl.value = "";
    }

    root.classList.remove("hidden");
    okBtn.onclick = () => finish(input ? String(inputEl.value ?? "") : "1");
    const cancel = () => finish(null);
    cancelBtn.onclick = cancel;
    root.querySelectorAll("[data-modal-cancel]").forEach((el) => {
      el.onclick = cancel;
    });
    document.addEventListener("keydown", onKey, true);

    requestAnimationFrame(() => {
      if (input) {
        inputEl.focus();
        inputEl.select();
      } else {
        okBtn.focus();
      }
    });
  });
}

async function askText(opts) {
  const v = await askModal({ ...opts, input: true });
  if (v == null) return null;
  const t = String(v).trim();
  return t || null;
}

async function askConfirm(opts) {
  const v = await askModal({
    okLabel: "确定",
    cancelLabel: "取消",
    ...opts,
    input: false,
  });
  return v != null;
}

const ui = {
  list: $("session-list"),
  search: $("search"),
  searchHits: $("search-hits"),
  sessionSection: $("session-section"),
  sessionTabs: $("session-tabs"),
  thread: $("thread"),
  inner: $("thread-inner"),
  input: $("input"),
  send: $("btn-send"),
  cancel: $("btn-cancel"),
  fileBtn: $("btn-file"),
  attachPreview: $("attach-preview"),
  contextChips: $("context-chips"),
  slashMenu: $("slash-menu"),
  liveStrip: $("live-strip"),
  stripModel: $("strip-model"),
  stripEffort: $("strip-effort"),
  stripCwd: $("strip-cwd"),
  stripQueue: $("strip-queue"),
  planPanel: $("plan-panel"),
  planList: $("plan-list"),
  planToggle: $("btn-plan-toggle"),
  planClose: $("btn-plan-close"),
  planDot: $("plan-dot"),
  navSettings: $("nav-settings"),
  modelBtn: $("btn-model"),
  modelLabel: $("model-label"),
  modelPop: $("model-popover"),
  effortBtn: $("btn-effort"),
  effortLabel: $("effort-label"),
  effortPop: $("effort-popover"),
  settingsBack: $("settings-back"),
  settingsSearch: $("settings-search"),
  refresh: $("btn-refresh"),
  neu: $("btn-new"),
  title: $("chat-title"),
  sub: $("chat-sub"),
  status: $("status-pill"),
  cliInfo: $("cli-info"),
  cwdChip: $("cwd-chip"),
  sessionActions: $("session-actions"),
  rename: $("btn-rename"),
  del: $("btn-delete"),
  skillsList: $("skills-list"),
  skillDetail: $("skill-detail"),
  memoryList: $("memory-list"),
  memoryDetail: $("memory-detail"),
  memoryEnabled: $("memory-enabled"),
  pluginsInstalled: $("plugins-installed"),
  pluginsMarket: $("plugins-market"),
  pluginSpec: $("plugin-install-spec"),
  settingsMsg: $("settings-msg"),
};

const PAGE = 12; // keep DOM light; load earlier on demand
const CLAMP = 480;
/** Soft cap: older tool/diff details stay collapsed & lazy */
const MAX_OPEN_DIFFS = 1;

let view = "chat";
let sessions = [];
let activeId = null;
let activeMeta = null;
let streamingEl = null;
let busy = false;
let connecting = false;
let openSeq = 0;
const collapsed = new Set();
let history = [];
let historyFrom = 0;
let pendingImages = [];
/** @type {Array<{path:string,name:string,preview?:string}>} */
let pendingFiles = [];
/** @type {Array<{text:string,images:any[],files:any[]}>} */
let messageQueue = [];
let desktopSettings = {
  showThinking: true,
  enterToSend: true,
  density: "comfortable",
  autoApprove: true,
  openTabs: [],
  lastActiveId: null,
  wallpaper: "none",
  wallpaperPath: null,
  wallpaperDim: 45,
  notifyOnDone: true,
  checkUpdates: true,
  setupDismissed: false,
  locale: "zh",
  accessMode: "full",
  archivedSessionIds: [],
  pinnedSessionIds: [],
};

function archivedSet() {
  return new Set(
    Array.isArray(desktopSettings.archivedSessionIds) ? desktopSettings.archivedSessionIds : [],
  );
}
function pinnedSet() {
  return new Set(
    Array.isArray(desktopSettings.pinnedSessionIds) ? desktopSettings.pinnedSessionIds : [],
  );
}
function isArchived(id) {
  return archivedSet().has(id);
}
function isPinned(id) {
  return pinnedSet().has(id);
}

async function persistSessionLists(partial) {
  try {
    desktopSettings = {
      ...desktopSettings,
      ...(await grokDesktop.saveDesktopSettings(partial)),
    };
  } catch {
    Object.assign(desktopSettings, partial);
  }
}

async function toggleArchiveSession(id) {
  const set = archivedSet();
  if (set.has(id)) set.delete(id);
  else set.add(id);
  const archivedSessionIds = [...set];
  // archiving unpins
  let pinnedSessionIds = [...pinnedSet()];
  if (set.has(id)) pinnedSessionIds = pinnedSessionIds.filter((x) => x !== id);
  await persistSessionLists({ archivedSessionIds, pinnedSessionIds });
  renderSidebar(ui.search?.value || "");
  flashToast(set.has(id) ? "已归档" : "已取消归档");
}

async function togglePinSession(id) {
  const set = pinnedSet();
  if (set.has(id)) set.delete(id);
  else {
    set.add(id);
    // pin removes from archive for visibility
    const arch = archivedSet();
    if (arch.has(id)) {
      arch.delete(id);
      await persistSessionLists({
        pinnedSessionIds: [...set],
        archivedSessionIds: [...arch],
      });
      renderSidebar(ui.search?.value || "");
      flashToast("已置顶");
      return;
    }
  }
  await persistSessionLists({ pinnedSessionIds: [...set] });
  renderSidebar(ui.search?.value || "");
  flashToast(set.has(id) ? "已置顶" : "已取消置顶");
}

function flashToast(msg) {
  let el = document.getElementById("toast-flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-flash";
    el.className = "toast-flash";
    document.body.appendChild(el);
  }
  el.textContent = msg || "";
  el.classList.add("show");
  clearTimeout(flashToast._t);
  flashToast._t = setTimeout(() => el.classList.remove("show"), 1600);
}

async function copyText(text) {
  const s = String(text || "");
  if (!s) throw new Error("无内容可复制");
  try {
    await navigator.clipboard.writeText(s);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = s;
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** @returns {"safe"|"balanced"|"full"} */
function normalizeAccessMode(mode) {
  if (mode === "safe" || mode === "balanced" || mode === "full") return mode;
  return "full";
}

/** Map product access mode → desktop autoApprove + grok permission_mode / yolo */
function accessModeToSettings(mode, yolo = false) {
  const m = normalizeAccessMode(mode);
  if (m === "safe") {
    return { accessMode: "safe", autoApprove: false, permissionMode: "ask", yolo: false };
  }
  if (m === "balanced") {
    return { accessMode: "balanced", autoApprove: true, permissionMode: "default", yolo: false };
  }
  return {
    accessMode: "full",
    autoApprove: true,
    permissionMode: "always-approve",
    yolo: !!yolo,
  };
}

function deriveAccessMode(desk = {}, grok = {}) {
  if (desk.accessMode === "safe" || desk.accessMode === "balanced" || desk.accessMode === "full") {
    return desk.accessMode;
  }
  if (desk.autoApprove === false || grok.permissionMode === "ask") return "safe";
  if (grok.yolo || grok.permissionMode === "always-approve") return "full";
  return "balanced";
}

function updateAccessChip() {
  const el = $("strip-access");
  if (!el) return;
  const mode = normalizeAccessMode(desktopSettings.accessMode);
  el.className = "access-chip mode-" + mode;
  el.textContent = t("access.badge." + mode);
  el.title = t("access." + mode + "Desc");
}

function setAccessModeUi(mode) {
  const m = normalizeAccessMode(mode);
  desktopSettings.accessMode = m;
  document.querySelectorAll("#access-mode-cards .mode-card").forEach((card) => {
    const on = card.getAttribute("data-mode") === m;
    card.classList.toggle("active", on);
    card.setAttribute("aria-checked", on ? "true" : "false");
  });
  const yoloRow = $("yolo-row");
  if (yoloRow) yoloRow.style.display = m === "full" ? "" : "none";
  // legacy hidden fields
  const mapped = accessModeToSettings(m, !!$("set-yolo")?.checked);
  if ($("set-permission")) $("set-permission").value = mapped.permissionMode;
  if ($("set-auto-approve")) {
    // checkbox may have been replaced by hidden input
    const el = $("set-auto-approve");
    if (el.type === "checkbox") el.checked = mapped.autoApprove;
    else el.value = mapped.autoApprove ? "1" : "0";
  }
  updateAccessChip();
}

function applyLocale(loc, { persist } = {}) {
  const next = loc === "en" ? "en" : "zh";
  if (window.GrokI18n) GrokI18n.setLocale(next);
  desktopSettings.locale = next;
  if (window.GrokI18n) GrokI18n.applyI18n(document);
  // re-render dynamic bits that aren't data-i18n
  updateAccessChip();
  if (activeId) {
    const st = sessionUi.get(activeId);
    renderPlan(st?.plan || null);
  } else {
    // welcome titles if present
    if (ui.title && !activeId) {
      ui.title.textContent = t("chat.welcomeTitle");
      if (ui.sub) ui.sub.textContent = t("chat.welcomeSub");
    }
  }
  setAccessModeUi(desktopSettings.accessMode);
  if (persist) {
    void grokDesktop.saveDesktopSettings({ locale: next }).catch(() => {});
  }
}
/** 刚跑完、尚未点开的会话（左侧绿点） */
/** @type {Set<string>} */
const doneSessions = new Set();
/** 曾经进入过 working 的会话，用于区分「真正结束」 */
/** @type {Set<string>} */
const everWorkedSessions = new Set();
/** Last search query used for thread highlight */
let lastSearchQuery = "";
let persistTabsTimer = null;
/** Session id for open context menu */
let ctxSessionId = null;
let seenMedia = new Set();
/** @type {Map<string, HTMLElement>} */
let toolCardMap = new Map();
/** @type {Map<string, HTMLElement>} */
let diffCardMap = new Map();
/** @type {Array<object>} */
let slashCommands = [];
let slashFiltered = [];
let slashIndex = 0;
let slashOpen = false;
let availableModels = [];
let currentModelId = null;
let modelOpen = false;
let effortOpen = false;
let currentEffort = "high";
let effortOptions = [
  { id: "high", label: "高" },
  { id: "medium", label: "中" },
  { id: "low", label: "低" },
];

/** Open session tabs (parallel agents). */
/** @type {string[]} */
let openTabs = [];
/** Live agent session ids from main process. */
/** @type {Set<string>} */
let liveAgents = new Set();
/** Per-session busy flag for tab indicators. */
/** @type {Set<string>} */
let workingSessions = new Set();
/** 本轮 prompt 尚未返回（比 status 事件更可靠，避免中途误判为空闲导致插不进去） */
/** @type {Set<string>} */
const promptInFlight = new Set();
/** 发送代数：打断后旧的 sendNow finally 不再 flush/改状态 */
let sendGeneration = 0;
/** Detached thread panes per session so parallel streams stay intact. */
/** @type {Map<string, HTMLElement>} */
const threadPanes = new Map();
/** Per-session streaming element + tool/diff maps. */
/** @type {Map<string, { streamingEl: HTMLElement|null, toolCardMap: Map, diffCardMap: Map, plan: any, scrollTop: number }>} */
const sessionUi = new Map();
/** Plan panel open state. */
let planOpen = false;
/** Debounce timer for content search. */
let searchTimer = null;
let settingsPanel = "general";

// ── utils ──────────────────────────────────────────────

function projectName(s) {
  if (!s?.cwd) return "其他";
  const parts = String(s.cwd).replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || s.cwd;
}

function relativeTime(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}月`;
  return `${Math.floor(mo / 12)}年`;
}

function shortPath(p) {
  if (!p) return "未选择工作目录";
  if (p.startsWith("/home/")) {
    const rest = p.slice(6);
    const i = rest.indexOf("/");
    return i >= 0 ? "~/" + rest.slice(i + 1) : "~";
  }
  return p.length > 42 ? "…" + p.slice(-40) : p;
}

/** 状态栏文案统一中文（避免 CLI 英文状态直接露出来） */
function localizeStatus(state, detail) {
  const st = String(state || "idle").toLowerCase();
  const d = detail == null || detail === "" ? "" : String(detail);
  const en = typeof GrokI18n !== "undefined" && GrokI18n.getLocale() === "en";
  const stateMap = en
    ? {
        idle: "Ready",
        ready: "Ready",
        working: "Working…",
        connecting: "Connecting…",
        error: "Error",
        disconnected: "Disconnected",
      }
    : {
        idle: "就绪",
        ready: "就绪",
        working: "思考中…",
        connecting: "连接中…",
        error: "出错",
        disconnected: "已断开",
      };
  const detailMap = en
    ? {
        ready: "Ready",
        idle: "Ready",
        working: "Working…",
        connecting: "Connecting…",
        connected: "Connected",
        disconnected: "Disconnected",
        error: "Error",
        就绪: "Ready",
        已完成: "Done",
        思考中: "Working…",
        "思考中…": "Working…",
        "连接中…": "Connecting…",
        已连接: "Connected",
        已停止: "Stopped",
      }
    : {
        ready: "就绪",
        idle: "就绪",
        working: "思考中…",
        connecting: "连接中…",
        connected: "已连接",
        disconnected: "已断开",
        error: "出错",
        "agent 已关闭": "agent 已关闭",
      };
  if (!d) return stateMap[st] || stateMap.idle;
  const low = d.toLowerCase().trim();
  if (detailMap[low]) return detailMap[low];
  if (detailMap[d]) return detailMap[d];
  // 常见英文片段
  if (/^ready$/i.test(d)) return "就绪";
  if (/connecting|连接 agent/i.test(d) && /…|\.\.\./.test(d)) return d.replace(/连接 agent/i, "连接助手");
  if (/^connected$/i.test(d)) return "已连接";
  if (/reused|parallel/i.test(d)) return "已连接";
  return d;
}

function setStatus(state, detail) {
  const st = state || "idle";
  ui.status.dataset.state = st;
  ui.status.textContent = localizeStatus(st, detail);
}

/** True when this session should accept follow-ups into the queue (not a new prompt). */
function isAgentBusy(sessionId = activeId) {
  if (!sessionId) return false;
  // 最可靠：本轮 prompt 还在 await
  if (promptInFlight.has(sessionId)) return true;
  if (workingSessions.has(sessionId)) return true;
  if (sessionId === activeId && busy) return true;
  if (sessionId === activeId && ui.status?.dataset?.state === "working") return true;
  const st = sessionUi.get(sessionId);
  if (st && (st.statusState === "working" || st.statusState === "connecting")) return true;
  // 状态文案兜底（思考中 / 连接中）
  if (sessionId === activeId) {
    const t = ui.status?.textContent || "";
    if (/思考中|连接中|运行中/.test(t)) return true;
  }
  return false;
}

function refreshSendButtonState() {
  const canType = !!activeId && !connecting;
  const agentBusy = isAgentBusy(activeId);
  const hasContent =
    !!ui.input?.value?.trim() || pendingImages.length > 0 || pendingFiles.length > 0;
  if (ui.input) ui.input.disabled = !canType;
  if (ui.fileBtn) ui.fileBtn.disabled = !canType;
  if (ui.modelBtn) ui.modelBtn.disabled = !canType || agentBusy;
  if (ui.effortBtn) ui.effortBtn.disabled = !canType || agentBusy;
  if (ui.send) {
    ui.send.disabled = !canType || !hasContent;
    // 忙时：回车/发送 = 进排队；引导在排队气泡上
    ui.send.textContent = agentBusy ? "排队 ↑" : "发送 ↑";
    ui.send.title = agentBusy
      ? "先放进排队，确认后再点「引导」打断并发送"
      : "发送";
    ui.send.classList.toggle("queue-mode", !!agentBusy);
    ui.send.classList.remove("insert-ready");
  }
  if (ui.cancel) ui.cancel.disabled = !agentBusy;
  if (ui.input) {
    ui.input.placeholder = agentBusy
      ? "写纠正… Enter 先排队，点「引导」才打断发送"
      : "消息 · 拖入图片 · / 命令 · @ 文件… Enter 发送";
  }
  $("composer")?.classList.toggle("is-busy", !!agentBusy);
}

function setComposerEnabled(on) {
  const canType = !!on;
  if (!canType) {
    if (ui.input) ui.input.disabled = true;
    if (ui.fileBtn) ui.fileBtn.disabled = true;
    if (ui.modelBtn) ui.modelBtn.disabled = true;
    if (ui.effortBtn) ui.effortBtn.disabled = true;
    if (ui.send) ui.send.disabled = true;
    if (ui.cancel) ui.cancel.disabled = true;
    $("composer")?.classList.remove("is-busy");
  } else {
    refreshSendButtonState();
  }
  updateLiveStrip();
}

/**
 * 任务进行中：Enter → 只排队（不打断）。
 * 点排队气泡上的「引导」→ 打断并立刻发送。
 */
function enqueueFollowUp({ text, images, files }) {
  if (!activeId) return false;
  const item = {
    text: text || "",
    images: (images || []).slice(),
    files: (files || []).slice(),
  };
  if (!item.text && !item.images.length && !item.files.length) return false;
  messageQueue.push(item);
  const st = ensureSessionUi(activeId);
  st.messageQueue = messageQueue.slice();
  rerenderQueuedTurns();
  updateLiveStrip();
  refreshSendButtonState();
  return true;
}

function removeQueuedTurns() {
  ui.inner?.querySelectorAll(".turn.queued").forEach((el) => el.remove());
}

/** 在对话区画排队气泡：正文 + 「引导」+ 删除 */
function rerenderQueuedTurns() {
  removeQueuedTurns();
  if (!messageQueue.length || !ui.inner) return;
  ui.inner.querySelector(".welcome")?.remove();
  messageQueue.forEach((item, idx) => {
    const turn = document.createElement("div");
    turn.className = "turn user queued";
    turn.dataset.queueIdx = String(idx);

    const head = document.createElement("div");
    head.className = "queue-bubble-head";
    const label = document.createElement("span");
    label.className = "queue-badge";
    label.textContent = "排队中";
    const actions = document.createElement("div");
    actions.className = "queue-bubble-actions";

    const guideBtn = document.createElement("button");
    guideBtn.type = "button";
    guideBtn.className = "queue-guide-btn";
    guideBtn.textContent = "引导";
    guideBtn.title = "打断当前任务，立刻按这条发送";
    guideBtn.onclick = (e) => {
      e.stopPropagation();
      void guideSendFromQueue(idx);
    };

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "queue-del-btn";
    delBtn.textContent = "删除";
    delBtn.title = "从排队去掉";
    delBtn.onclick = (e) => {
      e.stopPropagation();
      messageQueue.splice(idx, 1);
      const st = ensureSessionUi(activeId);
      if (st) st.messageQueue = messageQueue.slice();
      rerenderQueuedTurns();
      updateLiveStrip();
      refreshSendButtonState();
    };

    actions.append(guideBtn, delBtn);
    head.append(label, actions);
    turn.appendChild(head);

    if (item.images?.length) {
      const media = ensureTurnMedia(turn);
      for (const img of item.images) {
        addImgToMediaRow(media, img.dataUrl || img, img.key || img.dataUrl || `q-${idx}`);
      }
    }
    if (item.text) {
      const body = document.createElement("div");
      body.className = "body";
      body.textContent = item.text;
      turn.appendChild(body);
    }
    ui.inner.appendChild(turn);
  });
  scrollThreadToBottom({ force: true });
}

/** 点「引导」：打断当前任务，立刻发送这一条 */
async function guideSendFromQueue(idx) {
  if (!activeId || idx < 0 || idx >= messageQueue.length) return;
  const item = messageQueue[idx];
  // 取出这一条，其余排队保留还是全清？用户确认后再发 → 引导 = 发这一条并清空排队
  const payload = {
    text: item.text || "",
    images: (item.images || []).slice(),
    files: (item.files || []).slice(),
  };
  messageQueue = [];
  const st = ensureSessionUi(activeId);
  st.messageQueue = [];
  removeQueuedTurns();
  updateLiveStrip();
  try {
    await interruptAndSend(payload);
  } catch (err) {
    appendBanner(`引导发送失败：${err?.message || err}`, "error");
  }
  refreshSendButtonState();
  ui.input?.focus();
}

function updateLiveStrip() {
  if (!ui.liveStrip) return;
  if (!activeId) {
    ui.liveStrip.classList.add("hidden");
    return;
  }
  ui.liveStrip.classList.remove("hidden");
  if (ui.stripModel) ui.stripModel.textContent = shortModelName(currentModelId) || "—";
  if (ui.stripEffort) {
    const lab = effortOptions.find((e) => e.id === currentEffort)?.label || currentEffort || "—";
    ui.stripEffort.textContent = lab;
  }
  if (ui.stripCwd) ui.stripCwd.textContent = shortPath(activeMeta?.cwd);
  if (ui.stripQueue) {
    if (messageQueue.length) {
      ui.stripQueue.classList.remove("hidden");
      ui.stripQueue.textContent = `队列 ${messageQueue.length}`;
    } else {
      ui.stripQueue.classList.add("hidden");
    }
  }
}

function renderContextChips() {
  if (!ui.contextChips) return;
  ui.contextChips.replaceChildren();
  if (!pendingFiles.length) {
    ui.contextChips.classList.add("hidden");
    return;
  }
  ui.contextChips.classList.remove("hidden");
  pendingFiles.forEach((f, idx) => {
    const chip = document.createElement("div");
    chip.className = "ctx-chip";
    chip.innerHTML = `<span></span><button type="button" title="移除">×</button>`;
    chip.querySelector("span").textContent = f.name || f.path;
    chip.querySelector("span").title = f.path;
    chip.querySelector("button").onclick = () => {
      pendingFiles.splice(idx, 1);
      renderContextChips();
      setComposerEnabled(!!activeId);
    };
    ui.contextChips.appendChild(chip);
  });
}

function buildPromptWithFiles(text, files) {
  if (!files?.length) return text || "";
  const parts = [];
  for (const f of files) {
    if (f.preview) {
      parts.push(`<file path="${f.path}">\n${f.preview}\n</file>`);
    } else {
      parts.push(`请参考文件：\`${f.path}\``);
    }
  }
  if (text) parts.push(text);
  return parts.join("\n\n");
}

function ensureSessionUi(sessionId) {
  if (!sessionId) return null;
  if (!sessionUi.has(sessionId)) {
    sessionUi.set(sessionId, {
      streamingEl: null,
      toolCardMap: new Map(),
      diffCardMap: new Map(),
      plan: null,
      scrollTop: 0,
      meta: null,
      models: null,
      commands: null,
      historyAssets: [],
      history: [],
      historyFrom: 0,
      seenMedia: new Set(),
      pendingImages: [],
      pendingFiles: [],
      messageQueue: [],
      statusState: "ready",
      statusDetail: "就绪",
      chunkBuf: { thought: "", assistant: "" },
      chunkRaf: 0,
    });
  }
  return sessionUi.get(sessionId);
}

/** Save composer attachments/queue/history for the session we're leaving. */
function stashComposer(sessionId) {
  if (!sessionId) return;
  const st = ensureSessionUi(sessionId);
  st.pendingImages = pendingImages.slice();
  st.pendingFiles = pendingFiles.slice();
  st.messageQueue = messageQueue.slice();
  st.historyAssets = historyAssets.slice();
  st.history = history.slice();
  st.historyFrom = historyFrom;
  st.seenMedia = new Set(seenMedia);
  st.scrollTop = ui.thread?.scrollTop || 0;
  st.streamingEl = streamingEl;
  st.statusState = ui.status?.dataset?.state || st.statusState;
  st.statusDetail = ui.status?.textContent || st.statusDetail;
  if (activeMeta?.id === sessionId) st.meta = { ...activeMeta };
}

/** Restore composer for the session we're entering. */
function restoreComposer(sessionId) {
  const st = ensureSessionUi(sessionId);
  pendingImages = (st.pendingImages || []).slice();
  pendingFiles = (st.pendingFiles || []).slice();
  messageQueue = (st.messageQueue || []).slice();
  historyAssets = (st.historyAssets || []).slice();
  history = (st.history || []).slice();
  historyFrom = st.historyFrom || 0;
  seenMedia = st.seenMedia instanceof Set ? new Set(st.seenMedia) : new Set();
  renderAttachPreview();
  renderContextChips();
  setComposerEnabled(!!sessionId && !connecting);
  if (messageQueue.length) rerenderQueuedTurns();
}

function ensurePane(sessionId) {
  if (!sessionId) return ui.inner;
  if (!threadPanes.has(sessionId)) {
    const el = document.createElement("div");
    el.className = "thread-inner";
    el.dataset.sessionId = sessionId;
    threadPanes.set(sessionId, el);
  }
  return threadPanes.get(sessionId);
}

function getPane(sessionId) {
  if (sessionId && sessionId === activeId) return ui.inner;
  if (sessionId && threadPanes.has(sessionId)) return threadPanes.get(sessionId);
  return ui.inner;
}

function activatePane(sessionId) {
  // stash scroll of current
  if (activeId && ui.inner) {
    const prev = ensureSessionUi(activeId);
    if (prev) prev.scrollTop = ui.thread.scrollTop;
    // detach current pane without destroying
    if (ui.inner.parentElement === ui.thread) {
      ui.thread.removeChild(ui.inner);
    }
    threadPanes.set(activeId, ui.inner);
  }
  const pane = ensurePane(sessionId);
  // clear thread and mount pane
  while (ui.thread.firstChild) ui.thread.removeChild(ui.thread.firstChild);
  ui.thread.appendChild(pane);
  ui.inner = pane;
  const st = ensureSessionUi(sessionId);
  toolCardMap = st.toolCardMap;
  diffCardMap = st.diffCardMap;
  streamingEl = st.streamingEl;
  ui.thread.scrollTop = st.scrollTop || 0;
  renderPlan(st.plan);
}

function addOpenTab(sessionId) {
  if (!sessionId) return;
  if (!openTabs.includes(sessionId)) openTabs.push(sessionId);
  renderTabs();
  schedulePersistTabs();
}

function removeOpenTab(sessionId) {
  openTabs = openTabs.filter((id) => id !== sessionId);
  threadPanes.delete(sessionId);
  sessionUi.delete(sessionId);
  workingSessions.delete(sessionId);
  liveAgents.delete(sessionId);
  renderTabs();
  schedulePersistTabs();
}

/** Debounced write of open tabs + last active session to desktop settings. */
function schedulePersistTabs() {
  clearTimeout(persistTabsTimer);
  persistTabsTimer = setTimeout(() => {
    void persistOpenTabs();
  }, 400);
}

async function persistOpenTabs() {
  try {
    const next = {
      openTabs: openTabs.slice(0, 12),
      lastActiveId: activeId || null,
    };
    desktopSettings = {
      ...desktopSettings,
      ...next,
    };
    await grokDesktop.saveDesktopSettings(next);
  } catch {
    /* ignore persistence errors */
  }
}

/** Prefer a short readable title from first user message. */
function titleFromUserText(text) {
  let t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  // drop leading list/markdown markers
  t = t.replace(/^(?:[#>*\-\d.、]+\s*)+/, "");
  // keep one line
  t = t.split(/[。！？\n]/)[0] || t;
  t = t.trim();
  if (t.length > 36) t = t.slice(0, 36).replace(/\s+\S*$/, "") || t.slice(0, 36);
  return t;
}

function looksLikeAutoTitle(title) {
  if (!title) return true;
  const t = String(title).trim();
  if (!t) return true;
  if (/^(新对话|新会话|Untitled|New chat|New conversation)$/i.test(t)) return true;
  // Long English CLI-generated titles often look like sentence case phrases
  if (/^[A-Za-z0-9][\w\s,./:&+\-]{20,}$/.test(t) && !/[\u4e00-\u9fff]/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Highlight query inside currently rendered message bodies and scroll to first hit.
 * @returns {boolean} true if found
 */
function highlightSearchInThread(query) {
  const q = String(query || "").trim();
  clearSearchHighlight();
  if (!q || !ui.inner) return false;
  const qLow = q.toLowerCase();
  const bodies = ui.inner.querySelectorAll(".turn .body");
  let firstMark = null;
  for (const body of bodies) {
    const text = body.textContent || "";
    const low = text.toLowerCase();
    let from = 0;
    let idx = low.indexOf(qLow, from);
    if (idx < 0) continue;
    // rebuild with marks (first 8 hits per body)
    const frag = document.createDocumentFragment();
    let hits = 0;
    while (idx >= 0 && hits < 8) {
      if (idx > from) frag.appendChild(document.createTextNode(text.slice(from, idx)));
      const mark = document.createElement("mark");
      mark.className = "search-hl-mark";
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      if (!firstMark) firstMark = mark;
      hits++;
      from = idx + q.length;
      idx = low.indexOf(qLow, from);
    }
    if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)));
    body.replaceChildren(frag);
    body.closest(".turn")?.classList.add("search-hl-turn");
  }
  if (firstMark) {
    firstMark.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }
  return false;
}

function clearSearchHighlight() {
  if (!ui.inner) return;
  ui.inner.querySelectorAll(".turn.search-hl-turn").forEach((el) => el.classList.remove("search-hl-turn"));
  // restore plain text for marked bodies, then re-linkify URLs
  ui.inner.querySelectorAll(".turn .body").forEach((body) => {
    if (!body.querySelector("mark.search-hl-mark")) return;
    const t = body.textContent || "";
    if (/https?:\/\//i.test(t)) setMessageBody(body, t);
    else body.textContent = t;
  });
}

/** Open session then highlight search query in the thread. */
async function openSessionWithHighlight(sessionId, query) {
  lastSearchQuery = query || "";
  if (view !== "chat") switchView("chat");
  await selectSession(sessionId);
  if (!lastSearchQuery) return;
  // allow pane to settle
  await new Promise((r) => requestAnimationFrame(() => r()));
  let found = highlightSearchInThread(lastSearchQuery);
  // If not in visible window, load earlier history once
  if (!found && historyFrom > 0) {
    historyFrom = 0;
    renderHistory();
    found = highlightSearchInThread(lastSearchQuery);
  }
  if (!found) {
    appendBanner(
      `已打开会话，当前预览未定位到「${lastSearchQuery}」（可能仅标题匹配，或内容在更早历史）`,
    );
  }
}

/** Suggest title from session history (first good user message). */
async function smartTitleSession(sessionId) {
  if (!sessionId) return false;
  try {
    let messages = [];
    if (sessionId === activeId && history?.length) {
      messages = history;
    } else {
      const hist = await grokDesktop.loadHistory(sessionId);
      messages = hist?.messages || [];
    }
    const userMsgs = messages.filter((m) => m.role === "user" && (m.text || "").trim());
    // Prefer a Chinese message if any
    const zh = userMsgs.find((m) => /[\u4e00-\u9fff]/.test(m.text));
    const pick = zh || userMsgs[0];
    const title = titleFromUserText(pick?.text || "");
    if (!title) {
      alert("没找到可用的用户消息来起名");
      return false;
    }
    // Confirm with editable default
    const finalTitle = await askText({
      title: "智能起名",
      message: "根据首条用户消息生成，可再改：",
      defaultValue: title,
      okLabel: "应用",
    });
    if (!finalTitle) return false;
    const s = await grokDesktop.renameSession(sessionId, finalTitle);
    sessions = sessions.map((x) =>
      x.id === sessionId
        ? { ...x, title: finalTitle, summary: finalTitle, updatedAt: s?.updatedAt || x.updatedAt }
        : x,
    );
    const st = ensureSessionUi(sessionId);
    if (st) st.meta = { ...(st.meta || {}), title: finalTitle, id: sessionId };
    if (sessionId === activeId) {
      applyHeader({ ...activeMeta, ...s, title: finalTitle, id: sessionId });
    }
    renderSidebar(ui.search.value);
    markActive(activeId);
    renderTabs();
    return true;
  } catch (err) {
    alert(err.message || err);
    return false;
  }
}

function hideSessionCtx() {
  const menu = $("session-ctx");
  if (menu) menu.classList.add("hidden");
  ctxSessionId = null;
}

function showSessionCtx(x, y, sessionId) {
  const menu = $("session-ctx");
  if (!menu) return;
  ctxSessionId = sessionId;
  // dynamic labels
  const pinBtn = $("ctx-pin");
  const archBtn = $("ctx-archive");
  if (pinBtn) pinBtn.textContent = isPinned(sessionId) ? "取消置顶" : "置顶";
  if (archBtn) archBtn.textContent = isArchived(sessionId) ? "取消归档" : "归档";
  const s = sessions.find((x) => x.id === sessionId);
  const cwdBtn = menu.querySelector('[data-act="copy-cwd"]');
  if (cwdBtn) cwdBtn.disabled = !s?.cwd;
  menu.classList.remove("hidden");
  // measure then clamp to viewport (menu grew with more actions)
  const pad = 8;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const mw = menu.offsetWidth || 200;
  const mh = menu.offsetHeight || 320;
  let left = x;
  let top = y;
  if (left + mw > window.innerWidth - pad) left = window.innerWidth - mw - pad;
  if (top + mh > window.innerHeight - pad) top = window.innerHeight - mh - pad;
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${Math.max(pad, top)}px`;
}

function tabTitle(sessionId) {
  const s = sessions.find((x) => x.id === sessionId);
  return s?.title || activeMeta?.id === sessionId ? activeMeta?.title : null || sessionId.slice(0, 8);
}

function sessionTabTitle(id) {
  if (id === activeId && activeMeta?.title) return activeMeta.title;
  const cached = sessionUi.get(id)?.meta?.title;
  if (cached) return cached;
  const s = sessions.find((x) => x.id === id);
  return s?.title || id.slice(0, 8);
}

/**
 * 顶栏会话标签已隐藏（与左侧「最近会话」重复，用户反馈多余）。
 * openTabs 仍在后台维护，用于并行 agent / 软切换 / Ctrl+Tab。
 */
function renderTabs() {
  if (!ui.sessionTabs) return;
  ui.sessionTabs.classList.add("hidden");
  ui.sessionTabs.replaceChildren();
}

/** Ctrl/Cmd+Tab cycle open session tabs */
function cycleTab(dir = 1) {
  if (openTabs.length < 2) return;
  const idx = Math.max(0, openTabs.indexOf(activeId));
  const next = openTabs[(idx + dir + openTabs.length) % openTabs.length];
  if (next) void selectSession(next);
}

/** True if the chat thread is already near the bottom (user wants stick-to-bottom). */
function isThreadNearBottom(threshold = 120) {
  const el = ui.thread;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/**
 * Scroll thread to bottom only when user is already following the stream.
 * Avoids layout thrash + fighting the user when they scroll up to read.
 */
function scrollThreadToBottom({ force = false } = {}) {
  if (!ui.thread) return;
  if (!force && !isThreadNearBottom(140)) return;
  // rAF: coalesce multiple scroll requests in the same frame
  if (scrollThreadToBottom._raf) return;
  scrollThreadToBottom._raf = requestAnimationFrame(() => {
    scrollThreadToBottom._raf = 0;
    if (ui.thread) ui.thread.scrollTop = ui.thread.scrollHeight;
  });
}

/** Throttle full tab-bar rebuilds (was firing every background chunk). */
let tabsRenderTimer = 0;
function scheduleRenderTabs(immediate = false) {
  if (immediate) {
    if (tabsRenderTimer) {
      clearTimeout(tabsRenderTimer);
      tabsRenderTimer = 0;
    }
    renderTabs();
    return;
  }
  if (tabsRenderTimer) return;
  tabsRenderTimer = setTimeout(() => {
    tabsRenderTimer = 0;
    renderTabs();
  }, 200);
}

function forSession(payload, fn, { scroll = false, tabs = true } = {}) {
  const sid = payload?.sessionId || activeId;
  if (!sid) return;
  // Always route into the correct pane (even if not focused)
  const pane = getPane(sid);
  const st = ensureSessionUi(sid);
  const isActive = sid === activeId;
  // Temporarily swap maps/streaming for card updates
  const prevTool = toolCardMap;
  const prevDiff = diffCardMap;
  const prevStream = streamingEl;
  const prevInner = ui.inner;
  toolCardMap = st.toolCardMap;
  diffCardMap = st.diffCardMap;
  streamingEl = st.streamingEl;
  ui.inner = pane;
  try {
    fn(sid, st, isActive);
  } finally {
    st.streamingEl = streamingEl;
    st.toolCardMap = toolCardMap;
    st.diffCardMap = diffCardMap;
    if (isActive) {
      // keep ui.inner as active pane
    } else {
      toolCardMap = prevTool;
      diffCardMap = prevDiff;
      streamingEl = prevStream;
      ui.inner = prevInner;
    }
  }
  // Default: do NOT scroll on every event (streaming uses batched flush instead)
  if (scroll && isActive) scrollThreadToBottom();
  else if (!isActive && tabs) scheduleRenderTabs();
}

/**
 * Batch stream tokens into one DOM write per animation frame.
 * Long chats used to reflow on every tiny chunk (textContent += + scroll).
 */
function enqueueStreamChunk(payload) {
  const { kind, text } = payload || {};
  if (!text) return;
  const sid = payload?.sessionId || activeId;
  if (!sid) return;
  const st = ensureSessionUi(sid);
  if (!st.chunkBuf) st.chunkBuf = { thought: "", assistant: "" };
  if (kind === "thought") st.chunkBuf.thought += text;
  else st.chunkBuf.assistant += text;

  if (st.chunkRaf) return;
  st.chunkRaf = requestAnimationFrame(() => {
    st.chunkRaf = 0;
    flushStreamChunks(sid);
  });
}

function flushStreamChunks(sid) {
  const st = ensureSessionUi(sid);
  if (!st?.chunkBuf) return;
  const isActive = sid === activeId;
  // Don't drop tokens while connecting — keep buffer for next frame
  if (isActive && connecting) {
    if (!st.chunkRaf) {
      st.chunkRaf = requestAnimationFrame(() => {
        st.chunkRaf = 0;
        flushStreamChunks(sid);
      });
    }
    return;
  }

  const thought = st.chunkBuf.thought;
  const assistant = st.chunkBuf.assistant;
  st.chunkBuf.thought = "";
  st.chunkBuf.assistant = "";
  if (!thought && !assistant) return;

  // Apply into the correct pane without forSession's per-call scroll
  const pane = getPane(sid);
  const prevInner = ui.inner;
  const prevStream = streamingEl;
  ui.inner = pane;
  streamingEl = st.streamingEl;
  try {
    if (thought && desktopSettings.showThinking !== false) {
      if (!streamingEl || streamingEl.dataset.kind !== "thought") {
        ui.inner.querySelector(".welcome")?.remove();
        const row = document.createElement("div");
        row.className = "thought";
        row.dataset.kind = "thought";
        row.textContent = thought;
        ui.inner.appendChild(row);
        streamingEl = row;
      } else {
        // One DOM write per frame for the accumulated delta
        streamingEl.appendChild(document.createTextNode(thought));
      }
    }
    if (assistant) {
      if (!streamingEl || streamingEl.dataset.kind !== "assistant") {
        streamingEl = appendTurn("assistant", assistant, {
          stream: true,
          clampable: false,
          skipScroll: true,
        });
        streamingEl.dataset.kind = "assistant";
      } else {
        // appendChild(Text) is cheaper than textContent += on huge strings
        streamingEl.appendChild(document.createTextNode(assistant));
      }
    }
  } finally {
    st.streamingEl = streamingEl;
    if (isActive) {
      // keep globals on active pane
    } else {
      streamingEl = prevStream;
      ui.inner = prevInner;
      scheduleRenderTabs();
    }
  }
  if (isActive) scrollThreadToBottom();
}

/** Mark stream finished so old turns can use content-visibility again. */
function endStreamChrome(sid) {
  const pane = sid ? getPane(sid) : ui.inner;
  pane?.querySelectorAll?.(".turn.streaming").forEach((el) => {
    el.classList.remove("streaming");
    // Coalesce many Text nodes from streaming, then make URLs clickable
    const body = el.querySelector(".body");
    if (body) {
      const t = body.textContent || "";
      if (/https?:\/\//i.test(t)) setMessageBody(body, t);
      else if (body.childNodes.length > 1) body.textContent = t;
      else body.dataset.linkified = "1";
    }
  });
  // Also coalesce thought rows
  pane?.querySelectorAll?.(".thought").forEach((el) => {
    if (el.childNodes.length > 1) {
      const t = el.textContent;
      el.textContent = t;
    }
  });
}

function buildToolDetailText(payload) {
  const bits = [];
  if (payload.kind) bits.push(`kind: ${payload.kind}`);
  if (payload.rawInput) {
    try {
      bits.push(
        typeof payload.rawInput === "string"
          ? payload.rawInput
          : JSON.stringify(payload.rawInput, null, 2),
      );
    } catch {
      bits.push(String(payload.rawInput));
    }
  }
  if (payload.rawOutput) {
    try {
      bits.push(
        "--- output ---\n" +
          (typeof payload.rawOutput === "string"
            ? payload.rawOutput
            : JSON.stringify(payload.rawOutput, null, 2)),
      );
    } catch {
      bits.push(String(payload.rawOutput));
    }
  }
  return bits.join("\n\n").slice(0, 6000);
}

function appendToolCard(payload) {
  ui.inner.querySelector(".welcome")?.remove();
  const id = payload.toolCallId || `t-${Date.now()}`;
  let card = toolCardMap.get(id);
  if (!card) {
    card = document.createElement("div");
    card.className = "tool-card";
    card.dataset.id = id;
    card._detail = "";
    card.innerHTML = `
      <button type="button" class="tool-card-head">
        <span class="t-status"></span>
        <span class="t-title"></span>
        <span class="t-chev">▾</span>
      </button>
      <div class="tool-card-body"><pre class="tool-pre-empty">展开查看详情</pre></div>`;
    // Lazy: only paint huge pre when user opens the card
    card.querySelector(".tool-card-head").onclick = () => {
      const open = card.classList.toggle("open");
      const pre = card.querySelector("pre");
      if (open && card._detail) {
        pre.classList.remove("tool-pre-empty");
        pre.textContent = card._detail;
      } else if (!open && pre && !pre.classList.contains("tool-pre-empty")) {
        // Drop heavy DOM when collapsed — big win on long chats
        pre.classList.add("tool-pre-empty");
        pre.textContent = "展开查看详情";
      }
    };
    ui.inner.appendChild(card);
    toolCardMap.set(id, card);
  }
  const status = (payload.status || "running").toLowerCase();
  const st = card.querySelector(".t-status");
  st.textContent = statusLabelZh(TOOL_STATUS_ZH, status);
  st.title = status;
  st.className = "t-status " + status.replace(/\s+/g, "-");
  card.querySelector(".t-title").textContent = payload.title || payload.kind || "工具";
  // Store detail; only write into DOM if currently open
  const detail = buildToolDetailText(payload);
  if (detail) card._detail = detail;
  if (card.classList.contains("open") && card._detail) {
    const pre = card.querySelector("pre");
    pre.classList.remove("tool-pre-empty");
    pre.textContent = card._detail;
  }
  scrollThreadToBottom();
  return card;
}

function appendDiffCard(change) {
  if (!change?.path && !change?.relativePath) return;
  ui.inner.querySelector(".welcome")?.remove();
  const absPath = change.path || "";
  const id = change.toolCallId || absPath || `d-${Date.now()}`;
  let card = diffCardMap.get(id);
  if (!card) {
    card = document.createElement("div");
    // Only keep the newest few diffs expanded — long chats stay scrollable
    const openCount = ui.inner.querySelectorAll(".diff-card.open").length;
    card.className = "diff-card" + (openCount < MAX_OPEN_DIFFS ? " open" : "");
    card.dataset.id = id;
    card.innerHTML = `
      <button type="button" class="diff-card-head">
        <span class="d-badge">diff</span>
        <span class="d-path"></span>
        <span class="d-stats"></span>
        <span class="t-chev">▾</span>
      </button>
      <div class="diff-actions">
        <button type="button" class="d-act" data-act="open" title="用系统默认程序打开">打开</button>
        <button type="button" class="d-act" data-act="reveal" title="在文件管理器中显示">定位</button>
        <button type="button" class="d-act" data-act="copy" title="复制绝对路径">复制路径</button>
      </div>
      <div class="diff-card-body"></div>
      <div class="diff-foot hidden"></div>`;
    card.querySelector(".diff-card-head").onclick = (e) => {
      if (e.target.closest(".d-path")) return;
      card.classList.toggle("open");
    };
    // Auto-collapse older open diffs
    if (card.classList.contains("open")) {
      const opens = [...ui.inner.querySelectorAll(".diff-card.open")];
      for (let i = 0; i < opens.length - MAX_OPEN_DIFFS; i++) {
        opens[i].classList.remove("open");
      }
    }
    card.querySelector(".diff-actions").addEventListener("click", async (e) => {
      const btn = e.target.closest(".d-act");
      if (!btn) return;
      e.stopPropagation();
      const p = card.dataset.path;
      if (!p) return;
      const act = btn.dataset.act;
      try {
        if (act === "open") {
          await grokDesktop.openPath(p);
        } else if (act === "reveal") {
          await grokDesktop.showItem(p);
        } else if (act === "copy") {
          await navigator.clipboard?.writeText(p);
          btn.textContent = "已复制";
          setTimeout(() => {
            btn.textContent = "复制路径";
          }, 1200);
        }
      } catch (err) {
        appendBanner(`操作失败：${err.message || err}`, "error");
      }
    });
    // Click path → reveal in folder (product: fastest path to the file)
    card.querySelector(".d-path").addEventListener("click", async (e) => {
      e.stopPropagation();
      const p = card.dataset.path;
      if (p) {
        try {
          await grokDesktop.showItem(p);
        } catch {
          /* ignore */
        }
      }
    });
    ui.inner.appendChild(card);
    diffCardMap.set(id, card);
  }

  card.dataset.path = absPath;
  const pathLabel = change.basename || change.relativePath || absPath;
  const pathEl = card.querySelector(".d-path");
  pathEl.textContent = pathLabel;
  pathEl.title = absPath || pathLabel;

  const add = change.stats?.added ?? 0;
  const del = change.stats?.deleted ?? 0;
  const isNew = change.exists === false;
  card.querySelector(".d-stats").innerHTML =
    `<span class="add">+${add}</span> <span class="del">−${del}</span>` +
    (isNew ? ' <span class="d-new">新文件</span>' : "");

  const status = String(change.status || "").toLowerCase();
  card.classList.toggle("done", /complete|ok|success/.test(status));
  card.classList.toggle("running", /run|pend|in_progress|updated/.test(status) && !/complete|ok/.test(status));

  // Keep hunks on the card; only paint lines when expanded (long-chat scroll win)
  card._hunks = Array.isArray(change.hunks) ? change.hunks : [];
  card._trunc = change.truncated || {};
  card._absPath = absPath;

  const head = card.querySelector(".diff-card-head");
  if (head && !head._lazyBound) {
    head._lazyBound = true;
    head.addEventListener("click", () => {
      // after toggle in other handler — next frame paint
      requestAnimationFrame(() => {
        if (card.classList.contains("open")) paintDiffBody(card);
        else {
          card.querySelector(".diff-card-body")?.replaceChildren();
        }
      });
    });
  }
  if (card.classList.contains("open")) paintDiffBody(card);
  else card.querySelector(".diff-card-body")?.replaceChildren();

  scrollThreadToBottom();
  return card;
}

function paintDiffBody(card) {
  const body = card.querySelector(".diff-card-body");
  if (!body) return;
  body.replaceChildren();
  const hunks = card._hunks || [];
  let sameRun = 0;
  const MAX_SAME = 2;
  let rendered = 0;
  const MAX_RENDER = 120;
  for (const h of hunks) {
    if (rendered >= MAX_RENDER) break;
    if (h.type === "same") {
      sameRun++;
      if (sameRun > MAX_SAME) continue;
    } else if (h.type === "meta") {
      sameRun = 0;
      const line = document.createElement("div");
      line.className = "diff-line meta";
      line.textContent = h.text ?? "";
      body.appendChild(line);
      rendered++;
      continue;
    } else {
      sameRun = 0;
    }
    const line = document.createElement("div");
    line.className = `diff-line ${h.type || "same"}`;
    const tx = document.createElement("span");
    tx.className = "tx";
    tx.textContent = h.text ?? "";
    const ln = document.createElement("span");
    ln.className = "ln";
    line.append(ln, tx);
    body.appendChild(line);
    rendered++;
  }
  if (!hunks.length) {
    const empty = document.createElement("div");
    empty.className = "diff-line same";
    empty.textContent = "（无行级差异预览）";
    body.appendChild(empty);
  } else if (hunks.length > MAX_RENDER) {
    const more = document.createElement("div");
    more.className = "diff-line meta";
    more.textContent = `… 仅预览前 ${MAX_RENDER} 行，点「打开」查看完整文件`;
    body.appendChild(more);
  }

  const foot = card.querySelector(".diff-foot");
  if (!foot) return;
  const tr = card._trunc || {};
  const notes = [];
  if (tr.fileTooLarge) {
    notes.push(
      `原文件过大${tr.fileSize ? `（${formatBytesUi(tr.fileSize)}）` : ""}，已跳过全文对比`,
    );
  } else if (tr.lines) {
    notes.push(
      `预览截断：最多 ${tr.maxLines || 200} 行（${tr.beforeLines ?? "?"} → ${tr.afterLines ?? "?"} 行）`,
    );
  }
  if (card._absPath) notes.push(card._absPath);
  if (notes.length) {
    foot.classList.remove("hidden");
    foot.textContent = notes.join(" · ");
  } else {
    foot.classList.add("hidden");
  }
}

function formatBytesUi(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizePlanEntries(update) {
  if (!update) return [];
  const entries =
    update.entries ||
    update.plan ||
    update.items ||
    update.steps ||
    (Array.isArray(update) ? update : null);
  if (!Array.isArray(entries)) {
    // single content blob
    if (update.content || update.text) {
      return [{ content: update.content || update.text, status: update.status || "pending" }];
    }
    return [];
  }
  return entries.map((e) => {
    if (typeof e === "string") return { content: e, status: "pending" };
    return {
      content: e.content || e.text || e.title || e.description || JSON.stringify(e),
      status: e.status || e.state || "pending",
      priority: e.priority,
    };
  });
}

const PLAN_STATUS_ZH = {
  pending: "待办",
  todo: "待办",
  in_progress: "进行中",
  inprogress: "进行中",
  running: "进行中",
  active: "进行中",
  completed: "完成",
  complete: "完成",
  done: "完成",
  success: "完成",
  cancelled: "已取消",
  canceled: "已取消",
  failed: "失败",
  error: "失败",
  blocked: "受阻",
};

const TOOL_STATUS_ZH = {
  running: "运行中",
  pending: "等待",
  in_progress: "运行中",
  updated: "更新中",
  completed: "完成",
  complete: "完成",
  success: "完成",
  failed: "失败",
  error: "失败",
  cancelled: "已取消",
  canceled: "已取消",
};

function statusLabelZh(map, raw) {
  const key = String(raw || "").toLowerCase().replace(/\s+/g, "_");
  return map[key] || raw || "";
}

function renderPlan(planData) {
  if (!ui.planList) return;
  const entries = normalizePlanEntries(planData);
  const badge = $("plan-badge");
  const progress = $("plan-progress");
  const stripBtn = $("btn-plan-toggle-strip");

  // Plan toggle lives in topbar (session-actions) — always available when session open.
  // Do NOT hide the button when empty; empty state is shown inside the panel.
  ui.planToggle?.classList.remove("hidden");
  if (stripBtn) {
    if (entries.length) stripBtn.classList.remove("hidden");
    else stripBtn.classList.add("hidden");
  }

  if (!entries.length) {
    ui.planList.innerHTML = `<div class="plan-empty">${t("chat.planEmpty")}</div>`;
    ui.planDot?.classList.add("hidden");
    ui.planToggle?.classList.remove("has-plan");
    stripBtn?.classList.remove("has-plan");
    if (badge) {
      badge.classList.add("hidden");
      badge.classList.remove("done");
      badge.textContent = "0";
    }
    if (progress) {
      progress.classList.add("hidden");
      progress.textContent = "";
    }
    return;
  }

  ui.planDot?.classList.remove("hidden");
  ui.planToggle?.classList.add("has-plan");
  stripBtn?.classList.add("has-plan");

  const done = entries.filter((e) =>
    /completed|done|success/i.test(String(e.status || "")),
  ).length;
  if (badge) {
    badge.textContent = String(entries.length);
    badge.classList.remove("hidden");
    badge.classList.toggle("done", done === entries.length && entries.length > 0);
  }
  if (progress) {
    progress.textContent = `${done}/${entries.length}`;
    progress.classList.remove("hidden");
  }

  ui.planList.replaceChildren();
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "plan-item";
    const st = String(e.status || "pending").toLowerCase().replace(/\s+/g, "_");
    row.innerHTML = `<span class="p-status"></span><span class="p-content"></span>`;
    row.querySelector(".p-status").textContent = statusLabelZh(PLAN_STATUS_ZH, st);
    row.querySelector(".p-status").className = "p-status " + st;
    row.querySelector(".p-status").title = st;
    row.querySelector(".p-content").textContent = e.content || "";
    ui.planList.appendChild(row);
  }
}

function setPlanOpen(on) {
  planOpen = !!on;
  ui.planPanel?.classList.toggle("hidden", !planOpen);
  ui.planToggle?.classList.toggle("active", planOpen);
  $("btn-plan-toggle-strip")?.classList.toggle("active", planOpen);
}

function isEventForActive(payload) {
  // Events without sessionId are treated as active (legacy)
  if (!payload?.sessionId) return true;
  return payload.sessionId === activeId;
}

function appendPermissionCard(req) {
  ui.inner.querySelector(".welcome")?.remove();
  const card = document.createElement("div");
  card.className = "perm-card";
  const title = req.toolCall?.title || req.toolCall?.kind || t("perm.toolDefault");
  const raw = req.toolCall?.rawInput || req.toolCall?.input;
  let detail = "";
  try {
    detail = raw ? (typeof raw === "string" ? raw : JSON.stringify(raw, null, 2)) : "";
  } catch {
    detail = String(raw || "");
  }
  card.innerHTML = `
    <h4></h4>
    <p></p>
    <pre class="perm-detail"></pre>
    <div class="perm-actions"></div>`;
  card.querySelector("h4").textContent = t("perm.needApprove");
  card.querySelector("p").textContent = title;
  const pre = card.querySelector("pre");
  if (detail) pre.textContent = detail.slice(0, 4000);
  else pre.remove();
  const actions = card.querySelector(".perm-actions");
  const options = req.options?.length
    ? req.options
    : [
        { optionId: "allow_once", name: t("perm.allowOnce") },
        { optionId: "reject_once", name: t("perm.reject") },
      ];
  for (const opt of options) {
    const btn = document.createElement("button");
    btn.type = "button";
    const oid = opt.optionId || opt.kind || "";
    const isAllow = /allow/i.test(oid) || /allow|允许|批准/i.test(opt.name || "");
    btn.className = "btn " + (isAllow ? "primary" : "ghost");
    btn.textContent = opt.name || oid;
    btn.onclick = async () => {
      actions.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        await grokDesktop.respondPermission(req.id, oid, req.sessionId);
        card.style.opacity = "0.55";
        const tag = document.createElement("div");
        tag.style.cssText = "font-size:11px;color:var(--muted);margin-top:6px";
        tag.textContent = `${t("perm.selected")}${opt.name || oid}`;
        card.appendChild(tag);
      } catch (err) {
        appendBanner(`${t("perm.fail")}${err.message}`, "error");
      }
    };
    actions.appendChild(btn);
  }
  ui.inner.appendChild(card);
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

/** Run a real slash command against the live agent (no placeholders). */
async function runRealSlash(command, args) {
  if (!activeId) {
    appendBanner("请先打开一个会话", "error");
    return;
  }
  const cmd = String(command || "").replace(/^\//, "");
  const sid = activeId;
  appendTurn("user", args ? `/${cmd} ${args}` : `/${cmd}`, { clampable: false });
  streamingEl = null;
  workingSessions.add(sid);
  renderTabs();
  setBusy(true);
  setStatus("working", `/${cmd}…`);
  try {
    await grokDesktop.runSlash(cmd, args || undefined, sid);
    if (activeId === sid) setStatus("ready", "就绪");
  } catch (err) {
    // fallback: normal prompt path
    try {
      await grokDesktop.prompt({
        text: args ? `/${cmd} ${args}` : `/${cmd}`,
        sessionId: sid,
      });
      if (activeId === sid) setStatus("ready", "就绪");
    } catch (err2) {
      if (activeId === sid) {
        setStatus("error", err2.message || err.message);
        appendBanner(`命令失败：${err2.message || err.message}`, "error");
      }
    }
  } finally {
    workingSessions.delete(sid);
    renderTabs();
    if (activeId === sid) {
      streamingEl = null;
      setBusy(false);
    }
  }
}

function setBusy(v) {
  busy = !!v;
  // Keep composer open for 插话 while agent works
  setComposerEnabled(!!activeId && !connecting);
  refreshSendButtonState();
  autosize();
}

function autosize() {
  ui.input.style.height = "auto";
  ui.input.style.height = Math.min(ui.input.scrollHeight, 130) + "px";
}

// ── Views ──────────────────────────────────────────────

function switchView(name) {
  closeModelPop();
  view = name;

  // Desktop layout: settings takes over the full app chrome.
  document.getElementById("app")?.classList.toggle("settings-mode", name === "settings");

  document.querySelectorAll(".view").forEach((el) => {
    el.classList.toggle("active", el.id === `view-${name}`);
  });
  document.querySelectorAll(".rail-item[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  ui.navSettings?.classList.toggle("active", name === "settings");

  if (name !== "settings") {
    ui.sessionSection.style.display = name === "chat" ? "" : "none";
  }
  if (name === "memory") void loadMemory();
  if (name === "skills") void loadSkills();
  if (name === "plugins") void loadPlugins();
  if (name === "settings") {
    showSettingsPanel(settingsPanel || "general");
    void loadSettings();
  }
}

// closeEffort when closing model
function closeAllPops() {
  closeModelPop();
  closeEffortPop();
}

document.querySelectorAll(".rail-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

ui.navSettings?.addEventListener("click", () => switchView("settings"));
ui.settingsBack?.addEventListener("click", () => switchView("chat"));

function showSettingsPanel(id) {
  settingsPanel = id || "general";
  document.querySelectorAll(".settings-panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.panel === settingsPanel);
  });
  document.querySelectorAll(".sn-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === settingsPanel);
  });
  if (settingsPanel === "skills") void fillSettingsSkills();
  if (settingsPanel === "plugins") void fillSettingsPlugins();
  if (settingsPanel === "mcp") void fillSettingsMcp();
}

async function fillSettingsSkills() {
  const box = $("settings-skills-list");
  if (!box) return;
  box.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const list = await grokDesktop.listSkills();
    box.replaceChildren();
    if (!list.length) {
      box.innerHTML =
        '<div class="list-empty">未发现 Skills<br><span style="opacity:.8">可在侧栏 Skills 页新建，或放入 ~/.grok/skills</span></div>';
      return;
    }
    // 设置页只显示摘要（最多 12 条）
    const shown = list.slice(0, 12);
    for (const s of shown) {
      const row = document.createElement("div");
      row.className = "embed-item";
      row.innerHTML = `<div><div class="name"></div><div class="sub"></div></div><button type="button" class="btn ghost">调用</button>`;
      row.querySelector(".name").textContent = s.name;
      row.querySelector(".sub").textContent = (s.description || s.scope || "").slice(0, 120);
      row.querySelector("button").onclick = async () => {
        switchView("chat");
        if (!activeId) {
          appendBanner("请先打开会话，再调用 Skill", "error");
          return;
        }
        await runRealSlash(s.name);
      };
      box.appendChild(row);
    }
    if (list.length > shown.length) {
      const more = document.createElement("div");
      more.className = "list-empty";
      more.style.padding = "8px";
      more.textContent = `另有 ${list.length - shown.length} 个 · 在侧栏 Skills 查看全部`;
      box.appendChild(more);
    }
  } catch (err) {
    box.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

async function fillSettingsPlugins() {
  const box = $("settings-plugins-list");
  if (!box) return;
  box.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const list = await grokDesktop.listInstalledPlugins();
    box.replaceChildren();
    if (!list?.length) {
      box.innerHTML = '<div class="list-empty">尚未安装插件</div>';
      return;
    }
    for (const p of list) {
      const name = p.name || "plugin";
      const row = document.createElement("div");
      row.className = "embed-item";
      row.innerHTML = `<div><div class="name"></div><div class="sub"></div></div><button type="button" class="btn danger">卸载</button>`;
      row.querySelector(".name").textContent = name;
      row.querySelector(".sub").textContent = p.description || p.status || "";
      row.querySelector("button").onclick = async () => {
        if (!confirm(`卸载 ${name}？`)) return;
        await grokDesktop.uninstallPlugin(name);
        await fillSettingsPlugins();
      };
      box.appendChild(row);
    }
  } catch (err) {
    box.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

async function fillSettingsMcp() {
  const box = $("settings-mcp-list");
  if (!box) return;
  box.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const data = await grokDesktop.listMcp();
    box.replaceChildren();
    if (data.error && !data.servers?.length) {
      box.innerHTML = `<div class="list-error">${data.error}</div>`;
      return;
    }
    if (!data.servers?.length) {
      box.innerHTML = `<div class="list-empty">${data.raw || "未配置 MCP 服务器"}</div>`;
      return;
    }
    for (const s of data.servers) {
      const row = document.createElement("div");
      row.className = "embed-item";
      row.innerHTML = `<div><div class="name"></div><div class="sub"></div></div><button type="button" class="btn danger">移除</button>`;
      row.querySelector(".name").textContent = s.name;
      row.querySelector(".sub").textContent = s.line || "";
      row.querySelector("button").onclick = async () => {
        if (!confirm(`移除 MCP ${s.name}？`)) return;
        await grokDesktop.removeMcp(s.name);
        await fillSettingsMcp();
      };
      box.appendChild(row);
    }
  } catch (err) {
    box.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

$("settings-plugin-install")?.addEventListener("click", async () => {
  const spec = $("settings-plugin-spec")?.value?.trim();
  if (!spec) return;
  try {
    await grokDesktop.installPlugin(spec);
    $("settings-plugin-spec").value = "";
    await fillSettingsPlugins();
  } catch (err) {
    alert(err.message || err);
  }
});
$("mcp-add")?.addEventListener("click", async () => {
  const name = $("mcp-name")?.value?.trim();
  const cmd = $("mcp-cmd")?.value?.trim();
  if (!name || !cmd) return alert("填写名称和命令");
  try {
    // split command into parts for grok mcp add
    const parts = cmd.match(/(?:[^\s"]+|"[^"]*")+/g) || [cmd];
    const command = parts[0].replace(/^"|"$/g, "");
    const args = parts.slice(1).map((p) => p.replace(/^"|"$/g, ""));
    await grokDesktop.addMcp({ name, command, args });
    $("mcp-name").value = "";
    $("mcp-cmd").value = "";
    await fillSettingsMcp();
  } catch (err) {
    alert(err.message || err);
  }
});
$("mcp-doctor")?.addEventListener("click", async () => {
  const out = $("mcp-doctor-out");
  if (out) {
    out.classList.remove("hidden");
    out.textContent = "诊断中…";
  }
  try {
    const r = await grokDesktop.doctorMcp();
    if (out) out.textContent = r.output || "完成";
  } catch (err) {
    if (out) out.textContent = err.message || String(err);
  }
});

document.querySelectorAll(".sn-item").forEach((btn) => {
  btn.addEventListener("click", () => showSettingsPanel(btn.dataset.panel));
});

ui.settingsSearch?.addEventListener("input", () => {
  const q = (ui.settingsSearch.value || "").trim().toLowerCase();
  document.querySelectorAll(".sn-item").forEach((btn) => {
    const text = btn.textContent.toLowerCase();
    btn.classList.toggle("hidden-by-search", !!q && !text.includes(q));
  });
});

$("settings-goto-memory")?.addEventListener("click", () => switchView("memory"));
$("settings-goto-skills")?.addEventListener("click", () => switchView("skills"));
$("settings-goto-plugins")?.addEventListener("click", () => switchView("plugins"));

// ── Model picker ───────────────────────────────────────

function shortModelName(id) {
  if (!id) return "模型";
  // grok-4.5 -> 4.5, grok-composer-2.5-fast -> 2.5
  const m = String(id).match(/(\d+\.\d+)/);
  if (m) return m[1];
  return String(id).replace(/^grok-?/i, "").slice(0, 10) || "模型";
}

function setModelsState(modelsPayload) {
  if (!modelsPayload) return;
  if (Array.isArray(modelsPayload.availableModels)) {
    availableModels = modelsPayload.availableModels;
    // pick effort options from current model meta if present
    const cur = availableModels.find((m) => m.modelId === (modelsPayload.currentModelId || currentModelId));
    const efforts = cur?._meta?.reasoningEfforts || cur?.reasoningEfforts;
    if (Array.isArray(efforts) && efforts.length) {
      effortOptions = efforts.map((e) => ({
        id: e.value || e.id,
        label: e.label || e.value || e.id,
      }));
      const def = efforts.find((e) => e.default) || efforts[0];
      if (def) currentEffort = def.value || def.id;
    }
    if (cur?._meta?.reasoningEffort) currentEffort = cur._meta.reasoningEffort;
    if (ui.effortLabel) {
      const lab = effortOptions.find((e) => e.id === currentEffort)?.label || currentEffort;
      ui.effortLabel.textContent = lab.length > 4 ? lab.slice(0, 4) : lab;
    }
    // hide effort if model doesn't support
    const supports = cur?._meta?.supportsReasoningEffort !== false && (cur?._meta?.reasoningEfforts || efforts);
    if (ui.effortBtn) ui.effortBtn.style.display = supports || cur?.modelId?.includes("grok-4") ? "" : "none";
  }
  if (modelsPayload.currentModelId) {
    currentModelId = modelsPayload.currentModelId;
  }
  if (ui.modelLabel) ui.modelLabel.textContent = shortModelName(currentModelId);
}

function renderModelPop() {
  if (!ui.modelPop) return;
  ui.modelPop.replaceChildren();
  const list =
    availableModels.length > 0
      ? availableModels
      : [{ modelId: currentModelId || "grok-4.5", name: currentModelId || "grok-4.5" }];
  for (const m of list) {
    const id = m.modelId || m.id;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-item" + (id === currentModelId ? " active" : "");
    btn.innerHTML = `<div></div><div class="mid"></div>`;
    btn.querySelector("div").textContent = m.name || id;
    btn.querySelector(".mid").textContent = id;
    btn.onclick = () => void selectModel(id);
    ui.modelPop.appendChild(btn);
  }
}

function openModelPop() {
  if (!activeId || connecting) return;
  modelOpen = true;
  effortOpen = false;
  ui.effortPop?.classList.add("hidden");
  hideSlash();
  renderModelPop();
  ui.modelPop?.classList.remove("hidden");
}
function closeModelPop() {
  modelOpen = false;
  ui.modelPop?.classList.add("hidden");
}
function toggleModelPop() {
  if (modelOpen) closeModelPop();
  else openModelPop();
}

function renderEffortPop() {
  if (!ui.effortPop) return;
  ui.effortPop.replaceChildren();
  for (const e of effortOptions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "model-item" + (e.id === currentEffort ? " active" : "");
    btn.textContent = e.label || e.id;
    btn.onclick = () => void selectEffort(e.id);
    ui.effortPop.appendChild(btn);
  }
}
function openEffortPop() {
  if (!activeId || connecting) return;
  effortOpen = true;
  modelOpen = false;
  ui.modelPop?.classList.add("hidden");
  hideSlash();
  renderEffortPop();
  ui.effortPop?.classList.remove("hidden");
}
function closeEffortPop() {
  effortOpen = false;
  ui.effortPop?.classList.add("hidden");
}
async function selectEffort(id) {
  closeEffortPop();
  if (!id) return;
  currentEffort = id;
  if (ui.effortLabel) {
    const lab = effortOptions.find((e) => e.id === id)?.label || id;
    ui.effortLabel.textContent = String(lab).length > 4 ? String(lab).slice(0, 4) : lab;
  }
  // real CLI: /effort <level>
  await runRealSlash("effort", id);
}

ui.effortBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (effortOpen) closeEffortPop();
  else openEffortPop();
});

async function selectModel(modelId) {
  closeModelPop();
  if (!modelId || modelId === currentModelId) return;
  try {
    await grokDesktop.setModel(modelId, activeId);
    currentModelId = modelId;
    if (ui.modelLabel) ui.modelLabel.textContent = shortModelName(modelId);
    if (activeMeta) activeMeta.model = modelId;
    applyHeader(activeMeta);
    setStatus("ready", `模型 · ${shortModelName(modelId)}`);
  } catch (err) {
    appendBanner(`切换模型失败：${err.message || err}`, "error");
  }
}

ui.modelBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleModelPop();
});

grokDesktop.onModels?.((payload) => {
  if (payload?.sessionId && payload.sessionId !== activeId) return;
  setModelsState(payload);
});
grokDesktop.onModel?.(({ modelId, sessionId }) => {
  if (sessionId && sessionId !== activeId) return;
  if (modelId) {
    currentModelId = modelId;
    if (ui.modelLabel) ui.modelLabel.textContent = shortModelName(modelId);
  }
});

// click outside closes popovers
document.addEventListener("click", (e) => {
  if (modelOpen && !e.target.closest(".model-wrap")) closeModelPop();
  if (effortOpen && !e.target.closest(".model-wrap")) closeEffortPop();
});

// Topbar real actions
$("btn-act-export")?.addEventListener("click", async () => {
  if (!activeId) return;
  try {
    const r = await grokDesktop.exportSession(activeId);
    if (r?.ok) appendBanner(`已导出：${r.path}`);
  } catch (err) {
    appendBanner(`导出失败：${err.message}`, "error");
  }
});
// Settings → 环境：低频诊断命令（顶栏已不放）
async function runSettingsSlash(name) {
  switchView("chat");
  await runRealSlash(name);
}
$("btn-run-usage")?.addEventListener("click", () => runSettingsSlash("usage"));
$("btn-run-context")?.addEventListener("click", () => runSettingsSlash("context"));
$("btn-run-compact")?.addEventListener("click", () => runSettingsSlash("compact"));
$("btn-run-session-info")?.addEventListener("click", () => runSettingsSlash("session-info"));

// ── Sidebar sessions ───────────────────────────────────

function groupByProject(items) {
  const map = new Map();
  for (const s of items) {
    const key = projectName(s);
    if (!map.has(key)) map.set(key, { name: key, cwd: s.cwd, sessions: [] });
    map.get(key).sessions.push(s);
  }
  return [...map.values()].sort((a, b) =>
    String(b.sessions[0]?.updatedAt || "").localeCompare(String(a.sessions[0]?.updatedAt || "")),
  );
}

function makeSessionRow(s) {
  const row = document.createElement("button");
  row.type = "button";
  const working = workingSessions.has(s.id) || promptInFlight.has(s.id);
  const done = !working && doneSessions.has(s.id);
  const pinned = isPinned(s.id);
  const archived = isArchived(s.id);
  row.className =
    "session-row" +
    (s.id === activeId ? " active" : "") +
    (working ? " is-working" : "") +
    (done ? " is-done" : "") +
    (pinned ? " is-pinned" : "") +
    (archived ? " is-archived" : "");
  row.dataset.sessionId = s.id;
  row.innerHTML = `
    <span class="s-ind" aria-hidden="true"></span>
    <span class="title"></span>
    <span class="when"></span>`;
  const ind = row.querySelector(".s-ind");
  if (working) {
    ind.className = "s-ind spin";
    ind.title = "运行中";
  } else if (done) {
    ind.className = "s-ind done";
    ind.title = "已完成 · 点开清除";
  } else {
    ind.className = "s-ind";
  }
  row.querySelector(".title").textContent = s.title || s.id.slice(0, 8);
  row.querySelector(".title").title = `${s.title || s.id}\n${s.id}`;
  row.querySelector(".when").textContent = working
    ? "运行中"
    : done
      ? "已完成"
      : relativeTime(s.updatedAt);
  row.onclick = (e) => {
    e.stopPropagation();
    if (view !== "chat") switchView("chat");
    void selectSession(s.id);
  };
  return row;
}

function appendProjectGroup(listEl, g, { icon = "📁", headClass = "" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "project" + (collapsed.has(g.name) ? " collapsed" : "");
  const head = document.createElement("button");
  head.type = "button";
  head.className = "project-head" + (headClass ? " " + headClass : "");
  head.innerHTML = `<span></span><span class="name"></span><span class="chev">▾</span>`;
  head.querySelector("span").textContent = icon;
  head.querySelector(".name").textContent = g.name;
  head.title = g.cwd || g.name;
  head.onclick = (e) => {
    e.stopPropagation();
    if (collapsed.has(g.name)) collapsed.delete(g.name);
    else collapsed.add(g.name);
    renderSidebar(ui.search?.value || "");
  };
  wrap.appendChild(head);
  const body = document.createElement("div");
  body.className = "project-body";
  for (const s of g.sessions) body.appendChild(makeSessionRow(s));
  wrap.appendChild(body);
  listEl.appendChild(wrap);
}

function renderSidebar(filter = "") {
  const q = filter.trim().toLowerCase();
  const items = !q
    ? sessions
    : sessions.filter((s) =>
        `${s.title} ${s.summary} ${s.cwd || ""} ${s.id}`.toLowerCase().includes(q),
      );
  const scrollTop = ui.list.scrollTop;
  ui.list.replaceChildren();

  if (!items.length) {
    const d = document.createElement("div");
    d.className = "list-empty";
    d.innerHTML = q
      ? "没有匹配的会话"
      : "还没有会话<br><span style='opacity:.8'>点上方「新对话」开始</span>";
    ui.list.appendChild(d);
    return;
  }

  const arch = archivedSet();
  const pin = pinnedSet();
  const activeItems = items.filter((s) => !arch.has(s.id));
  const archivedItems = items.filter((s) => arch.has(s.id));
  const pinnedItems = activeItems.filter((s) => pin.has(s.id));
  const restItems = activeItems.filter((s) => !pin.has(s.id));

  if (pinnedItems.length) {
    appendProjectGroup(
      ui.list,
      { name: `置顶 · ${pinnedItems.length}`, cwd: null, sessions: pinnedItems },
      { icon: "📌" },
    );
  }
  for (const g of groupByProject(restItems)) {
    appendProjectGroup(ui.list, g, { icon: "📁" });
  }
  if (archivedItems.length) {
    const archKey = "归档";
    // 默认折叠；用户展开过则记住
    try {
      if (!sessionStorage.getItem("arch-expanded")) collapsed.add(archKey);
    } catch {
      collapsed.add(archKey);
    }
    const wrap = document.createElement("div");
    wrap.className = "project" + (collapsed.has(archKey) ? " collapsed" : "");
    const head = document.createElement("button");
    head.type = "button";
    head.className = "project-head archive-head";
    head.innerHTML = `<span>📦</span><span class="name"></span><span class="chev">▾</span>`;
    head.querySelector(".name").textContent = `归档 · ${archivedItems.length}`;
    head.onclick = (e) => {
      e.stopPropagation();
      if (collapsed.has(archKey)) {
        collapsed.delete(archKey);
        try {
          sessionStorage.setItem("arch-expanded", "1");
        } catch {
          /* ignore */
        }
      } else {
        collapsed.add(archKey);
        try {
          sessionStorage.removeItem("arch-expanded");
        } catch {
          /* ignore */
        }
      }
      renderSidebar(ui.search?.value || "");
    };
    wrap.appendChild(head);
    const body = document.createElement("div");
    body.className = "project-body";
    for (const s of archivedItems) body.appendChild(makeSessionRow(s));
    wrap.appendChild(body);
    ui.list.appendChild(wrap);
  }
  ui.list.scrollTop = scrollTop;
}

function markActive(id) {
  // 点开会话：清掉「已完成」绿点（用户已看到）
  if (id && doneSessions.has(id)) {
    doneSessions.delete(id);
  }
  // 整表刷新更稳（含 when 文案恢复相对时间）
  renderSidebar(ui.search?.value || "");
  const rows = ui.list.querySelectorAll(".session-row");
  rows.forEach((r) => r.classList.toggle("active", r.dataset.sessionId === id));
}

/** 轻量刷新侧栏状态点，不整表重建 */
function refreshSidebarSessionState() {
  if (!ui.list) return;
  const rows = ui.list.querySelectorAll(".session-row");
  if (!rows.length) return;
  rows.forEach((r) => {
    const sid = r.dataset.sessionId;
    if (!sid) return;
    const working = workingSessions.has(sid) || promptInFlight.has(sid);
    const done = !working && doneSessions.has(sid);
    r.classList.toggle("is-working", working);
    r.classList.toggle("is-done", done);
    const ind = r.querySelector(".s-ind");
    const when = r.querySelector(".when");
    const s = sessions.find((x) => x.id === sid);
    if (ind) {
      if (working) {
        ind.className = "s-ind spin";
        ind.title = "运行中";
      } else if (done) {
        ind.className = "s-ind done";
        ind.title = "已完成 · 点开清除";
      } else {
        ind.className = "s-ind";
        ind.title = "";
      }
    }
    if (when) {
      when.textContent = working
        ? "运行中"
        : done
          ? "已完成"
          : relativeTime(s?.updatedAt);
    }
  });
}

async function refreshSessions() {
  try {
    const next = await grokDesktop.listSessions({ limit: 200 });
    if (Array.isArray(next)) sessions = next;
    renderSidebar(ui.search.value);
  } catch (err) {
    console.error(err);
    if (!sessions.length) {
      ui.list.innerHTML = `<div class="list-error">加载失败：${err.message || err}</div>`;
    }
  }
}

// ── Chat ───────────────────────────────────────────────

function showWelcome() {
  // Use a detached welcome pane so open tabs keep their DOM
  const welcomePane = document.createElement("div");
  welcomePane.className = "thread-inner";
  welcomePane.innerHTML = `
    <div class="welcome">
      <h2></h2>
      <p></p>
      <ol class="welcome-steps">
        <li><span class="n">1</span><div><strong></strong><span></span></div></li>
        <li><span class="n">2</span><div><strong></strong><span></span></div></li>
        <li><span class="n">3</span><div><strong></strong><span></span></div></li>
      </ol>
      <div class="welcome-cta">
        <button type="button" class="btn primary" id="welcome-new"></button>
        <button type="button" class="btn" id="welcome-memory"></button>
      </div>
    </div>`;
  const root = welcomePane.querySelector(".welcome");
  root.querySelector("h2").textContent = t("welcome.h2");
  root.querySelector("p").textContent = t("welcome.p");
  const steps = root.querySelectorAll(".welcome-steps li");
  const stepKeys = [
    ["welcome.s1t", "welcome.s1d"],
    ["welcome.s2t", "welcome.s2d"],
    ["welcome.s3t", "welcome.s3d"],
  ];
  steps.forEach((li, i) => {
    li.querySelector("strong").textContent = t(stepKeys[i][0]);
    li.querySelector("span:not(.n)").textContent = t(stepKeys[i][1]);
  });
  welcomePane.querySelector("#welcome-new").textContent = t("welcome.new");
  welcomePane.querySelector("#welcome-memory").textContent = t("welcome.memory");
  while (ui.thread.firstChild) ui.thread.removeChild(ui.thread.firstChild);
  ui.thread.appendChild(welcomePane);
  ui.inner = welcomePane;
  $("welcome-new")?.addEventListener("click", () => newSession());
  $("welcome-memory")?.addEventListener("click", () => switchView("memory"));
  ui.sessionActions.classList.add("hidden");
  activeId = null;
  activeMeta = null;
  setComposerEnabled(false);
  setPlanOpen(false);
  renderPlan(null);
  ui.title.textContent = t("chat.welcomeTitle");
  ui.sub.textContent = t("chat.welcomeSub");
  ui.cwdChip.textContent = "未选择工作目录";
  renderTabs();
  schedulePersistTabs();
}

function clearThread() {
  ui.inner.replaceChildren();
  streamingEl = null;
  seenMedia = new Set();
}

function shouldClamp(text) {
  return (text || "").length > CLAMP || (text || "").split("\n").length > 8;
}

/** Match http(s) URLs in plain text (trailing punctuation stripped into separate text). */
const MSG_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;

/**
 * Build a document fragment: plain text + clickable <a.msg-link> for http(s) URLs.
 * Safe: only creates text nodes and anchors; never injects raw HTML.
 */
function linkifyToFragment(text) {
  const frag = document.createDocumentFragment();
  const raw = String(text || "");
  if (!raw) return frag;
  MSG_URL_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = MSG_URL_RE.exec(raw)) !== null) {
    if (m.index > last) {
      frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
    }
    let url = m[0];
    let trail = "";
    // Peel common trailing punctuation not usually part of the URL
    while (url.length > 8 && /[),.;:!?，。；：！？]$/.test(url)) {
      // keep balanced ) if it looks like part of the path
      if (url.endsWith(")") && (url.match(/\(/g) || []).length > (url.match(/\)/g) || []).length - 1) {
        break;
      }
      trail = url.slice(-1) + trail;
      url = url.slice(0, -1);
    }
    if (/^https?:\/\/.+/i.test(url)) {
      const a = document.createElement("a");
      a.className = "msg-link";
      a.href = url;
      a.textContent = url;
      a.rel = "noopener noreferrer";
      a.title = url;
      frag.appendChild(a);
    } else {
      frag.appendChild(document.createTextNode(m[0]));
      trail = "";
    }
    if (trail) frag.appendChild(document.createTextNode(trail));
    last = m.index + m[0].length;
  }
  if (last < raw.length) {
    frag.appendChild(document.createTextNode(raw.slice(last)));
  }
  return frag;
}

/** Fill an element with linkified text (replaces children). */
function setMessageBody(el, text) {
  if (!el) return;
  el.replaceChildren();
  el.appendChild(linkifyToFragment(text));
  el.dataset.linkified = "1";
}

/** After streaming, turn accumulated plain text into clickable links. */
function linkifyElement(el) {
  if (!el) return;
  const text = el.textContent || "";
  if (!text || !/https?:\/\//i.test(text)) {
    el.dataset.linkified = "1";
    return;
  }
  setMessageBody(el, text);
}

/**
 * Create a message bubble. Images live INSIDE the turn (not a free-floating
 * strip at the bottom of the thread).
 * @returns {HTMLElement} body element (streaming target) — turn is body.parentElement
 */
function appendTurn(role, text, { stream = false, clampable = true, images = [], skipScroll = false } = {}) {
  ui.inner.querySelector(".welcome")?.remove();
  const turn = document.createElement("div");
  turn.className = `turn ${role}`;
  if (stream) turn.classList.add("streaming");
  const body = document.createElement("div");
  body.className = "body";
  // Stream as plain text (fast); linkify when stream ends / for history
  if (stream) {
    body.textContent = text || "";
  } else {
    setMessageBody(body, text || "");
  }

  // User: images above text; assistant: text then images (filled as they arrive)
  if (role === "user" && images?.length) {
    const media = ensureTurnMedia(turn);
    for (const img of images) {
      addImgToMediaRow(media, img.dataUrl || img, img.key || img.dataUrl);
    }
  }

  if (!stream && clampable && shouldClamp(text)) {
    body.classList.add("clamped");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "expand";
    btn.textContent = "展开全文";
    btn.onclick = () => {
      body.classList.toggle("clamped");
      btn.textContent = body.classList.contains("clamped") ? "展开全文" : "收起";
    };
    turn.appendChild(body);
    turn.appendChild(btn);
  } else {
    turn.appendChild(body);
  }

  if (role !== "user" && images?.length) {
    const media = ensureTurnMedia(turn);
    for (const img of images) {
      addImgToMediaRow(media, img.dataUrl || img, img.key || img.dataUrl);
    }
  }

  ui.inner.appendChild(turn);
  if (!skipScroll) scrollThreadToBottom({ force: !stream });
  if (stream) streamingEl = body;
  return body;
}

function ensureTurnMedia(turn) {
  if (!turn) return null;
  let row = turn.querySelector(":scope > .turn-media");
  if (!row) {
    row = document.createElement("div");
    row.className = "turn-media media-row";
    // Prefer after .body so streaming text stays first for assistant
    const body = turn.querySelector(":scope > .body");
    if (body && body.nextSibling) turn.insertBefore(row, body.nextSibling);
    else if (body) turn.appendChild(row);
    else turn.insertBefore(row, turn.firstChild);
  }
  return row;
}

function addImgToMediaRow(row, dataUrl, key) {
  if (!row || !dataUrl) return null;
  const k = key || dataUrl.slice(0, 80);
  if (seenMedia.has(k)) return null;
  seenMedia.add(k);
  const img = document.createElement("img");
  img.src = dataUrl;
  img.alt = "图片";
  img.loading = "lazy";
  img.onclick = () => openLightbox(dataUrl);
  row.appendChild(img);
  return img;
}

/**
 * Attach an image to a message bubble (never dump as a free strip at thread end).
 * Priority: explicit turn → streaming turn → last assistant turn → last turn → new.
 */
function appendMedia(dataUrl, key, { turn = null, role = "assistant", prefer = "assistant" } = {}) {
  if (!dataUrl) return;
  const k = key || dataUrl.slice(0, 80);
  if (seenMedia.has(k)) return;
  ui.inner.querySelector(".welcome")?.remove();

  let host = turn;
  if (!host && streamingEl) host = streamingEl.closest?.(".turn");
  if (!host) {
    const turns = [...ui.inner.querySelectorAll(":scope > .turn:not(.queued)")];
    if (prefer === "assistant") {
      host = [...turns].reverse().find((t) => t.classList.contains("assistant")) || null;
    }
    if (!host) host = turns.length ? turns[turns.length - 1] : null;
  }
  if (!host) {
    host = document.createElement("div");
    host.className = `turn ${role} media-only`;
    ui.inner.appendChild(host);
  }
  const row = ensureTurnMedia(host);
  addImgToMediaRow(row, dataUrl, k);
  scrollThreadToBottom();
}

/** Parse session timestamps (CLI may use nanosecond ISO strings). */
function parseSessionTs(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  const s = String(v).replace(/(\.\d{3})\d+/, "$1"); // keep ms only
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Map each session image to a message index (0..n-1).
 * Prefer filename hit in message text; else mtime within session span.
 */
function mapAssetsToMessageIndex(list, imgs, sessionMeta) {
  const n = Math.max(1, list.length);
  let tStart = parseSessionTs(sessionMeta?.createdAt);
  let tEnd = parseSessionTs(sessionMeta?.updatedAt);
  if (!Number.isFinite(tStart) && imgs[0]?.mtimeMs) tStart = imgs[0].mtimeMs;
  if (!Number.isFinite(tEnd) && imgs[imgs.length - 1]?.mtimeMs) {
    tEnd = imgs[imgs.length - 1].mtimeMs;
  }
  if (!Number.isFinite(tStart)) tStart = Date.now() - 3600_000;
  if (!Number.isFinite(tEnd) || tEnd <= tStart) tEnd = tStart + 3600_000;
  const span = Math.max(1, tEnd - tStart);

  /** @type {Map<number, any[]>} */
  const byIndex = new Map();
  for (const a of imgs) {
    let idx = -1;
    const name = a.name || "";
    const stem = name.replace(/\.\w+$/, "");
    if (name) {
      for (let i = 0; i < list.length; i++) {
        const t = list[i].text || "";
        if (t.includes(name) || (stem && t.includes(stem))) {
          idx = i;
          break;
        }
      }
    }
    if (idx < 0) {
      const mt = Number(a.mtimeMs) || tStart;
      const frac = Math.min(1, Math.max(0, (mt - tStart) / span));
      // Map into message timeline; bias slightly earlier (image often arrives mid-turn)
      idx = Math.min(n - 1, Math.max(0, Math.floor(frac * n)));
    }
    if (!byIndex.has(idx)) byIndex.set(idx, []);
    byIndex.get(idx).push(a);
  }
  return byIndex;
}

/**
 * Place history assets into turns by session timeline (mtime).
 * CRITICAL: never dump early images onto the last visible turn (looks like "all at bottom").
 */
function renderHistoryWithAssets(messages, assets, sessionMeta) {
  const list = Array.isArray(messages) ? messages : [];
  const imgs = (Array.isArray(assets) ? assets : [])
    .filter((a) => a?.dataUrl)
    .slice()
    .sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));

  // With images, show enough history to place them mid-thread (not only last PAGE)
  if (imgs.length && list.length) {
    const byTmp = mapAssetsToMessageIndex(list, imgs, sessionMeta);
    let minIdx = list.length;
    for (const k of byTmp.keys()) minIdx = Math.min(minIdx, k);
    // Ensure earliest image's message is visible
    if (Number.isFinite(minIdx) && minIdx < historyFrom) {
      historyFrom = Math.max(0, minIdx);
    }
  }

  const byIndex = mapAssetsToMessageIndex(list, imgs, sessionMeta);
  const lastIdx = Math.max(0, list.length - 1);
  const firstVis = Math.min(historyFrom, lastIdx);
  const lastVis = lastIdx;

  // Clamp every asset into the VISIBLE window — early → first visible, late → last visible
  // Never leave "leftovers" that appendMedia would glue to the bottom turn.
  /** @type {Map<number, any[]>} */
  const visibleMap = new Map();
  for (const [idx, arr] of byIndex) {
    const clamped = Math.min(lastVis, Math.max(firstVis, idx));
    if (!visibleMap.has(clamped)) visibleMap.set(clamped, []);
    visibleMap.get(clamped).push(...arr);
  }

  clearThread();
  if (historyFrom > 0) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "load-earlier";
    btn.textContent = `更早的 ${historyFrom} 条`;
    btn.onclick = () => {
      historyFrom = Math.max(0, historyFrom - PAGE);
      renderHistoryWithAssets(history, historyAssets, sessionMeta || activeMeta);
      ui.thread.scrollTop = 48;
    };
    ui.inner.appendChild(btn);
  }

  // Images that belong before the first visible message → strip under "load earlier"
  if (historyFrom > 0) {
    const early = [];
    for (const [idx, arr] of byIndex) {
      if (idx < historyFrom) early.push(...arr);
    }
    if (early.length) {
      const gallery = document.createElement("div");
      gallery.className = "turn media-only history-media-early";
      const lab = document.createElement("div");
      lab.className = "history-media-label";
      lab.textContent = `更早的会话图片（${early.length}）· 点上方加载更早消息可对齐上下文`;
      gallery.appendChild(lab);
      const row = document.createElement("div");
      row.className = "turn-media media-row";
      gallery.appendChild(row);
      for (const a of early) {
        addImgToMediaRow(row, a.dataUrl, a.path || a.name);
      }
      ui.inner.appendChild(gallery);
    }
  }

  const slice = list.slice(historyFrom);
  for (let i = 0; i < slice.length; i++) {
    const m = slice[i];
    const globalIdx = historyFrom + i;
    const role = m.role === "user" ? "user" : "assistant";
    // Prefer assets originally for this index; if we clamped early images onto
    // firstVis only for non-early strip case (historyFrom===0), use visibleMap
    let attached = [];
    if (historyFrom === 0) {
      attached = visibleMap.get(globalIdx) || [];
    } else {
      // early ones already shown in gallery; only attach idx >= historyFrom
      attached = (byIndex.get(globalIdx) || []).slice();
    }
    appendTurn(role, m.text, {
      clampable: true,
      images: attached.map((a) => ({ dataUrl: a.dataUrl, key: a.path || a.name })),
    });
  }
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function appendTool(title) {
  ui.inner.querySelector(".welcome")?.remove();
  let row = ui.inner.lastElementChild;
  if (!row || !row.classList.contains("tool-row")) {
    row = document.createElement("div");
    row.className = "tool-row";
    ui.inner.appendChild(row);
  }
  const chip = document.createElement("span");
  chip.className = "tool-chip";
  chip.textContent = title || "tool";
  row.appendChild(chip);
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function appendBanner(text, kind = "") {
  ui.inner.querySelector(".welcome")?.remove();
  const b = document.createElement("div");
  b.className = "banner" + (kind ? ` ${kind}` : "");
  b.textContent = text;
  ui.inner.appendChild(b);
  ui.thread.scrollTop = ui.thread.scrollHeight;
}

function openLightbox(src) {
  let box = document.getElementById("lightbox");
  if (!box) {
    box = document.createElement("div");
    box.id = "lightbox";
    box.className = "hidden";
    box.innerHTML = "<img alt='' />";
    box.onclick = () => box.classList.add("hidden");
    document.body.appendChild(box);
  }
  box.querySelector("img").src = src;
  box.classList.remove("hidden");
}

/** @type {any[]} */
let historyAssets = [];

function renderHistory() {
  if (!history.length) {
    clearThread();
    appendBanner("本地没有可预览的消息，agent 上下文仍会恢复。");
    // No messages: show images as a top gallery (not glued under empty bottom)
    if (historyAssets?.length) {
      const gallery = document.createElement("div");
      gallery.className = "turn media-only history-media-early";
      const lab = document.createElement("div");
      lab.className = "history-media-label";
      lab.textContent = "本会话图片";
      gallery.appendChild(lab);
      const row = document.createElement("div");
      row.className = "turn-media media-row";
      gallery.appendChild(row);
      ui.inner.appendChild(gallery);
      for (const a of historyAssets) {
        if (a.dataUrl) addImgToMediaRow(row, a.dataUrl, a.path || a.name);
      }
    }
    return;
  }
  renderHistoryWithAssets(history, historyAssets, activeMeta);
}

function applyHeader(s) {
  activeMeta = s || null;
  if (s?.id) {
    const st = ensureSessionUi(s.id);
    const prevTitle = st.meta?.title;
    st.meta = { ...(st.meta || {}), ...s };
    // Only re-render tabs when title changes (avoid thrashing on status spam)
    if (s.title && s.title !== prevTitle) renderTabs();
  }
  ui.title.textContent = s?.title || "会话";
  ui.sub.textContent = [s?.cwd, s?.model, s?.id ? s.id.slice(0, 8) + "…" : ""]
    .filter(Boolean)
    .join(" · ");
  ui.cwdChip.textContent = shortPath(s?.cwd);
  ui.cwdChip.title = s?.cwd || "";
  ui.sessionActions.classList.toggle("hidden", !s?.id);
  updateLiveStrip();
}

// images
function renderAttachPreview() {
  ui.attachPreview.replaceChildren();
  if (!pendingImages.length) {
    ui.attachPreview.classList.add("hidden");
    setComposerEnabled(!!activeId && !connecting);
    return;
  }
  ui.attachPreview.classList.remove("hidden");
  pendingImages.forEach((img, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "attach-thumb";
    const el = document.createElement("img");
    el.src = img.dataUrl;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.textContent = "×";
    rm.onclick = () => {
      pendingImages.splice(idx, 1);
      renderAttachPreview();
    };
    wrap.append(el, rm);
    ui.attachPreview.appendChild(wrap);
  });
  setComposerEnabled(!!activeId && !connecting);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function addImageFiles(files) {
  for (const file of files) {
    if (!file.type?.startsWith("image/")) continue;
    const dataUrl = await readFileAsDataUrl(file);
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) continue;
    pendingImages.push({ name: file.name, mimeType: m[1], dataBase64: m[2], dataUrl });
  }
  renderAttachPreview();
}

ui.fileBtn?.addEventListener("click", async () => {
  try {
    const files = await grokDesktop.pickFiles();
    for (const f of files || []) {
      if (!pendingFiles.some((x) => x.path === f.path)) pendingFiles.push(f);
    }
    renderContextChips();
    setComposerEnabled(!!activeId);
  } catch (err) {
    appendBanner(`附加文件失败：${err.message}`, "error");
  }
});

function insertTextAtCursor(text) {
  const el = ui.input;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  el.value = before + text + after;
  const pos = start + text.length;
  el.selectionStart = el.selectionEnd = pos;
  el.focus();
  el.dispatchEvent(new Event("input", { bubbles: true }));
  autosize();
}

/** Clipboard read for native context-menu "粘贴到输入框" (no toolbar button). */
async function pasteFromClipboard() {
  if (!activeId || ui.input.disabled) return false;
  try {
    if (navigator.clipboard?.read) {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            files.push(new File([blob], `paste.${type.split("/")[1] || "png"}`, { type }));
          }
        }
      }
      if (files.length) {
        await addImageFiles(files);
        return true;
      }
    }
    if (navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text) {
        insertTextAtCursor(text);
        return true;
      }
    }
  } catch {
    /* permission / empty clipboard */
  }
  return false;
}

// From main-process native context menu
grokDesktop.onInsertText?.((text) => {
  if (typeof text === "string" && text) insertTextAtCursor(text);
});
grokDesktop.onPasteRequest?.(() => {
  void pasteFromClipboard();
});

// Ctrl/Cmd+V and system paste (voice IME often injects text here)
document.addEventListener("paste", (e) => {
  if (view !== "chat" || !activeId) return;
  const files = [];
  for (const it of e.clipboardData?.items || []) {
    if (it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  if (files.length) {
    e.preventDefault();
    void addImageFiles(files);
    return;
  }
  if (document.activeElement !== ui.input && e.clipboardData) {
    const text = e.clipboardData.getData("text/plain");
    if (text) {
      e.preventDefault();
      insertTextAtCursor(text);
    }
  }
});

// Drag & drop images into chat / composer
["thread", "composer-dock"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("dragover", (e) => e.preventDefault());
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!activeId) return;
    void addImageFiles([...(e.dataTransfer?.files || [])]);
  });
});

// session open / send
async function selectSession(sessionId) {
  if (!sessionId) return;
  // Already focused + live → just focus input
  if (sessionId === activeId && !connecting && liveAgents.has(sessionId) && activeMeta) {
    ui.input.focus();
    return;
  }

  const seq = ++openSeq;
  const prevId = activeId;
  const wasLive = liveAgents.has(sessionId);
  const hadPane = threadPanes.has(sessionId);
  const stTarget = ensureSessionUi(sessionId);

  // Stash composer for previous session (attachments / queue stay per-tab)
  if (prevId && prevId !== sessionId) stashComposer(prevId);

  // Instant UI: switch pane + header before any await
  activatePane(sessionId);
  activeId = sessionId;
  addOpenTab(sessionId);
  markActive(sessionId);
  schedulePersistTabs();

  const cachedMeta =
    stTarget.meta || sessions.find((x) => x.id === sessionId) || null;
  if (cachedMeta) applyHeader(cachedMeta);
  restoreComposer(sessionId);
  renderPlan(stTarget.plan);
  renderTabs();

  const paneHasContent =
    ui.inner &&
    ui.inner.childElementCount > 0 &&
    !ui.inner.querySelector(".welcome");

  // Restore per-session history assets when soft-switching
  if (stTarget.historyAssets) historyAssets = stTarget.historyAssets;

  // ── Soft switch: agent already live ─────────────────
  if (wasLive) {
    // One-time: re-place session images if older open left them stuck at the bottom
    if (
      paneHasContent &&
      !workingSessions.has(sessionId) &&
      !stTarget.mediaPlacedV2 &&
      (stTarget.historyAssets?.length || 0) > 0
    ) {
      try {
        const hist = await grokDesktop.loadHistory(sessionId);
        if (seq !== openSeq) return;
        if (hist.session) {
          applyHeader(hist.session);
          stTarget.meta = hist.session;
        }
        history = (hist.messages || []).map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.text || "",
        }));
        historyAssets = hist.assets || [];
        stTarget.history = history.slice();
        stTarget.historyAssets = historyAssets;
        stTarget.historyFrom = 0;
        historyFrom = 0;
        stTarget.toolCardMap = new Map();
        stTarget.diffCardMap = new Map();
        toolCardMap = stTarget.toolCardMap;
        diffCardMap = stTarget.diffCardMap;
        streamingEl = null;
        stTarget.streamingEl = null;
        stTarget.mediaPlacedV2 = true;
        seenMedia = new Set();
        stTarget.seenMedia = seenMedia;
        renderHistory();
      } catch {
        stTarget.mediaPlacedV2 = true; // don't loop
      }
    } else if (paneHasContent) {
      stTarget.mediaPlacedV2 = true;
    }

    // Pane was discarded (e.g. tab closed earlier) — hydrate history without reconnect flash
    if (!paneHasContent) {
      try {
        const hist = await grokDesktop.loadHistory(sessionId);
        if (seq !== openSeq) return;
        if (hist.session) {
          applyHeader(hist.session);
          stTarget.meta = hist.session;
        }
        history = (hist.messages || []).map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          text: m.text || "",
        }));
        historyAssets = hist.assets || [];
        // With images: start window early enough to place them mid-thread
        historyFrom = Math.max(0, history.length - PAGE);
        if (historyAssets.length && history.length) {
          historyFrom = 0; // full preview window so mtime placement isn't clipped to bottom
        }
        stTarget.history = history.slice();
        stTarget.historyFrom = historyFrom;
        stTarget.toolCardMap = new Map();
        stTarget.diffCardMap = new Map();
        stTarget.historyAssets = historyAssets;
        stTarget.mediaPlacedV2 = true;
        seenMedia = new Set();
        stTarget.seenMedia = seenMedia;
        toolCardMap = stTarget.toolCardMap;
        diffCardMap = stTarget.diffCardMap;
        streamingEl = null;
        stTarget.streamingEl = null;
        renderHistory();
      } catch {
        /* keep empty pane */
      }
    }

    connecting = false;
    const working = workingSessions.has(sessionId);
    setBusy(working);
    setStatus(
      working ? "working" : stTarget.statusState || "ready",
      working
        ? "思考中…"
        : localizeStatus(stTarget.statusState || "ready", stTarget.statusDetail || "已连接"),
    );
    setComposerEnabled(true);
    if (stTarget.models) setModelsState(stTarget.models);
    if (stTarget.commands?.length) slashCommands = stTarget.commands;
    ui.input.focus();

    // Silent focus in main — no "connecting…" status
    try {
      let res = null;
      if (typeof grokDesktop.activateSession === "function") {
        res = await grokDesktop.activateSession(sessionId);
        if (!res?.ok) {
          res = await grokDesktop.openSession(sessionId, { soft: true });
        }
      } else {
        res = await grokDesktop.openSession(sessionId, { soft: true });
      }
      if (seq !== openSeq) return;
      if (res?.session) {
        applyHeader(res.session);
        stTarget.meta = { ...(stTarget.meta || {}), ...res.session };
      }
      if (res?.commands?.length) {
        stTarget.commands = res.commands;
        slashCommands = res.commands;
      }
      if (res?.models) {
        stTarget.models = res.models;
        setModelsState(res.models);
      }
      if (res?.openIds) liveAgents = new Set(res.openIds);
      else liveAgents.add(sessionId);
      renderTabs();
    } catch {
      /* soft failures ignored — UI already usable */
    }
    return;
  }

  // ── Cold open: need history + spawn agent ───────────
  connecting = true;
  setBusy(false);
  setStatus("connecting", "加载中…");
  setComposerEnabled(false);

  let meta = cachedMeta;
  if (!paneHasContent) {
    try {
      const hist = await grokDesktop.loadHistory(sessionId);
      if (seq !== openSeq) return;
      if (hist.session) meta = hist.session;
      applyHeader(meta);
      stTarget.meta = meta;
      history = (hist.messages || []).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        text: m.text || "",
      }));
      historyAssets = hist.assets || [];
      historyFrom = Math.max(0, history.length - PAGE);
      if (historyAssets.length && history.length) {
        historyFrom = 0;
      }
      stTarget.history = history.slice();
      stTarget.historyFrom = historyFrom;
      stTarget.toolCardMap = new Map();
      stTarget.diffCardMap = new Map();
      stTarget.historyAssets = historyAssets;
      stTarget.mediaPlacedV2 = true;
      seenMedia = new Set();
      stTarget.seenMedia = seenMedia;
      toolCardMap = stTarget.toolCardMap;
      diffCardMap = stTarget.diffCardMap;
      streamingEl = null;
      stTarget.streamingEl = null;
      renderHistory();
    } catch (err) {
      if (seq !== openSeq) return;
      applyHeader(meta);
      clearThread();
      appendBanner(`读取历史失败：${err?.message || err}`, "error");
    }
  } else if (meta) {
    applyHeader(meta);
  }

  setStatus("connecting", "连接助手…");
  try {
    const res = await grokDesktop.openSession(sessionId);
    if (seq !== openSeq) return;
    if (res?.cancelled) return;
    if (res?.session) {
      applyHeader(res.session);
      stTarget.meta = res.session;
    }
    if (res?.openIds) liveAgents = new Set(res.openIds);
    else liveAgents.add(sessionId);
    if (res?.commands?.length) {
      stTarget.commands = res.commands;
      slashCommands = res.commands;
    }
    if (res?.models) {
      stTarget.models = res.models;
      setModelsState(res.models);
    } else {
      try {
        const ml = await grokDesktop.listModels(sessionId);
        stTarget.models = ml;
        setModelsState(ml);
      } catch {
        /* ignore */
      }
    }
    addOpenTab(sessionId);
    renderTabs();
    setStatus("ready", res?.reused ? "已连接" : "已连接");
    stTarget.statusState = "ready";
    stTarget.statusDetail = "已连接";
    connecting = false;
    setBusy(workingSessions.has(sessionId));
    setComposerEnabled(true);
    if (!res?.commands?.length) {
      try {
        const cl = await grokDesktop.listCommands(sessionId);
        if (cl?.commands?.length) {
          stTarget.commands = cl.commands;
          slashCommands = cl.commands;
        }
      } catch {
        /* ignore */
      }
    }
    renderPlan(stTarget.plan);
    ui.input.focus();
  } catch (err) {
    if (seq !== openSeq) return;
    connecting = false;
    setStatus("error", err?.message || "连接失败");
    appendBanner(`恢复失败：${err?.message || err}`, "error");
    setComposerEnabled(false);
  }
}

async function newSession() {
  if (connecting) return;
  switchView("chat");
  const cwd = await grokDesktop.pickDirectory();
  if (!cwd) return;
  const seq = ++openSeq;
  connecting = true;
  setStatus("connecting", "创建中…");
  setComposerEnabled(false);
  pendingImages = [];
  pendingFiles = [];
  messageQueue = [];
  renderAttachPreview();
  renderContextChips();
  try {
    const res = await grokDesktop.newSession(cwd);
    if (seq !== openSeq) return;
    const sid = res.session.id;
    // Mount a fresh pane for the new session
    ensureSessionUi(sid);
    ensurePane(sid);
    activatePane(sid);
    activeId = sid;
    history = [];
    historyFrom = 0;
    historyAssets = [];
    seenMedia = new Set();
    messageQueue = [];
    const stNew = ensureSessionUi(sid);
    stNew.history = [];
    stNew.historyFrom = 0;
    stNew.historyAssets = [];
    stNew.seenMedia = seenMedia;
    stNew.messageQueue = [];
    const meta = { ...res.session, title: res.session.title || "新对话", cwd: res.session.cwd || cwd };
    applyHeader(meta);
    // Optimistic insert so it shows even before disk scan
    sessions = [
      {
        id: meta.id,
        cwd: meta.cwd,
        title: meta.title || "新对话",
        summary: meta.title || "新对话",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        numMessages: 0,
      },
      ...sessions.filter((s) => s.id !== meta.id),
    ];
    if (res?.openIds) liveAgents = new Set(res.openIds);
    else liveAgents.add(sid);
    addOpenTab(sid);
    renderSidebar(ui.search.value);
    markActive(activeId);
    clearThread();
    appendBanner("新对话已创建，已出现在左侧列表。可同时开多个会话并行运行。");
    setStatus("ready", "新对话");
    connecting = false;
    setComposerEnabled(true);
    await refreshSessions();
    markActive(activeId);
    renderTabs();
    try {
      const cl = await grokDesktop.listCommands(sid);
      if (cl?.commands?.length) slashCommands = cl.commands;
    } catch {
      /* ignore */
    }
    if (res?.models) setModelsState(res.models);
    setTimeout(async () => {
      try {
        const cl = await grokDesktop.listCommands(sid);
        if (cl?.commands?.length) slashCommands = cl.commands;
        const ml = await grokDesktop.listModels(sid);
        setModelsState(ml);
      } catch {
        /* ignore */
      }
    }, 800);
    ui.input.focus();
  } catch (err) {
    connecting = false;
    setStatus("error", err?.message || "创建失败");
    appendBanner(`创建失败：${err?.message || err}`, "error");
  }
}

/**
 * CLI 风格插话：停掉当前轮 → 立刻发新话上屏，助手马上读到。
 * （不是排队等本轮结束）
 */
async function interruptAndSend({ text, images, files }) {
  const sid = activeId;
  if (!sid) return;

  // 作废旧 sendNow 的 finally（避免旧轮 flush/抢状态）
  sendGeneration += 1;
  const myGen = sendGeneration;

  // 引导发送：清掉排队（调用方也可已清）
  messageQueue = [];
  const st = ensureSessionUi(sid);
  st.messageQueue = [];
  removeQueuedTurns();

  setStatus("working", "打断中…");
  try {
    await grokDesktop.cancel(sid);
  } catch {
    /* 无进行中的轮次也没关系 */
  }

  promptInFlight.delete(sid);
  workingSessions.delete(sid);

  await new Promise((r) => setTimeout(r, 200));
  if (myGen !== sendGeneration) return;

  setBusy(false);
  await sendNow({ text, images, files, sessionId: sid, generation: myGen });
}

async function send() {
  const text = ui.input.value.trim();
  if ((!text && !pendingImages.length && !pendingFiles.length) || !activeId) return;
  if (connecting && !isAgentBusy(activeId) && !promptInFlight.has(activeId)) return;

  const images = pendingImages.slice();
  const files = pendingFiles.slice();

  // 任务进行中 + Enter/排队按钮 → 只排队，不打断
  if (isAgentBusy(activeId)) {
    ui.input.value = "";
    pendingImages = [];
    pendingFiles = [];
    renderAttachPreview();
    renderContextChips();
    autosize();
    enqueueFollowUp({ text, images, files });
    ui.input.focus();
    refreshSendButtonState();
    return;
  }

  try {
    await sendNow({ text, images, files });
  } catch (err) {
    const msg = String(err?.message || err || "");
    // 主进程仍忙 → 先进排队，由用户点「引导」
    if (/仍在处理|上一轮|busy|处理中/i.test(msg)) {
      enqueueFollowUp({ text, images, files });
      ui.input.focus();
      refreshSendButtonState();
      return;
    }
    appendBanner(`发送失败：${msg}`, "error");
  }
}

/**
 * Send a prompt for a specific session (may not be the focused tab).
 * Fixes: queue was only flushed when user stayed on the same tab.
 */
async function sendNow({ text, images, files, sessionId = null, generation = null }) {
  const sentTo = sessionId || activeId;
  if (!sentTo) return;
  const isActive = sentTo === activeId;
  const st = ensureSessionUi(sentTo);
  const myGen = generation != null ? generation : ++sendGeneration;

  if (isActive && generation == null) {
    // 非打断路径：在这里清输入；打断路径已在 send() 清过
    ui.input.value = "";
    pendingImages = [];
    pendingFiles = [];
    renderAttachPreview();
    renderContextChips();
    autosize();
  }

  // Route DOM writes into the correct pane even if tab is in background
  const prevInner = ui.inner;
  const prevStream = streamingEl;
  const prevTool = toolCardMap;
  const prevDiff = diffCardMap;
  const pane = getPane(sentTo);
  ui.inner = pane;
  toolCardMap = st.toolCardMap;
  diffCardMap = st.diffCardMap;
  streamingEl = st.streamingEl;

  try {
    if (files?.length) {
      appendTurn(
        "user",
        `附加 ${files.length} 个文件：\n` + files.map((f) => `· ${f.path}`).join("\n"),
        { clampable: false },
      );
    }
    const displayText = text || (images?.length ? `（${images.length} 张图片）` : "");
    const userImages = (images || [])
      .filter((img) => img?.dataUrl)
      .map((img) => ({ dataUrl: img.dataUrl, key: img.dataUrl?.slice(0, 64) }));
    if (displayText || userImages.length) {
      appendTurn("user", displayText || "", {
        clampable: false,
        images: userImages,
      });
    }
  } finally {
    st.streamingEl = streamingEl;
    if (!isActive) {
      ui.inner = prevInner;
      streamingEl = prevStream;
      toolCardMap = prevTool;
      diffCardMap = prevDiff;
    }
  }

  // Auto-title only for focused session
  if (isActive && text && looksLikeAutoTitle(activeMeta?.title)) {
    const short = titleFromUserText(text);
    if (short) {
      try {
        await grokDesktop.renameSession(sentTo, short);
        applyHeader({ ...activeMeta, title: short, id: sentTo });
        sessions = sessions.map((x) =>
          x.id === sentTo ? { ...x, title: short, summary: short } : x,
        );
        renderSidebar(ui.search.value);
        renderTabs();
      } catch {
        /* ignore */
      }
    }
  }

  const promptText = buildPromptWithFiles(text, files);
  st.streamingEl = null;
  if (isActive) streamingEl = null;

  // 仍有旧轮在飞且非引导路径：改排队，等用户点「引导」
  if (promptInFlight.has(sentTo) && generation == null) {
    if (isActive) enqueueFollowUp({ text, images, files });
    return;
  }

  promptInFlight.add(sentTo);
  workingSessions.add(sentTo);
  everWorkedSessions.add(sentTo);
  doneSessions.delete(sentTo);
  scheduleRenderTabs(true);
  refreshSidebarSessionState();
  if (isActive) {
    setBusy(true);
    setStatus("working", "思考中…");
    refreshSendButtonState();
  }
  try {
    await grokDesktop.prompt({
      text: promptText,
      images: (images || []).map((i) => ({ mimeType: i.mimeType, dataBase64: i.dataBase64 })),
      sessionId: sentTo,
    });
    if (myGen !== sendGeneration) return;
    if (activeId === sentTo) setStatus("ready", "就绪");
    scheduleRenderTabs(true);
    void refreshSessions()
      .then(() => {
        // 不要 markActive：会清掉刚打上的「已完成」绿点
        refreshSidebarSessionState();
      })
      .catch(() => {});
  } catch (err) {
    if (myGen !== sendGeneration) return; // 已被新一轮打断，忽略
    const msg = String(err?.message || err || "");
    scheduleRenderTabs(true);
    // cancel 导致的中止不算失败
    if (/cancel|abort|中断|停止|disposed/i.test(msg)) {
      /* ignore */
    } else if (/仍在处理|上一轮|busy|处理中/i.test(msg)) {
      if (isActive) enqueueFollowUp({ text, images, files });
    } else if (activeId === sentTo) {
      setStatus("error", msg || "发送失败");
      appendBanner(`发送失败：${msg}`, "error");
    }
  } finally {
    if (myGen !== sendGeneration) {
      // 被更新的发送取代，不要清新一轮的 in-flight，也不要 flush
      return;
    }
    promptInFlight.delete(sentTo);
    workingSessions.delete(sentTo);
    // 跑完打绿点；点开该会话时再清
    doneSessions.add(sentTo);
    everWorkedSessions.delete(sentTo);
    if (activeId === sentTo) {
      streamingEl = null;
      if (!(st.messageQueue?.length || (activeId === sentTo && messageQueue.length))) {
        setBusy(false);
      }
      setStatus("ready", "已完成");
    } else if (desktopSettings.notifyOnDone !== false) {
      const title =
        sessions.find((x) => x.id === sentTo)?.title ||
        st.meta?.title ||
        sentTo.slice(0, 8);
      void grokDesktop.notify?.({
        title: t("notify.doneTitle"),
        body: t("notify.doneBody", { title }),
      });
    }
    st.streamingEl = null;
    refreshSendButtonState();
    renderSidebar(ui.search?.value || "");
    await flushSessionQueue(sentTo);
  }
}

/** Drain queued follow-ups for a session (works in background tabs). */
/**
 * 自动 flush 已关闭：排队只由用户点「引导」发出。
 * 本轮结束后仍保留排队气泡，方便继续点引导。
 */
async function flushSessionQueue(sessionId) {
  if (!sessionId) return;
  const st = ensureSessionUi(sessionId);
  const isActive = sessionId === activeId;
  if (isActive) {
    // 同步 stash
    st.messageQueue = messageQueue.slice();
    if (messageQueue.length) rerenderQueuedTurns();
    updateLiveStrip();
  }
}

async function renameSessionUi(sessionId, currentTitle) {
  if (!sessionId) return false;
  const title = await askText({
    title: "重命名会话",
    message: "给这个会话起一个好认的名字。",
    defaultValue: currentTitle || "",
    placeholder: "例如：桌面端 UI 优化",
    okLabel: "保存",
  });
  if (!title) return false;
  try {
    const s = await grokDesktop.renameSession(sessionId, title);
    // Update local session list immediately
    sessions = sessions.map((x) =>
      x.id === sessionId ? { ...x, title, summary: title, updatedAt: s?.updatedAt || x.updatedAt } : x,
    );
    const st = ensureSessionUi(sessionId);
    if (st) st.meta = { ...(st.meta || {}), title, id: sessionId };
    if (sessionId === activeId) {
      applyHeader({ ...activeMeta, ...s, title, id: sessionId });
    }
    renderSidebar(ui.search.value);
    markActive(activeId);
    renderTabs();
    return true;
  } catch (err) {
    alert(err.message || err);
    return false;
  }
}

ui.rename.onclick = async () => {
  if (!activeId) return;
  await renameSessionUi(activeId, activeMeta?.title || "");
};

ui.del.onclick = async () => {
  if (!activeId) return;
  const ok = await askConfirm({
    title: "删除会话",
    message: "永久删除此会话？此操作不可恢复。",
    okLabel: "删除",
    danger: true,
  });
  if (!ok) return;
  const id = activeId;
  try {
    await grokDesktop.deleteSession(id);
    removeOpenTab(id);
    if (activeId === id) {
      activeId = null;
      const next = openTabs[0];
      if (next) void selectSession(next);
      else {
        showWelcome();
        setStatus("idle", "就绪");
      }
    }
    await refreshSessions();
  } catch (err) {
    alert(err.message || err);
  }
};

// streams — batched per frame so long chats don't reflow on every token
grokDesktop.onChunk((payload) => {
  enqueueStreamChunk(payload);
});
grokDesktop.onTool((payload) => {
  forSession(
    payload || {},
    (sid, st, isActive) => {
      if (isActive && connecting) return;
      // Flush pending text before tool card so order stays correct
      if (st.chunkRaf) {
        cancelAnimationFrame(st.chunkRaf);
        st.chunkRaf = 0;
      }
      if (st.chunkBuf?.thought || st.chunkBuf?.assistant) flushStreamChunks(sid);
      endStreamChrome(sid);
      streamingEl = null;
      st.streamingEl = null;
      appendToolCard(payload || { title: "tool" });
    },
    { scroll: true, tabs: true },
  );
});
grokDesktop.onDiff?.((change) => {
  forSession(
    change || {},
    (sid, st, isActive) => {
      if (isActive && connecting) return;
      streamingEl = null;
      st.streamingEl = null;
      appendDiffCard(change || {});
    },
    { scroll: true },
  );
});
grokDesktop.onMedia((media) => {
  forSession(
    media || {},
    (sid, st, isActive) => {
      if (isActive && connecting) return;
      // Keep streamingEl so image attaches to the current assistant bubble
      if (media?.dataUrl) {
        appendMedia(media.dataUrl, media.path || media.dataUrl.slice(0, 64), {
          role: "assistant",
        });
      }
    },
    { scroll: true },
  );
});
grokDesktop.onPermission?.((req) => {
  forSession(
    req || {},
    (sid, st, isActive) => {
      if (isActive && connecting) return;
      streamingEl = null;
      st.streamingEl = null;
      appendPermissionCard(req);
    },
    { scroll: true },
  );
});
grokDesktop.onPlan?.((update) => {
  const sid = update?.sessionId || activeId;
  if (!sid) return;
  const st = ensureSessionUi(sid);
  st.plan = update;
  if (sid === activeId) {
    renderPlan(update);
    if (!planOpen && normalizePlanEntries(update).length) {
      // auto-show once when first plan arrives
      setPlanOpen(true);
    }
  }
  renderTabs();
});
grokDesktop.onAgents?.((info) => {
  if (Array.isArray(info?.openIds)) {
    liveAgents = new Set(info.openIds);
    // keep tabs that are either live or currently listed
    for (const id of info.openIds) {
      if (!openTabs.includes(id)) openTabs.push(id);
    }
    renderTabs();
  }
});
grokDesktop.onStatus(({ state, detail, session, sessionId }) => {
  const sid = sessionId || session?.id || null;
  if (sid) {
    const st = ensureSessionUi(sid);
    if (state) {
      st.statusState = state;
      st.statusDetail = detail || st.statusDetail;
    }
    if (state === "working") {
      workingSessions.add(sid);
      everWorkedSessions.add(sid);
      doneSessions.delete(sid);
    } else if (state === "ready" || state === "error" || state === "disconnected") {
      // 本轮 prompt 还在 await 时，忽略中途的 ready，避免误判为空闲导致插不进去
      if (!promptInFlight.has(sid)) {
        const wasWorking = workingSessions.has(sid) || everWorkedSessions.has(sid);
        workingSessions.delete(sid);
        // 跑完 → 绿点（当前会话也显示，点开/再点一次清）
        if (wasWorking && (state === "ready" || state === "error")) {
          doneSessions.add(sid);
          // 后台会话完成 → 系统通知
          if (
            state === "ready" &&
            sid !== activeId &&
            desktopSettings.notifyOnDone !== false
          ) {
            const title =
              sessions.find((x) => x.id === sid)?.title ||
              sessionUi.get(sid)?.meta?.title ||
              sid.slice(0, 8);
            void grokDesktop.notify?.({
              title: t("notify.doneTitle"),
              body: t("notify.doneBody", { title }),
            });
          }
        }
        if (state === "ready" || state === "error") {
          everWorkedSessions.delete(sid);
        }
      }
      if (st.chunkRaf) {
        cancelAnimationFrame(st.chunkRaf);
        st.chunkRaf = 0;
      }
      if (st.chunkBuf?.thought || st.chunkBuf?.assistant) flushStreamChunks(sid);
      endStreamChrome(sid);
      st.streamingEl = null;
      if (sid === activeId) streamingEl = null;
    }
    if (session) st.meta = { ...(st.meta || {}), ...session };
    scheduleRenderTabs(state === "working" || state === "ready");
    refreshSidebarSessionState();
  }
  // 状态栏：仅当焦点会话，且不要在 promptInFlight 时被 ready 冲掉
  if (!sid || sid === activeId) {
    if (state === "working") {
      if (state) setStatus(state, detail);
      setBusy(true);
      refreshSendButtonState();
    } else if (state === "ready" || state === "error" || state === "disconnected") {
      if (!promptInFlight.has(sid || activeId)) {
        if (state) setStatus(state, detail);
        setBusy(false);
        refreshSendButtonState();
      }
    } else if (state) {
      setStatus(state, detail);
    }
  }
  if (session?.id && session.id === activeId) {
    applyHeader({ ...activeMeta, ...session });
    updateLiveStrip();
  }
});

// Plan panel toggles
ui.planToggle?.addEventListener("click", () => setPlanOpen(!planOpen));
$("btn-plan-toggle-strip")?.addEventListener("click", () => setPlanOpen(!planOpen));
ui.planClose?.addEventListener("click", () => setPlanOpen(false));

// Access mode cards
document.querySelectorAll("#access-mode-cards .mode-card").forEach((card) => {
  card.addEventListener("click", () => {
    setAccessModeUi(card.getAttribute("data-mode"));
  });
});

// Live language switch
$("set-locale")?.addEventListener("change", () => {
  applyLocale($("set-locale").value, { persist: true });
});

// ── Memory ─────────────────────────────────────────────

async function loadMemory() {
  ui.memoryList.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const data = await grokDesktop.listMemory();
    ui.memoryEnabled.checked = !!data.enabled;
    ui.memoryList.replaceChildren();
    if (!data.files?.length) {
      ui.memoryList.innerHTML = `<div class="list-empty">${
        data.enabled
          ? "暂无记忆文件。在对话中让 Grok「记住」一些约定后会出现在这里。"
          : "记忆未启用。打开右上角开关，或在设置中启用。"
      }</div>`;
      return;
    }
    for (const f of data.files) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.innerHTML = `<h3></h3><p></p><div class="meta"><span class="badge"></span><span></span></div>`;
      card.querySelector("h3").textContent = f.title;
      card.querySelector("p").textContent = f.description || f.path;
      card.querySelector(".badge").textContent = f.scope === "global" ? "全局" : "项目";
      card.querySelector(".meta span:last-child").textContent = relativeTime(f.updatedAt);
      card.onclick = () => {
        ui.memoryList.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        void showMemoryFile(f);
      };
      ui.memoryList.appendChild(card);
    }
  } catch (err) {
    ui.memoryList.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

async function showMemoryFile(f) {
  ui.memoryDetail.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const data = await grokDesktop.readMemory(f.path);
    ui.memoryDetail.innerHTML = `
      <h2></h2>
      <p class="page-desc"></p>
      <div class="actions">
        <button type="button" class="btn primary" id="mem-save">保存</button>
        <button type="button" class="btn" id="mem-open">在文件管理器中显示</button>
      </div>
      <textarea class="editor" id="mem-editor"></textarea>`;
    ui.memoryDetail.querySelector("h2").textContent = f.title;
    ui.memoryDetail.querySelector(".page-desc").textContent = f.path;
    const editor = ui.memoryDetail.querySelector("#mem-editor");
    editor.value = data.content || "";
    ui.memoryDetail.querySelector("#mem-save").onclick = async () => {
      try {
        await grokDesktop.writeMemory(f.path, editor.value);
        alert("已保存");
      } catch (err) {
        alert(err.message || err);
      }
    };
    ui.memoryDetail.querySelector("#mem-open").onclick = () => grokDesktop.showItem(f.path);
  } catch (err) {
    ui.memoryDetail.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

ui.memoryEnabled?.addEventListener("change", async () => {
  try {
    await grokDesktop.setMemoryEnabled(ui.memoryEnabled.checked);
    // also sync settings checkbox if present
    const s = $("set-memory");
    if (s) s.checked = ui.memoryEnabled.checked;
    await loadMemory();
  } catch (err) {
    alert(err.message || err);
    ui.memoryEnabled.checked = !ui.memoryEnabled.checked;
  }
});
$("btn-memory-refresh")?.addEventListener("click", () => loadMemory());
$("btn-memory-add")?.addEventListener("click", async () => {
  const text = await askText({
    title: "添加记忆",
    message: "写入全局 MEMORY.md，例如：这个仓库用 pnpm；回复请用中文",
    placeholder: "一条长期约定…",
    okLabel: "写入",
  });
  if (!text?.trim()) return;
  try {
    // auto-enable memory when user explicitly saves a note
    if (!ui.memoryEnabled.checked) {
      await grokDesktop.setMemoryEnabled(true);
      ui.memoryEnabled.checked = true;
    }
    await grokDesktop.appendMemory({ text: text.trim(), scope: "global" });
    await loadMemory();
    alert("已写入全局记忆。新开的对话会用到（需保持「启用记忆」打开）。");
  } catch (err) {
    alert(err.message || err);
  }
});
$("btn-memory-clear")?.addEventListener("click", async () => {
  if (!confirm("清空记忆？将调用 grok memory clear（可能仅清当前工作区）。")) return;
  try {
    await grokDesktop.clearMemory();
    await loadMemory();
  } catch (err) {
    alert(err.message || err);
  }
});

// ── Skills ─────────────────────────────────────────────

async function loadSkills() {
  ui.skillsList.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const list = await grokDesktop.listSkills();
    ui.skillsList.replaceChildren();
    if (!list.length) {
      ui.skillsList.innerHTML = '<div class="list-empty">未发现 Skill</div>';
      return;
    }
    for (const s of list) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.innerHTML = `<h3></h3><p></p><div class="meta"><span class="badge"></span></div>`;
      card.querySelector("h3").textContent = s.name;
      card.querySelector("p").textContent = s.description || "";
      card.querySelector(".badge").textContent = s.scope;
      card.onclick = () => {
        ui.skillsList.querySelectorAll(".card").forEach((c) => c.classList.remove("active"));
        card.classList.add("active");
        void showSkill(s.name);
      };
      ui.skillsList.appendChild(card);
    }
  } catch (err) {
    ui.skillsList.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

async function showSkill(name) {
  ui.skillDetail.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const s = await grokDesktop.readSkill(name);
    if (!s) {
      ui.skillDetail.innerHTML = '<div class="list-error">未找到</div>';
      return;
    }
    ui.skillDetail.innerHTML = `
      <h2></h2>
      <p class="page-desc"></p>
      <div class="actions">
        <button type="button" class="btn" id="skill-open-dir">打开目录</button>
        <button type="button" class="btn" id="skill-open-file">打开 SKILL.md</button>
      </div>
      <pre></pre>`;
    ui.skillDetail.querySelector("h2").textContent = s.name;
    ui.skillDetail.querySelector(".page-desc").textContent = s.description || s.path;
    ui.skillDetail.querySelector("pre").textContent = s.markdown || s.body || "";
    $("skill-open-dir").onclick = () => grokDesktop.openSkill(s.path);
    $("skill-open-file").onclick = () => grokDesktop.openSkill(s.skillFile);
  } catch (err) {
    ui.skillDetail.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

$("btn-skill-refresh")?.addEventListener("click", () => loadSkills());
$("btn-skill-create")?.addEventListener("click", async () => {
  const name = await askText({
    title: "新建 Skill",
    message: "名称请用英文短横线，例如 my-helper",
    placeholder: "skill-name",
    okLabel: "下一步",
  });
  if (!name) return;
  const description =
    (await askText({
      title: "Skill 描述",
      message: "一句话说明这个 Skill 做什么（可留空）",
      placeholder: "简短描述",
      okLabel: "创建",
    })) || "";
  try {
    const s = await grokDesktop.createSkill({ name, description });
    await loadSkills();
    if (s?.name) await showSkill(s.name);
  } catch (err) {
    alert(err.message || err);
  }
});

// ── Plugins ────────────────────────────────────────────

async function loadPlugins() {
  ui.pluginsInstalled.innerHTML = '<div class="list-empty">加载中…</div>';
  try {
    const installed = await grokDesktop.listInstalledPlugins();
    renderPluginCards(ui.pluginsInstalled, installed, "installed");
  } catch (err) {
    ui.pluginsInstalled.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

async function loadMarketplace() {
  ui.pluginsMarket.innerHTML = '<div class="list-empty">拉取市场…</div>';
  try {
    const r = await grokDesktop.listAvailablePlugins();
    const items = Array.isArray(r) ? r : r.items || [];
    if (r?.error && !items.length) {
      ui.pluginsMarket.innerHTML = `<div class="list-error">${r.error}</div>`;
      return;
    }
    renderPluginCards(ui.pluginsMarket, items, "market");
  } catch (err) {
    ui.pluginsMarket.innerHTML = `<div class="list-error">${err.message}</div>`;
  }
}

function renderPluginCards(container, items, mode) {
  container.replaceChildren();
  if (!items?.length) {
    container.innerHTML =
      mode === "installed"
        ? '<div class="list-empty">尚未安装插件。可从市场安装，或在上方输入 git URL。</div>'
        : '<div class="list-empty">市场暂无数据</div>';
    return;
  }
  for (const p of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.style.cursor = "default";
    const name = p.name || "plugin";
    const status = p.status || (p.enabled === false ? "disabled" : "installed");
    card.innerHTML = `
      <h3></h3><p></p>
      <div class="meta"><span class="badge"></span><span class="badge scope"></span></div>
      <div class="actions" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"></div>`;
    card.querySelector("h3").textContent = name;
    card.querySelector("p").textContent = p.description || "";
    const badge = card.querySelector(".badge");
    badge.textContent = status;
    badge.classList.add(/disable|available/i.test(status) ? "off" : "on");
    card.querySelector(".scope").textContent = p.marketplace || p.scope || mode;
    const actions = card.querySelector(".actions");
    if (mode === "market" || status === "available") {
      const btn = document.createElement("button");
      btn.className = "btn primary";
      btn.textContent = "安装";
      btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = "安装中…";
        try {
          await grokDesktop.installPlugin(name);
          await loadPlugins();
          await loadMarketplace();
        } catch (err) {
          alert(err.message || err);
          btn.disabled = false;
          btn.textContent = "安装";
        }
      };
      actions.appendChild(btn);
    } else {
      const en = document.createElement("button");
      en.className = "btn";
      en.textContent = status === "disabled" ? "启用" : "禁用";
      en.onclick = async () => {
        try {
          if (status === "disabled") await grokDesktop.enablePlugin(name);
          else await grokDesktop.disablePlugin(name);
          await loadPlugins();
        } catch (err) {
          alert(err.message || err);
        }
      };
      const un = document.createElement("button");
      un.className = "btn danger";
      un.textContent = "卸载";
      un.onclick = async () => {
        if (!confirm(`卸载 ${name}？`)) return;
        try {
          await grokDesktop.uninstallPlugin(name);
          await loadPlugins();
        } catch (err) {
          alert(err.message || err);
        }
      };
      actions.append(en, un);
    }
    container.appendChild(card);
  }
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const pt = tab.dataset.ptab;
    ui.pluginsInstalled.classList.toggle("hidden", pt !== "installed");
    ui.pluginsMarket.classList.toggle("hidden", pt !== "market");
    if (pt === "market") void loadMarketplace();
  });
});
$("btn-plugin-refresh")?.addEventListener("click", () => {
  void loadPlugins();
  if (!ui.pluginsMarket.classList.contains("hidden")) void loadMarketplace();
});
$("btn-plugin-install")?.addEventListener("click", async () => {
  const spec = ui.pluginSpec.value.trim();
  if (!spec) return;
  const btn = $("btn-plugin-install");
  btn.disabled = true;
  btn.textContent = "安装中…";
  try {
    await grokDesktop.installPlugin(spec);
    ui.pluginSpec.value = "";
    await loadPlugins();
  } catch (err) {
    alert(err.message || err);
  } finally {
    btn.disabled = false;
    btn.textContent = "安装";
  }
});

// ── Settings ───────────────────────────────────────────

async function loadSettings() {
  const msg = $("settings-msg");
  try {
    const s = await grokDesktop.getSettings();
    desktopSettings = { ...desktopSettings, ...(s.desktop || {}) };
    if ($("set-show-thinking")) $("set-show-thinking").checked = !!desktopSettings.showThinking;
    if ($("set-enter-send")) $("set-enter-send").checked = desktopSettings.enterToSend !== false;
    if ($("set-notify-done")) $("set-notify-done").checked = desktopSettings.notifyOnDone !== false;
    if ($("set-check-updates")) $("set-check-updates").checked = desktopSettings.checkUpdates !== false;
    if ($("set-density")) $("set-density").value = desktopSettings.density || "comfortable";
    applyDensity(desktopSettings.density);
    applyWallpaper();

    const grok = s.grok || {};
    const mode = deriveAccessMode(desktopSettings, grok);
    desktopSettings.accessMode = mode;
    if ($("set-yolo")) $("set-yolo").checked = !!grok.yolo;
    setAccessModeUi(mode);

    const loc = desktopSettings.locale === "en" ? "en" : "zh";
    if ($("set-locale")) $("set-locale").value = loc;
    applyLocale(loc);

    const info = await grokDesktop.appInfo();
    if ($("set-memory")) $("set-memory").checked = !!info.memoryEnabled;
    if ($("set-cli")) $("set-cli").textContent = info.grokCli || "—";
    if ($("set-grok-home")) $("set-grok-home").textContent = s.grokHome || info.grokHome || "—";
    if ($("set-config-path")) $("set-config-path").textContent = grok.path || "—";
    if ($("set-desktop-ver")) $("set-desktop-ver").textContent = info.desktopVersion || "—";

    // default model dropdown
    const sel = $("set-model");
    if (sel) {
      sel.replaceChildren();
      const models = s.models?.models || [];
      if (!models.length) {
        const o = document.createElement("option");
        o.value = currentModelId || "";
        o.textContent = currentModelId || "—";
        sel.appendChild(o);
      } else {
        for (const m of models) {
          const o = document.createElement("option");
          o.value = m.id;
          o.textContent = m.id + (m.isDefault ? " ★" : "");
          sel.appendChild(o);
        }
        sel.value = grok.defaultModel || s.models?.defaultModel || models[0].id;
      }
    }

    if (msg) {
      msg.textContent = "";
      msg.classList.remove("error");
    }
  } catch (err) {
    if (msg) {
      msg.textContent = err.message || String(err);
      msg.classList.add("error");
    }
  }
}

function applyDensity(d) {
  document.body.classList.toggle("compact", d === "compact");
}

const WALLPAPER_GRADIENTS = {
  none: null,
  aurora: "linear-gradient(145deg, #1a1030 0%, #0f172a 40%, #134e4a 100%)",
  ember: "linear-gradient(160deg, #1c1010 0%, #3b1d1d 45%, #1a1020 100%)",
  ocean: "linear-gradient(150deg, #0b1220 0%, #0e2a4a 50%, #0f172a 100%)",
  mist: "linear-gradient(180deg, #18181b 0%, #27272a 50%, #1e1b2e 100%)",
};

/** 云端生成的黑白航天主题：id → 本地绝对路径 */
/** @type {Record<string, {path:string,thumbPath?:string,name:string}>} */
let wallpaperAssets = {};

function pathToFileUrl(p) {
  if (!p) return "";
  const s = String(p);
  if (s.startsWith("data:") || s.startsWith("file:") || s.startsWith("http")) return s;
  return "file://" + s.replace(/\\/g, "/");
}

function applyWallpaper() {
  const bg = $("thread-bg");
  const dim = $("thread-bg-dim");
  if (!bg || !dim) return;
  const kind = desktopSettings.wallpaper || "none";
  const dimVal = Math.min(80, Math.max(0, Number(desktopSettings.wallpaperDim) || 45));

  bg.style.backgroundImage = "none";
  bg.style.background = "none";
  bg.style.backgroundSize = "cover";
  bg.style.backgroundPosition = "center";
  bg.style.backgroundRepeat = "no-repeat";

  if (kind === "none" || !kind) {
    bg.style.display = "none";
    dim.style.display = "none";
  } else if (kind === "custom" && (desktopSettings.wallpaperDataUrl || desktopSettings.wallpaperPath)) {
    const src = desktopSettings.wallpaperDataUrl || desktopSettings.wallpaperPath;
    bg.style.display = "block";
    dim.style.display = "block";
    bg.style.backgroundImage = `url("${pathToFileUrl(src).replace(/"/g, '\\"')}")`;
    dim.style.opacity = String(dimVal / 100);
  } else if (wallpaperAssets[kind]?.path) {
    bg.style.display = "block";
    dim.style.display = "block";
    bg.style.backgroundImage = `url("${pathToFileUrl(wallpaperAssets[kind].path).replace(/"/g, '\\"')}")`;
    dim.style.opacity = String(dimVal / 100);
  } else if (WALLPAPER_GRADIENTS[kind]) {
    bg.style.display = "block";
    dim.style.display = "block";
    bg.style.backgroundImage = "none";
    bg.style.background = WALLPAPER_GRADIENTS[kind];
    dim.style.opacity = String(dimVal / 100);
  } else {
    bg.style.display = "none";
    dim.style.display = "none";
  }

  document.querySelectorAll(".wp-swatch").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.wp === kind);
  });
  if ($("set-wallpaper-dim")) $("set-wallpaper-dim").value = String(dimVal);
  if ($("set-wallpaper-dim-val")) $("set-wallpaper-dim-val").textContent = String(dimVal);
  const lab = $("wallpaper-custom-label");
  if (lab) {
    if (kind === "custom" && desktopSettings.wallpaperPath) {
      lab.textContent = String(desktopSettings.wallpaperPath).split(/[/\\]/).pop();
    } else if (kind === "custom" && desktopSettings.wallpaperDataUrl) {
      lab.textContent = "已选图片";
    } else if (wallpaperAssets[kind]) {
      lab.textContent = wallpaperAssets[kind].name || kind;
    } else {
      lab.textContent = "未选择";
    }
  }
}

async function loadWallpaperAssets() {
  try {
    const list = (await grokDesktop.listWallpapers?.()) || [];
    wallpaperAssets = {};
    const grid = $("wallpaper-grid");
    const customBtn = grid?.querySelector('[data-wp="custom"]');
    for (const p of list) {
      if (!p?.id || !p.path) continue;
      wallpaperAssets[p.id] = p;
      if (!grid) continue;
      // 已有则更新背景，没有则插入
      let btn = grid.querySelector(`[data-wp="${p.id}"]`);
      if (!btn) {
        btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-swatch wp-photo";
        btn.dataset.wp = p.id;
        btn.title = p.name || p.id;
        if (customBtn) grid.insertBefore(btn, customBtn);
        else grid.appendChild(btn);
      }
      const thumb = p.thumbPath || p.path;
      btn.style.backgroundImage = `url("${pathToFileUrl(thumb).replace(/"/g, '\\"')}")`;
      btn.style.backgroundSize = "cover";
      btn.style.backgroundPosition = "center";
      btn.textContent = "";
    }
  } catch (err) {
    console.warn("loadWallpaperAssets", err);
  }
}

function wireWallpaperUi() {
  const grid = $("wallpaper-grid");
  if (grid && !grid._wpBound) {
    grid._wpBound = true;
    grid.addEventListener("click", async (e) => {
      const btn = e.target.closest(".wp-swatch");
      if (!btn) return;
      const kind = btn.dataset.wp;
      if (!kind) return;
      if (kind === "custom") {
        try {
          const imgs = await grokDesktop.pickImages();
          const one = Array.isArray(imgs) ? imgs[0] : null;
          if (!one?.dataUrl) return;
          desktopSettings = {
            ...desktopSettings,
            ...(await grokDesktop.saveDesktopSettings({
              wallpaper: "custom",
              wallpaperPath: one.path || one.name,
              wallpaperDataUrl: one.dataUrl,
              wallpaperDim: desktopSettings.wallpaperDim ?? 45,
            })),
          };
        } catch (err) {
          appendBanner(`选择图片失败：${err.message || err}`, "error");
          return;
        }
      } else {
        desktopSettings.wallpaper = kind;
        try {
          desktopSettings = {
            ...desktopSettings,
            ...(await grokDesktop.saveDesktopSettings({
              wallpaper: kind,
              wallpaperDim: desktopSettings.wallpaperDim ?? 45,
            })),
          };
        } catch {
          /* 本地预览优先 */
        }
      }
      applyWallpaper();
    });
  }
  $("btn-wallpaper-pick")?.addEventListener("click", async () => {
    try {
      const imgs = await grokDesktop.pickImages();
      const one = Array.isArray(imgs) ? imgs[0] : null;
      if (!one?.dataUrl) return;
      desktopSettings = {
        ...desktopSettings,
        ...(await grokDesktop.saveDesktopSettings({
          wallpaper: "custom",
          wallpaperPath: one.path || one.name,
          wallpaperDataUrl: one.dataUrl,
        })),
      };
      applyWallpaper();
    } catch (err) {
      appendBanner(`选择图片失败：${err.message || err}`, "error");
    }
  });
  $("set-wallpaper-dim")?.addEventListener("input", () => {
    const v = Number($("set-wallpaper-dim").value) || 0;
    if ($("set-wallpaper-dim-val")) $("set-wallpaper-dim-val").textContent = String(v);
    desktopSettings.wallpaperDim = v;
    applyWallpaper();
  });
  $("set-wallpaper-dim")?.addEventListener("change", async () => {
    const v = Number($("set-wallpaper-dim").value) || 0;
    try {
      desktopSettings = {
        ...desktopSettings,
        ...(await grokDesktop.saveDesktopSettings({ wallpaperDim: v })),
      };
    } catch {
      desktopSettings.wallpaperDim = v;
    }
    applyWallpaper();
  });
}

$("btn-settings-save")?.addEventListener("click", async () => {
  const msg = $("settings-msg");
  if (msg) {
    msg.classList.remove("error");
    msg.textContent = t("settings.saving");
  }
  try {
    const mode = normalizeAccessMode(
      document.querySelector("#access-mode-cards .mode-card.active")?.getAttribute("data-mode") ||
        desktopSettings.accessMode,
    );
    const mapped = accessModeToSettings(mode, !!$("set-yolo")?.checked);
    const locale = $("set-locale")?.value === "en" ? "en" : "zh";

    desktopSettings = await grokDesktop.saveDesktopSettings({
      showThinking: !!$("set-show-thinking")?.checked,
      enterToSend: !!$("set-enter-send")?.checked,
      notifyOnDone: !!$("set-notify-done")?.checked,
      checkUpdates: !!$("set-check-updates")?.checked,
      density: $("set-density")?.value || "comfortable",
      autoApprove: mapped.autoApprove,
      accessMode: mapped.accessMode,
      locale,
      wallpaper: desktopSettings.wallpaper || "none",
      wallpaperPath: desktopSettings.wallpaperPath || null,
      wallpaperDataUrl: desktopSettings.wallpaperDataUrl || null,
      wallpaperDim: Number($("set-wallpaper-dim")?.value) || desktopSettings.wallpaperDim || 45,
      setupDismissed: desktopSettings.setupDismissed,
    });
    applyDensity(desktopSettings.density);
    applyWallpaper();
    applyLocale(locale);
    setAccessModeUi(mapped.accessMode);
    try {
      await grokDesktop.setAutoApprove(mapped.autoApprove);
    } catch {
      /* ignore */
    }
    await grokDesktop.saveGrokSettings({
      permissionMode: mapped.permissionMode,
      yolo: mapped.yolo,
      defaultModel: $("set-model")?.value || undefined,
    });
    if ($("set-memory")) {
      await grokDesktop.setMemoryEnabled($("set-memory").checked);
      if (ui.memoryEnabled) ui.memoryEnabled.checked = $("set-memory").checked;
    }
    if (msg) msg.textContent = t("settings.saved");
  } catch (err) {
    if (msg) {
      msg.textContent = err.message || String(err);
      msg.classList.add("error");
    }
  }
});

// ── Slash command palette (/) ──────────────────────────

function hideSlash() {
  slashOpen = false;
  slashIndex = 0;
  slashFiltered = [];
  if (ui.slashMenu) {
    ui.slashMenu.classList.add("hidden");
    ui.slashMenu.replaceChildren();
  }
}

function filterSlash(query) {
  const q = (query || "").toLowerCase().replace(/^\//, "");
  const list = slashCommands.length
    ? slashCommands
    : []; // filled from ACP; also inject desktop locals
  const locals = [
    {
      name: "settings",
      titleZh: "设置",
      descZh: "打开桌面端设置",
      description: "settings",
      isSkill: false,
      desktopOnly: true,
    },
    {
      name: "status",
      titleZh: "当前状态",
      descZh: "连接、会话、模型与记忆开关",
      description: "status",
      isSkill: false,
      desktopOnly: true,
    },
  ];
  const merged = [...list];
  for (const l of locals) {
    if (!merged.some((c) => c.name === l.name)) merged.push(l);
  }
  if (!q) return merged.slice(0, 40);
  return merged
    .filter((c) => {
      const hay = `${c.name} ${c.titleZh || ""} ${c.descZh || ""} ${c.description || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 40);
}

function renderSlashMenu() {
  if (!ui.slashMenu) return;
  ui.slashMenu.replaceChildren();
  if (!slashFiltered.length) {
    ui.slashMenu.innerHTML =
      '<div class="slash-empty">无匹配命令 · 连接会话后会加载 CLI 全部 / 命令与 Skills</div>';
    ui.slashMenu.classList.remove("hidden");
    slashOpen = true;
    return;
  }
  slashFiltered.forEach((cmd, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slash-item" + (i === slashIndex ? " active" : "");
    btn.innerHTML = `
      <span class="cmd"></span>
      <span class="title"></span>
      <span class="badge-skill"></span>
      <span class="desc"></span>`;
    btn.querySelector(".cmd").textContent = `/${cmd.name}`;
    btn.querySelector(".title").textContent = cmd.titleZh || cmd.name;
    const badge = btn.querySelector(".badge-skill");
    if (cmd.isSkill) badge.textContent = "Skill";
    else badge.remove();
    btn.querySelector(".desc").textContent = cmd.descZh || cmd.description || "";
    btn.onmousedown = (e) => {
      e.preventDefault();
      applySlash(cmd);
    };
    ui.slashMenu.appendChild(btn);
  });
  ui.slashMenu.classList.remove("hidden");
  slashOpen = true;
  // scroll active into view
  const active = ui.slashMenu.querySelector(".slash-item.active");
  active?.scrollIntoView({ block: "nearest" });
}

function updateSlashFromInput() {
  const val = ui.input.value;
  // only when line starts with /
  const m = val.match(/^\/([^\n]*)$/);
  if (!m || !activeId) {
    hideSlash();
    return;
  }
  slashFiltered = filterSlash(m[1] || "");
  if (slashIndex >= slashFiltered.length) slashIndex = Math.max(0, slashFiltered.length - 1);
  renderSlashMenu();
}

/**
 * Desktop-local routes vs real agent slash commands.
 * Skills and CLI builtins always hit the live agent (no placeholders).
 */
function applySlash(cmd) {
  hideSlash();
  if (!cmd) return;
  const name = cmd.name;

  // Pure UI navigation / local actions
  if (name === "settings" || name === "desktop") {
    ui.input.value = "";
    switchView("settings");
    return;
  }
  if (name === "skills" && !cmd.isSkill) {
    ui.input.value = "";
    switchView("skills");
    return;
  }
  if ((name === "plugins" || name === "marketplace") && !cmd.isSkill) {
    ui.input.value = "";
    switchView(name === "marketplace" ? "plugins" : "plugins");
    return;
  }
  if (name === "mcps") {
    ui.input.value = "";
    switchView("settings");
    showSettingsPanel("mcp");
    return;
  }
  if (name === "memory" && !cmd.isSkill) {
    ui.input.value = "";
    switchView("memory");
    return;
  }
  if (name === "new" || name === "clear") {
    ui.input.value = "";
    void newSession();
    return;
  }
  if (name === "home" || name === "welcome") {
    ui.input.value = "";
    showWelcome();
    setStatus("idle", "就绪");
    return;
  }
  if (name === "rename" || name === "title") {
    ui.input.value = "";
    ui.rename?.click();
    return;
  }
  if (name === "export") {
    ui.input.value = "";
    $("btn-act-export")?.click();
    return;
  }
  if (name === "copy") {
    ui.input.value = "";
    // copy last assistant message from DOM
    const msgs = [...ui.inner.querySelectorAll(".turn.assistant .body")];
    const last = msgs[msgs.length - 1];
    if (last?.textContent) {
      navigator.clipboard?.writeText(last.textContent);
      appendBanner("已复制最近一条回复");
    } else {
      void runRealSlash("copy");
    }
    return;
  }
  if (name === "status") {
    ui.input.value = "";
    // real CLI info via agent
    void runRealSlash("session-info");
    return;
  }

  // Needs arguments → leave in input for user to complete
  const hint = cmd.input?.hint;
  if (hint) {
    ui.input.value = `/${name} `;
    ui.input.focus();
    const len = ui.input.value.length;
    ui.input.setSelectionRange(len, len);
    autosize();
    hideSlash();
    return;
  }

  // Fire real slash to agent
  ui.input.value = "";
  void runRealSlash(name);
}

grokDesktop.onCommands?.((payload) => {
  if (payload?.sessionId && payload.sessionId !== activeId) return;
  slashCommands = payload?.commands || [];
  if (slashOpen) updateSlashFromInput();
});

// ── Wire ───────────────────────────────────────────────

function renderSnippetWithMark(el, snippet, query) {
  el.replaceChildren();
  const snip = String(snippet || "");
  const q = String(query || "").trim();
  if (!q) {
    el.textContent = snip;
    return;
  }
  const low = snip.toLowerCase();
  const qLow = q.toLowerCase();
  const idx = low.indexOf(qLow);
  if (idx < 0) {
    el.textContent = snip;
    return;
  }
  el.appendChild(document.createTextNode(snip.slice(0, idx)));
  const mark = document.createElement("mark");
  mark.textContent = snip.slice(idx, idx + q.length);
  el.appendChild(mark);
  el.appendChild(document.createTextNode(snip.slice(idx + q.length)));
}

async function runContentSearch(q) {
  if (!ui.searchHits) return;
  const query = (q || "").trim();
  lastSearchQuery = query;
  if (query.length < 2) {
    ui.searchHits.classList.add("hidden");
    ui.searchHits.replaceChildren();
    return;
  }
  try {
    const hits = await grokDesktop.searchSessions(query, 20);
    if (!hits?.length) {
      ui.searchHits.classList.remove("hidden");
      ui.searchHits.innerHTML =
        '<div class="list-empty" style="padding:8px">全文无匹配（标题仍见下方列表）</div>';
      return;
    }
    ui.searchHits.classList.remove("hidden");
    ui.searchHits.replaceChildren();
    for (const h of hits) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-hit";
      btn.innerHTML = `
        <div class="sh-title"></div>
        <div class="sh-snip"></div>
        <div class="sh-meta"></div>`;
      btn.querySelector(".sh-title").textContent = h.title || h.id.slice(0, 8);
      renderSnippetWithMark(btn.querySelector(".sh-snip"), h.snippet || "", query);
      btn.querySelector(".sh-meta").textContent = h.titleOnly
        ? `标题匹配 · ${relativeTime(h.updatedAt)}`
        : `${h.matchCount || 1} 处 · ${relativeTime(h.updatedAt)}`;
      btn.onclick = () => {
        void openSessionWithHighlight(h.id, h.query || query);
      };
      ui.searchHits.appendChild(btn);
    }
  } catch (err) {
    ui.searchHits.classList.remove("hidden");
    ui.searchHits.innerHTML = `<div class="list-error" style="padding:8px">${err.message || err}</div>`;
  }
}

ui.search.addEventListener("input", () => {
  renderSidebar(ui.search.value);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runContentSearch(ui.search.value), 280);
});
ui.refresh.addEventListener("click", () => refreshSessions());
ui.neu.addEventListener("click", () => newSession());
ui.send.addEventListener("click", () => send());
ui.cancel.addEventListener("click", async () => {
  if (!activeId) return;
  const sid = activeId;
  try {
    await grokDesktop.cancel(sid);
  } catch (err) {
    appendBanner(`停止失败：${err?.message || err}`, "error");
  }
  // 立刻让界面可插话/可发送，不必等 CLI 回调
  workingSessions.delete(sid);
  const st = ensureSessionUi(sid);
  st.statusState = "ready";
  st.statusDetail = "已停止";
  if (st.chunkRaf) {
    cancelAnimationFrame(st.chunkRaf);
    st.chunkRaf = 0;
  }
  endStreamChrome(sid);
  st.streamingEl = null;
  streamingEl = null;
  setBusy(false);
  setStatus("ready", "已停止");
  scheduleRenderTabs(true);
  appendBanner(
    messageQueue.length
      ? `已停止当前任务。队列里还有 ${messageQueue.length} 条补充指示，空闲后会自动发送（可点「清空」取消）。`
      : "已停止当前任务。可继续输入新消息。",
  );
  ui.input?.focus();
});

function onComposerInput() {
  refreshSendButtonState();
  autosize();
  updateSlashFromInput();
}
ui.input.addEventListener("input", onComposerInput);
ui.input.addEventListener("compositionend", onComposerInput);
ui.input.addEventListener("change", onComposerInput);
// Voice / IME may inject text without a normal input event
ui.input.addEventListener("keyup", () => {
  refreshSendButtonState();
});
ui.input.addEventListener("keydown", (e) => {
  // Don't steal Enter while Chinese IME / voice composition is confirming
  if (e.isComposing || e.keyCode === 229) return;

  if (slashOpen) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      slashIndex = Math.min(slashIndex + 1, Math.max(0, slashFiltered.length - 1));
      renderSlashMenu();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      slashIndex = Math.max(slashIndex - 1, 0);
      renderSlashMenu();
      return;
    }
    if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
      if (slashFiltered[slashIndex]) {
        e.preventDefault();
        applySlash(slashFiltered[slashIndex]);
        return;
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hideSlash();
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    if (desktopSettings.enterToSend === false) return;
    e.preventDefault();
    void send();
  }
});

// Session list right-click → real context menu
ui.list.addEventListener("contextmenu", (e) => {
  const row = e.target.closest(".session-row");
  if (!row?.dataset.sessionId) return;
  e.preventDefault();
  showSessionCtx(e.clientX, e.clientY, row.dataset.sessionId);
});

$("session-ctx")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn || !ctxSessionId) return;
  const id = ctxSessionId;
  const act = btn.dataset.act;
  hideSessionCtx();
  const s = sessions.find((x) => x.id === id);
  try {
    if (act === "open") {
      if (view !== "chat") switchView("chat");
      void selectSession(id);
    } else if (act === "pin") {
      await togglePinSession(id);
    } else if (act === "rename") {
      await renameSessionUi(id, s?.title || "");
    } else if (act === "export") {
      const r = await grokDesktop.exportSession(id);
      if (r?.ok) flashToast("已导出");
      else if (!r?.cancelled) flashToast(r?.error || "导出取消");
    } else if (act === "copy-id") {
      await copyText(id);
      flashToast("已复制会话 ID");
    } else if (act === "copy-title") {
      await copyText(s?.title || id);
      flashToast("已复制标题");
    } else if (act === "copy-cwd") {
      if (!s?.cwd) {
        flashToast("无工作目录");
        return;
      }
      await copyText(s.cwd);
      flashToast("已复制工作目录");
    } else if (act === "reveal") {
      const info = await grokDesktop.sessionPath?.(id);
      if (!info?.ok || !info.path) {
        flashToast(info?.error || "找不到会话目录");
        return;
      }
      await grokDesktop.showItem?.(info.path);
    } else if (act === "archive") {
      await toggleArchiveSession(id);
    } else if (act === "delete") {
      const ok = await askConfirm({
        title: "删除会话",
        message: `确定删除「${s?.title || id}」？此操作不可恢复。`,
        okLabel: "删除",
        danger: true,
      });
      if (!ok) return;
      await grokDesktop.deleteSession(id);
      // also drop from pin/archive lists
      await persistSessionLists({
        pinnedSessionIds: [...pinnedSet()].filter((x) => x !== id),
        archivedSessionIds: [...archivedSet()].filter((x) => x !== id),
      });
      removeOpenTab(id);
      if (activeId === id) showWelcome();
      await refreshSessions();
      schedulePersistTabs();
    }
  } catch (err) {
    flashToast(err.message || String(err));
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#session-ctx")) hideSessionCtx();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") hideSessionCtx();
});


// keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Ctrl/Cmd+Tab · Ctrl/Cmd+Shift+Tab — cycle parallel session tabs
  if ((e.ctrlKey || e.metaKey) && e.key === "Tab") {
    if (openTabs.length >= 2) {
      e.preventDefault();
      cycleTab(e.shiftKey ? -1 : 1);
      return;
    }
  }
  // Ctrl/Cmd+W — close current agent tab (not delete session)
  if ((e.ctrlKey || e.metaKey) && (e.key === "w" || e.key === "W") && activeId && openTabs.includes(activeId)) {
    if (e.target.matches("input, textarea, select") && !e.metaKey) return;
    // only when not heavily typing conflict — allow always with meta on linux often is Super; ctrl+w is fine
    if (view === "chat") {
      e.preventDefault();
      const id = activeId;
      void (async () => {
        try {
          await grokDesktop.closeAgent?.(id);
        } catch {
          /* ignore */
        }
        stashComposer(id);
        removeOpenTab(id);
        const next = openTabs[0];
        if (next) void selectSession(next);
        else showWelcome();
      })();
      return;
    }
  }
  if (e.target.matches("input, textarea, select")) return;
  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    newSession();
  }
  // P — toggle plan panel when a session is open
  if ((e.key === "p" || e.key === "P") && activeId && view === "chat") {
    e.preventDefault();
    setPlanOpen(!planOpen);
  }
});

// ── 环境诊断 / 首次引导 / 更新 ─────────────────────────

async function runDiagnose() {
  try {
    return await grokDesktop.diagnose();
  } catch (err) {
    return {
      ok: false,
      cliExists: false,
      loggedIn: false,
      authHint: err.message || String(err),
      installHint: "无法完成检测",
    };
  }
}

function renderSetupChecks(diag) {
  const ul = $("setup-checks");
  const hint = $("setup-hint");
  if (!ul) return;
  ul.replaceChildren();
  const items = [
    {
      ok: !!diag.cliExists,
      title: "Grok CLI",
      detail: diag.cliExists
        ? `${diag.cli || "已找到"}${diag.cliVersion ? " · " + diag.cliVersion : ""}`
        : "未找到 grok 可执行文件",
    },
    {
      ok: !!diag.loggedIn,
      title: "登录状态",
      detail: diag.authHint || (diag.loggedIn ? "已登录" : "未登录"),
    },
  ];
  for (const it of items) {
    const li = document.createElement("li");
    li.className = it.ok ? "ok" : "bad";
    li.innerHTML = `<span class="ck">${it.ok ? "✓" : "!"}</span><div><strong></strong><p></p></div>`;
    li.querySelector("strong").textContent = it.title;
    li.querySelector("p").textContent = it.detail;
    ul.appendChild(li);
  }
  if (hint) {
    const lines = [];
    if (diag.installHint) lines.push(diag.installHint);
    if (diag.loginHint) lines.push(diag.loginHint);
    if (diag.ok) lines.push("环境正常，可以开始使用。");
    hint.textContent = lines.join("\n");
  }
}

async function showSetupIfNeeded(force = false) {
  const overlay = $("setup-overlay");
  if (!overlay) return;
  const diag = await runDiagnose();
  // 更新侧栏 CLI 信息
  if (ui.cliInfo) {
    if (!diag.cliExists) {
      ui.cliInfo.textContent = "未检测到 grok CLI";
      ui.cliInfo.title = diag.installHint || "";
    } else {
      ui.cliInfo.textContent = `${diag.cli || "grok"} · v${diag.desktopVersion || "0.7"}`;
      ui.cliInfo.title = `CLI: ${diag.cli}\n${diag.authHint || ""}\nHome: ${diag.grokHome || ""}`;
    }
  }
  // 首次必出；之后仅 CLI 缺失或手动「环境检测」时再弹（登录缺失不反复打断）
  const need =
    force || !desktopSettings.setupDismissed || !diag.cliExists;
  if (!need) {
    overlay.classList.add("hidden");
    return diag;
  }
  renderSetupChecks(diag);
  overlay.classList.remove("hidden");
  return diag;
}

function hideSetup(permanent) {
  $("setup-overlay")?.classList.add("hidden");
  if (permanent) {
    desktopSettings.setupDismissed = true;
    void grokDesktop.saveDesktopSettings({ setupDismissed: true }).catch(() => {});
  }
}

async function checkForUpdates(manual = false) {
  const desc = $("update-check-desc");
  const banner = $("update-banner");
  const text = $("update-banner-text");
  if (!manual && desktopSettings.checkUpdates === false) return;
  try {
    if (desc && manual) desc.textContent = t("update.checking");
    const r = await grokDesktop.checkUpdate();
    if (!r?.ok) {
      if (desc)
        desc.textContent = manual
          ? t("update.fail", { error: r?.error || "network" })
          : desc.textContent;
      return;
    }
    if (r.hasUpdate) {
      const msg = t("update.found", { latest: r.latest, current: r.current });
      if (desc) desc.textContent = msg;
      if (banner && text) {
        text.textContent = msg;
        banner.dataset.url = r.url || "";
        banner.classList.remove("hidden");
      }
    } else if (manual && desc) {
      desc.textContent = t("update.latest", { current: r.current });
    }
  } catch (err) {
    if (manual && desc) desc.textContent = err.message || String(err);
  }
}

$("setup-recheck")?.addEventListener("click", async () => {
  const diag = await runDiagnose();
  renderSetupChecks(diag);
});
$("setup-continue")?.addEventListener("click", () => hideSetup(true));
$("setup-open-cli-doc")?.addEventListener("click", () => {
  void grokDesktop.openExternal?.("https://x.ai/cli");
});
// Developer card links (Settings → About)
function openDevUrl(el) {
  const url = el?.dataset?.url || el?.getAttribute?.("data-url");
  if (url) void grokDesktop.openExternal?.(url);
}
$("dev-github-profile")?.addEventListener("click", (e) => {
  e.preventDefault();
  openDevUrl(e.currentTarget);
});
["btn-dev-feedback", "btn-dev-sponsor", "btn-dev-repo", "btn-dev-releases"].forEach((id) => {
  $(id)?.addEventListener("click", (e) => openDevUrl(e.currentTarget));
});

// Chat message links → system browser (not inside Electron)
document.addEventListener(
  "click",
  (e) => {
    const a = e.target?.closest?.("a.msg-link");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const href = a.getAttribute("href") || a.href || "";
    if (/^https?:\/\//i.test(href)) {
      void grokDesktop.openExternal?.(href);
    }
  },
  true,
);

$("btn-check-update")?.addEventListener("click", () => void checkForUpdates(true));
$("btn-run-diagnose")?.addEventListener("click", async () => {
  const diag = await showSetupIfNeeded(true);
  if (diag?.ok) {
    const desc = $("update-check-desc");
    if (desc) desc.textContent = "环境正常：CLI 与登录均已就绪";
  }
});
$("update-banner-open")?.addEventListener("click", () => {
  const url =
    $("update-banner")?.dataset?.url ||
    "https://github.com/xiaokaige1130-maker/grok-desktop/releases";
  void grokDesktop.openExternal?.(url);
});
$("update-banner-dismiss")?.addEventListener("click", () => {
  $("update-banner")?.classList.add("hidden");
});

// ── Boot ───────────────────────────────────────────────

(async function boot() {
  try {
    const info = await grokDesktop.appInfo();
    ui.cliInfo.textContent = `${info.grokCli || "grok"} · v${info.desktopVersion || "0.8"}`;
    ui.cliInfo.title = `CLI: ${info.grokCli}\nHome: ${info.grokHome}`;
  } catch {
    ui.cliInfo.textContent = "CLI not found";
  }
  try {
    const s = await grokDesktop.getSettings();
    desktopSettings = { ...desktopSettings, ...(s.desktop || {}) };
    const grok = s.grok || {};
    desktopSettings.accessMode = deriveAccessMode(desktopSettings, grok);
    applyDensity(desktopSettings.density);
    applyWallpaper();
    applyLocale(desktopSettings.locale === "en" ? "en" : desktopSettings.locale || GrokI18n?.detectLocale?.() || "zh");
    setAccessModeUi(desktopSettings.accessMode);
  } catch {
    if (window.GrokI18n) GrokI18n.applyI18n(document);
  }
  wireWallpaperUi();
  await loadWallpaperAssets();
  applyWallpaper();
  updateAccessChip();

  // 首次 / 环境异常 → 引导
  await showSetupIfNeeded(false);
  // 后台检查更新（不挡启动）
  void checkForUpdates(false);

  showWelcome();
  await refreshSessions();
  setStatus("idle", "就绪");

  // Restore open tabs from last run (labels only; connect on focus)
  try {
    const savedTabs = Array.isArray(desktopSettings.openTabs)
      ? desktopSettings.openTabs.filter((id) => sessions.some((s) => s.id === id))
      : [];
    if (savedTabs.length) {
      openTabs = savedTabs.slice(0, 12);
      renderTabs();
      const prefer =
        desktopSettings.lastActiveId && openTabs.includes(desktopSettings.lastActiveId)
          ? desktopSettings.lastActiveId
          : openTabs[0];
      if (prefer) {
        await selectSession(prefer);
      }
    }
  } catch {
    /* ignore restore errors */
  }

  setInterval(() => {
    if (view === "chat" && sessions.length > 0 && ui.list.childElementCount === 0) {
      renderSidebar(ui.search.value);
    }
  }, 2500);
})();
