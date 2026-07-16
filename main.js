const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const {
  listSessions,
  loadHistoryPreview,
  findSession,
  grokHome,
  ensureSessionSummary,
  renameSession,
  deleteSessionDir,
} = require("./src/sessions");
const { AcpClient } = require("./src/acp");
const { buildFileChange } = require("./src/diff");
const { searchSessions } = require("./src/search");
const plugins = require("./src/plugins");
const skills = require("./src/skills");
const settings = require("./src/settings");
const memory = require("./src/memory");
const mcp = require("./src/mcp");

let mainWindow = null;
/** @type {Map<string, { client: import('./src/acp').AcpClient, meta: object|null, cwd: string, lastUsed: number }>} */
const agents = new Map();
/** Currently focused session id (UI active tab). */
let activeSessionId = null;
/** @type {object|null} */
let activeSessionMeta = null;
/** Per-open generation to cancel stale openSession results for a given request. */
let openGeneration = 0;
/** Max parallel agent processes (LRU dispose when exceeded). */
const MAX_AGENTS = 6;

function resolveGrokCli() {
  return plugins.resolveGrokCli();
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  send("log", line);
}

function send(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch {
    /* ignore */
  }
}

function pathToDataUrl(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    // cap ~8MB for UI
    if (buf.length > 8 * 1024 * 1024) return null;
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".svg"
                ? "image/svg+xml"
                : "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function mediaForRenderer(media) {
  if (!media) return null;
  if (media.kind === "base64" && media.data) {
    return {
      kind: "dataUrl",
      dataUrl: `data:${media.mimeType || "image/png"};base64,${media.data}`,
      mimeType: media.mimeType,
    };
  }
  if (media.kind === "path" && media.path) {
    const dataUrl = pathToDataUrl(media.path);
    if (!dataUrl) return { kind: "path", path: media.path, mimeType: media.mimeType };
    return { kind: "dataUrl", dataUrl, path: media.path, mimeType: media.mimeType };
  }
  return media;
}

const APP_ICON = path.join(__dirname, "assets", "icon.png");

function createWindow() {
  // Compact default size — fits a normal laptop without dominating the screen
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 700,
    minWidth: 800,
    minHeight: 520,
    title: "Grok Desktop",
    icon: fs.existsSync(APP_ICON) ? APP_ICON : undefined,
    backgroundColor: "#0b0b0c",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Native right-click: 复制 / 粘贴 / 剪切 / 全选（输入框与选中文本）
  mainWindow.webContents.on("context-menu", (_e, params) => {
    const template = [];
    if (params.isEditable) {
      template.push(
        { role: "undo", label: "撤销" },
        { role: "redo", label: "重做" },
        { type: "separator" },
        { role: "cut", label: "剪切", enabled: params.editFlags?.canCut !== false },
        { role: "copy", label: "复制", enabled: params.editFlags?.canCopy !== false },
        { role: "paste", label: "粘贴", enabled: params.editFlags?.canPaste !== false },
        { role: "selectAll", label: "全选" },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      template.push({ role: "copy", label: "复制" });
      template.push({
        label: "复制并粘贴到输入框",
        click: () => {
          mainWindow.webContents.send("chat:insert-text", params.selectionText);
        },
      });
    } else {
      // empty area in chat — still offer paste into composer when possible
      template.push({
        label: "粘贴到输入框",
        click: () => {
          mainWindow.webContents.send("chat:paste-request");
        },
      });
    }
    if (!template.length) return;
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
}

/** Strip heavy file bodies before sending diff to renderer. */
function toDiffEvent(change) {
  if (!change) return null;
  const { before, after, ...light } = change;
  return light;
}

function getAgentEntry(sessionId) {
  if (!sessionId) return null;
  return agents.get(sessionId) || null;
}

function getAgent(sessionId) {
  return getAgentEntry(sessionId)?.client || null;
}

function activeAgent() {
  return getAgent(activeSessionId);
}

function touchAgent(sessionId) {
  const e = getAgentEntry(sessionId);
  if (e) e.lastUsed = Date.now();
}

function disposeAgent(sessionId) {
  const e = agents.get(sessionId);
  if (!e) return;
  try {
    e.client.dispose();
  } catch {
    /* ignore */
  }
  agents.delete(sessionId);
  if (activeSessionId === sessionId) {
    activeSessionId = null;
  }
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  send("session:status", {
    state: "disconnected",
    detail: "助手已关闭",
    sessionId,
  });
}

function disposeAllAgents() {
  for (const id of [...agents.keys()]) disposeAgent(id);
}

function evictLruAgents(keepId) {
  while (agents.size > MAX_AGENTS) {
    let victim = null;
    let oldest = Infinity;
    for (const [id, e] of agents) {
      // Never kill the agent we're opening, the focused one, or one mid-prompt
      if (id === keepId || id === activeSessionId) continue;
      if (e.busy) continue;
      if (e.lastUsed < oldest) {
        oldest = e.lastUsed;
        victim = id;
      }
    }
    if (!victim) {
      // Prefer idle non-active; only as last resort skip busy ones entirely
      for (const id of agents.keys()) {
        if (id === keepId || id === activeSessionId) continue;
        if (agents.get(id)?.busy) continue;
        victim = id;
        break;
      }
    }
    if (!victim) {
      // All slots protected (busy/active) — allow exceeding MAX temporarily
      log(`agent pool full (${agents.size}/${MAX_AGENTS}); all busy/active, skip eviction`);
      break;
    }
    log(`evict agent ${victim.slice(0, 8)}… (max ${MAX_AGENTS})`);
    disposeAgent(victim);
  }
}

function wireAcpEvents(client, sessionIdHint) {
  const { localizeAll } = require("./src/commands-zh");
  const sid = () => client.sessionId || sessionIdHint || null;

  const withSid = (payload) => ({ ...payload, sessionId: sid() });

  client.on("messageChunk", (text) =>
    send("chat:chunk", withSid({ kind: "assistant", text })),
  );
  client.on("thoughtChunk", (text) =>
    send("chat:chunk", withSid({ kind: "thought", text })),
  );
  client.on("toolCall", (payload) => {
    const full = {
      phase: "start",
      ...payload,
      title: payload.title || payload.kind || "tool",
      status: payload.status || "running",
    };
    send("chat:tool", withSid(full));
    // File-change / diff preview for write-like tools (light payload, no full file bodies)
    try {
      const change = buildFileChange(full, client.cwd);
      if (change) send("chat:diff", withSid(toDiffEvent(change)));
    } catch (err) {
      log(`diff build failed: ${err.message}`);
    }
  });
  client.on("toolCallUpdate", (payload) => {
    const full = {
      phase: "update",
      ...payload,
      title: payload.title || "tool",
      status: payload.status || "updated",
    };
    send("chat:tool", withSid(full));
    try {
      const change = buildFileChange(full, client.cwd);
      if (change) send("chat:diff", withSid({ ...toDiffEvent(change), status: full.status }));
    } catch {
      /* ignore */
    }
  });
  client.on("permissionRequest", (req) => send("chat:permission", withSid(req)));
  client.on("mediaContent", (media) => {
    const m = mediaForRenderer(media);
    if (m) send("chat:media", withSid(m));
  });
  client.on("commands", (list) => {
    send("commands:update", withSid({ commands: localizeAll(list) }));
  });
  client.on("mode", (mode) => send("session:mode", withSid({ mode })));
  client.on("model", (modelId) => send("session:model", withSid({ modelId })));
  client.on("plan", (update) => send("session:plan", withSid(update || {})));
  client.on("exit", (code) => {
    const id = sid();
    send(
      "session:status",
      withSid({ state: "disconnected", detail: `agent 已退出 (${code})` }),
    );
    if (id) agents.delete(id);
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  });
  client.on("error", (err) =>
    send("session:status", withSid({ state: "error", detail: err.message })),
  );
}

/**
 * Create a fresh ACP client for cwd (not yet mapped to a session id).
 */
async function createClient(cwd) {
  const env = { ...process.env };
  if (memory.isEnabledInConfig()) env.GROK_MEMORY = "1";
  const desk = settings.readDesktopSettings();
  const client = new AcpClient({
    cliPath: resolveGrokCli(),
    cwd,
    env,
    log,
    experimentalMemory: memory.isEnabledInConfig(),
  });
  client.setAutoApprove(desk.autoApprove !== false);
  await client.start();
  return client;
}

/**
 * Ensure an agent process exists for sessionId (reuses if still alive).
 */
async function ensureAgent(sessionId, cwd) {
  const existing = getAgentEntry(sessionId);
  if (existing?.client?.started && existing.client.proc && existing.client.sessionId === sessionId) {
    // cwd change on same session is rare; keep process if alive
    touchAgent(sessionId);
    return existing.client;
  }
  if (existing) disposeAgent(sessionId);

  evictLruAgents(sessionId);
  const client = await createClient(cwd);
  wireAcpEvents(client, sessionId);
  agents.set(sessionId, {
    client,
    meta: null,
    cwd,
    lastUsed: Date.now(),
    busy: false,
  });
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  return client;
}

function registerAgent(sessionId, client, cwd, meta) {
  // if another entry held this client under a temp key, clean up
  for (const [id, e] of agents) {
    if (e.client === client && id !== sessionId) agents.delete(id);
  }
  agents.set(sessionId, {
    client,
    meta: meta || null,
    cwd,
    lastUsed: Date.now(),
    busy: false,
  });
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
}

// Linux taskbar / .desktop StartupWMClass friendliness
app.setName("Grok Desktop");
if (process.platform === "linux" && fs.existsSync(APP_ICON)) {
  // Helps some desktops associate the running window with our icon
  app.whenReady().then(() => {
    try {
      if (app.dock?.setIcon) app.dock.setIcon(APP_ICON);
    } catch {
      /* ignore */
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  disposeAllAgents();
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => disposeAllAgents());

// ── Sessions ───────────────────────────────────────────

ipcMain.handle("sessions:list", async (_e, { limit } = {}) => {
  try {
    return listSessions({ limit: limit || 200 });
  } catch (err) {
    log(`sessions:list ${err.message}`);
    return [];
  }
});

ipcMain.handle("sessions:rename", async (_e, { sessionId, title }) => {
  return renameSession(sessionId, title);
});

ipcMain.handle("sessions:delete", async (_e, { sessionId }) => {
  disposeAgent(sessionId);
  // prefer CLI delete, fallback to dir rm
  try {
    await new Promise((resolve, reject) => {
      const { spawn } = require("child_process");
      const child = spawn(resolveGrokCli(), ["sessions", "delete", sessionId], {
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let err = "";
      child.stderr.on("data", (d) => {
        err += d.toString();
      });
      child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
      child.on("error", reject);
    });
    return { ok: true, id: sessionId };
  } catch (err) {
    log(`sessions delete CLI failed, fallback: ${err.message}`);
    return deleteSessionDir(sessionId);
  }
});

ipcMain.handle("sessions:searchContent", async (_e, { query, limit } = {}) => {
  try {
    return searchSessions(query, { limit: limit || 40 });
  } catch (err) {
    log(`sessions:searchContent ${err.message}`);
    return [];
  }
});

ipcMain.handle("agents:list", async () => ({
  openIds: [...agents.keys()],
  activeSessionId,
}));

ipcMain.handle("agents:close", async (_e, { sessionId } = {}) => {
  if (sessionId) disposeAgent(sessionId);
  return { ok: true, openIds: [...agents.keys()] };
});

ipcMain.handle("sessions:history", async (_e, { sessionId }) => {
  try {
    const s = findSession(sessionId);
    if (!s) return { error: "not found", session: null, messages: [], assets: [] };
    const messages = loadHistoryPreview(s.dir, { maxMessages: 40, maxChars: 2800 });
    // Session images from assets/ + images/ (with mtime for timeline placement)
    const assets = [];
    const seenPaths = new Set();
    const pushImg = (full, name) => {
      if (seenPaths.has(full)) return;
      if (!/\.(png|jpe?g|gif|webp)$/i.test(name)) return;
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.size < 32 || st.size > 12_000_000) return;
        const dataUrl = pathToDataUrl(full);
        if (!dataUrl) return;
        seenPaths.add(full);
        assets.push({
          name,
          path: full,
          dataUrl,
          mtimeMs: st.mtimeMs,
        });
      } catch {
        /* skip */
      }
    };
    for (const sub of ["assets", "images"]) {
      const dir = path.join(s.dir, sub);
      if (!fs.existsSync(dir)) continue;
      let names = [];
      try {
        names = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const name of names.slice(0, 60)) {
        pushImg(path.join(dir, name), name);
      }
    }
    assets.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0));
    return { session: s, messages, assets };
  } catch (err) {
    return { error: err.message, session: null, messages: [], assets: [] };
  }
});

/**
 * Focus an already-live agent without reconnect noise.
 * soft: true → no "connecting" status (instant tab switch).
 */
ipcMain.handle("session:activate", async (_e, { sessionId } = {}) => {
  if (!sessionId) return { ok: false, error: "no sessionId" };
  const live = getAgent(sessionId);
  if (!(live?.started && live.proc && live.sessionId === sessionId)) {
    return { ok: false, live: false };
  }
  let s = findSession(sessionId) || getAgentEntry(sessionId)?.meta || null;
  activeSessionId = sessionId;
  activeSessionMeta = s;
  touchAgent(sessionId);
  const models =
    extractModels(live.lastSessionMeta, live) ||
    extractModels({ models: live.lastModels }, live);
  send("agents:update", { openIds: [...agents.keys()], activeSessionId });
  return {
    ok: true,
    live: true,
    session: s,
    commands: live.availableCommands || [],
    models,
    openIds: [...agents.keys()],
    currentModelId: live.currentModelId || models?.currentModelId || null,
  };
});

ipcMain.handle("session:open", async (_e, { sessionId, soft } = {}) => {
  const gen = ++openGeneration;
  let s = findSession(sessionId);
  // retry once — summary may appear slightly after create
  if (!s) {
    await new Promise((r) => setTimeout(r, 250));
    s = findSession(sessionId);
  }
  if (!s) throw new Error("磁盘上找不到该会话（可点刷新后再试）");
  const cwd = s.cwd && fs.existsSync(s.cwd) ? s.cwd : process.env.HOME || process.cwd();
  log(`open session ${sessionId} cwd=${cwd} soft=${!!soft}`);
  activeSessionId = sessionId;
  activeSessionMeta = s;

  // Fast path: agent already live — never emit "connecting" (kills product feel on tab switch)
  const live = getAgent(sessionId);
  if (live?.started && live.proc && live.sessionId === sessionId) {
    touchAgent(sessionId);
    const entry = getAgentEntry(sessionId);
    if (entry) entry.meta = s;
    const { localizeAll } = require("./src/commands-zh");
    const commands = live.availableCommands || [];
    if (commands.length && !soft) {
      send("commands:update", {
        sessionId,
        commands: localizeAll(commands),
      });
    }
    const models =
      extractModels(live.lastSessionMeta, live) ||
      extractModels({ models: live.lastModels }, live);
    if (models && !soft) send("session:models", { ...models, sessionId });
    // Only broadcast ready when not soft — soft switches stay silent
    if (!soft) {
      send("session:status", {
        state: "ready",
        detail: "已连接",
        session: s,
        sessionId,
      });
    }
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: s,
      reused: true,
      commands,
      models,
      openIds: [...agents.keys()],
    };
  }

  send("session:status", {
    state: "connecting",
    detail: "连接助手…",
    session: s,
    sessionId,
  });

  try {
    const client = await ensureAgent(sessionId, cwd);
    if (gen !== openGeneration) return { ok: false, cancelled: true };
    const loaded = await client.loadSession(sessionId);
    if (gen !== openGeneration) return { ok: false, cancelled: true };
    const entry = getAgentEntry(sessionId);
    if (entry) entry.meta = s;
    activeSessionMeta = s;
    if (client.availableCommands?.length) {
      const { localizeAll } = require("./src/commands-zh");
      send("commands:update", {
        sessionId,
        commands: localizeAll(client.availableCommands),
      });
    }
    const models = extractModels(loaded, client) || extractModels(client.lastSessionMeta, client);
    if (models) send("session:models", { ...models, sessionId });
    send("session:status", {
      state: "ready",
      detail: "已恢复",
      session: s,
      sessionId,
    });
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: s,
      commands: client.availableCommands || [],
      models,
      openIds: [...agents.keys()],
    };
  } catch (err) {
    log(`session:open failed: ${err.message}`);
    // one reconnect retry
    try {
      disposeAgent(sessionId);
      const client = await ensureAgent(sessionId, cwd);
      if (gen !== openGeneration) return { ok: false, cancelled: true };
      await client.loadSession(sessionId);
      activeSessionMeta = s;
      activeSessionId = sessionId;
      send("session:status", {
        state: "ready",
        detail: "已恢复（重试）",
        session: s,
        sessionId,
      });
      send("agents:update", { openIds: [...agents.keys()], activeSessionId });
      return { ok: true, session: s, retried: true, openIds: [...agents.keys()] };
    } catch (err2) {
      send("session:status", {
        state: "error",
        detail: err2.message,
        session: s,
        sessionId,
      });
      throw err2;
    }
  }
});

ipcMain.handle("session:new", async (_e, { cwd } = {}) => {
  const workDir = cwd && fs.existsSync(cwd) ? cwd : process.env.HOME || process.cwd();
  log(`new session cwd=${workDir}`);
  send("session:status", { state: "connecting", detail: "创建会话…" });
  try {
    evictLruAgents(null);
    const client = await createClient(workDir);
    const res = await client.newSession();
    const sid = res.sessionId;
    wireAcpEvents(client, sid);
    // Immediately index so it shows in the sidebar
    activeSessionMeta = ensureSessionSummary({
      id: sid,
      cwd: workDir,
      title: "新对话",
    });
    activeSessionId = sid;
    registerAgent(sid, client, workDir, activeSessionMeta);
    const models = extractModels(res);
    if (models) send("session:models", { ...models, sessionId: sid });
    send("session:status", {
      state: "ready",
      detail: "新对话",
      session: activeSessionMeta,
    });
    send("agents:update", { openIds: [...agents.keys()], activeSessionId });
    return {
      ok: true,
      session: activeSessionMeta,
      models,
      openIds: [...agents.keys()],
    };
  } catch (err) {
    send("session:status", { state: "error", detail: err.message });
    throw err;
  }
});

/**
 * prompt: { text?: string, images?: [{ mimeType, dataBase64 }], sessionId?: string }
 */
ipcMain.handle("session:prompt", async (_e, payload = {}) => {
  const sid = payload.sessionId || activeSessionId;
  const client = getAgent(sid);
  if (!client || !client.sessionId) throw new Error("没有活动会话");
  const entry = getAgentEntry(sid);
  if (entry?.busy) {
    throw new Error("该会话仍在处理上一轮，请稍候或使用队列");
  }
  touchAgent(sid);
  const text = payload.text || "";
  const images = Array.isArray(payload.images) ? payload.images : [];
  const blocks = [];
  for (const img of images) {
    if (!img?.dataBase64) continue;
    blocks.push({
      type: "image",
      mimeType: img.mimeType || "image/png",
      data: img.dataBase64,
    });
  }
  if (text) blocks.push({ type: "text", text });
  if (!blocks.length) throw new Error("消息为空");

  const meta = entry?.meta || (sid === activeSessionId ? activeSessionMeta : null);
  if (entry) entry.busy = true;
  send("session:status", {
    state: "working",
    detail: "思考中…",
    session: meta,
    sessionId: sid,
  });
  try {
    await client.prompt(blocks);
    if (entry) entry.busy = false;
    send("session:status", {
      state: "ready",
      detail: "就绪",
      session: meta,
      sessionId: sid,
    });
    return { ok: true, sessionId: sid };
  } catch (err) {
    if (entry) entry.busy = false;
    send("session:status", {
      state: "error",
      detail: err.message || String(err),
      session: meta,
      sessionId: sid,
    });
    throw err;
  }
});

ipcMain.handle("session:cancel", async (_e, { sessionId } = {}) => {
  const sid = sessionId || activeSessionId;
  const entry = getAgentEntry(sid);
  getAgent(sid)?.cancel();
  // 停止后必须清 busy，否则插话/发送会被「仍在处理」卡住
  if (entry) entry.busy = false;
  const meta = entry?.meta || null;
  send("session:status", {
    state: "ready",
    detail: "已停止",
    session: meta,
    sessionId: sid,
  });
  return { ok: true, sessionId: sid };
});

// ── Dialogs / files ────────────────────────────────────

ipcMain.handle("dialog:pickDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:pickFiles", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
  });
  if (result.canceled) return [];
  const out = [];
  for (const p of result.filePaths) {
    let preview = "";
    let size = 0;
    try {
      const st = fs.statSync(p);
      size = st.size;
      if (st.size < 200_000) {
        const buf = fs.readFileSync(p);
        // only text-ish
        const sample = buf.slice(0, 4000).toString("utf8");
        if (!sample.includes("\u0000")) preview = sample;
      }
    } catch {
      /* ignore */
    }
    out.push({
      path: p,
      name: path.basename(p),
      size,
      preview,
    });
  }
  return out;
});

ipcMain.handle("permission:respond", async (_e, { id, optionId, sessionId } = {}) => {
  // Prefer hinted session, then active, then any agent that has this request pending
  let client = getAgent(sessionId || activeSessionId);
  if (!client) {
    for (const e of agents.values()) {
      if (e.client.pendingPermissions?.has?.(id)) {
        client = e.client;
        break;
      }
    }
  }
  if (!client) return { ok: false };
  const ok = client.respondPermission(id, optionId);
  return { ok };
});

ipcMain.handle("permission:setAutoApprove", async (_e, on) => {
  for (const e of agents.values()) {
    e.client.setAutoApprove(!!on);
  }
  try {
    settings.writeDesktopSettings({ autoApprove: !!on });
  } catch {
    /* ignore */
  }
  return { ok: true };
});

ipcMain.handle("dialog:pickImages", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
  });
  if (result.canceled) return [];
  const out = [];
  for (const p of result.filePaths) {
    const dataUrl = pathToDataUrl(p);
    if (!dataUrl) continue;
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    out.push({
      path: p,
      name: path.basename(p),
      mimeType: m?.[1] || "image/png",
      dataBase64: m?.[2] || "",
      dataUrl,
    });
  }
  return out;
});

ipcMain.handle("file:readImage", async (_e, filePath) => {
  const dataUrl = pathToDataUrl(filePath);
  if (!dataUrl) return null;
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return {
    path: filePath,
    name: path.basename(filePath),
    mimeType: m?.[1] || "image/png",
    dataBase64: m?.[2] || "",
    dataUrl,
  };
});

ipcMain.handle("shell:openPath", async (_e, p) => {
  if (p) return shell.openPath(p);
});

ipcMain.handle("shell:showItem", async (_e, p) => {
  if (p) shell.showItemInFolder(p);
});

// ── Settings / models ──────────────────────────────────

ipcMain.handle("settings:get", async () => {
  const all = settings.getAllSettings();
  const models = await settings.listModels();
  return { ...all, models };
});

ipcMain.handle("settings:saveDesktop", async (_e, partial) => {
  return settings.writeDesktopSettings(partial || {});
});

/** 内置壁纸绝对路径（打包后在 app 目录 assets/wallpapers） */
ipcMain.handle("wallpaper:list", async () => {
  const dir = path.join(__dirname, "assets", "wallpapers");
  const presets = [
    { id: "xmark", name: "X 标志", file: "wp-x-mark.jpg" },
    { id: "rocket", name: "火箭", file: "wp-rocket.jpg" },
    { id: "orbit", name: "轨道", file: "wp-orbit.jpg" },
    { id: "space", name: "SPACE", file: "wp-space-type.jpg" },
    { id: "stack", name: "多级箭体", file: "wp-stack.jpg" },
  ];
  return presets.map((p) => {
    const full = path.join(dir, p.file);
    const thumb = path.join(dir, p.file.replace(/\.jpg$/i, "-thumb.jpg"));
    return {
      id: p.id,
      name: p.name,
      path: fs.existsSync(full) ? full : null,
      thumbPath: fs.existsSync(thumb) ? thumb : fs.existsSync(full) ? full : null,
    };
  });
});

ipcMain.handle("settings:saveGrok", async (_e, partial) => {
  return settings.updateGrokConfig(partial || {});
});

// ── Plugins ────────────────────────────────────────────

ipcMain.handle("plugins:listInstalled", async () => plugins.listInstalled());
ipcMain.handle("plugins:listAvailable", async () => {
  const r = await plugins.listAvailable();
  return Array.isArray(r) ? r : r;
});
ipcMain.handle("plugins:install", async (_e, spec) => plugins.installPlugin(spec));
ipcMain.handle("plugins:uninstall", async (_e, name) => plugins.uninstallPlugin(name));
ipcMain.handle("plugins:enable", async (_e, name) => plugins.enablePlugin(name));
ipcMain.handle("plugins:disable", async (_e, name) => plugins.disablePlugin(name));
ipcMain.handle("plugins:details", async (_e, name) => plugins.pluginDetails(name));

// ── Skills ─────────────────────────────────────────────

ipcMain.handle("skills:list", async () => skills.listSkills());
ipcMain.handle("skills:read", async (_e, name) => skills.readSkill(name));
ipcMain.handle("skills:create", async (_e, payload) => skills.createSkill(payload || {}));
ipcMain.handle("skills:open", async (_e, skillPath) => {
  if (skillPath) return shell.openPath(skillPath);
});

// ── Memory ─────────────────────────────────────────────

ipcMain.handle("memory:list", async () => memory.listMemoryFiles());
ipcMain.handle("memory:read", async (_e, filePath) => memory.readMemoryFile(filePath));
ipcMain.handle("memory:write", async (_e, { path: filePath, content }) =>
  memory.writeMemoryFile(filePath, content),
);
ipcMain.handle("memory:append", async (_e, payload) => memory.appendNote(payload || {}));
ipcMain.handle("memory:setEnabled", async (_e, enabled) => memory.setEnabled(!!enabled));
ipcMain.handle("memory:clear", async () => memory.clearMemory());

ipcMain.handle("commands:list", async (_e, { sessionId } = {}) => {
  const { localizeAll } = require("./src/commands-zh");
  const client = getAgent(sessionId || activeSessionId);
  const raw = client?.availableCommands || [];
  return { commands: localizeAll(raw) };
});

ipcMain.handle("session:export", async (_e, { sessionId } = {}) => {
  const id = sessionId || activeSessionMeta?.id || activeSessionId || activeAgent()?.sessionId;
  if (!id) throw new Error("没有可导出的会话");
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "导出会话",
    defaultPath: `grok-session-${id.slice(0, 8)}.md`,
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  await new Promise((resolve, reject) => {
    const { spawn } = require("child_process");
    const child = spawn(resolveGrokCli(), ["export", id, result.filePath], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err.trim() || `export exit ${code}`)),
    );
    child.on("error", reject);
  });
  return { ok: true, path: result.filePath };
});

ipcMain.handle("session:run-slash", async (_e, { command, args, sessionId } = {}) => {
  const sid = sessionId || activeSessionId;
  const client = getAgent(sid);
  if (!client || !client.sessionId) throw new Error("请先打开会话");
  const cmd = String(command || "").replace(/^\//, "");
  if (!cmd) throw new Error("空命令");
  const text = args ? `/${cmd} ${args}` : `/${cmd}`;
  const meta = getAgentEntry(sid)?.meta || activeSessionMeta;
  send("session:status", {
    state: "working",
    detail: `/${cmd}…`,
    session: meta,
    sessionId: sid,
  });
  try {
    await client.prompt(text);
    send("session:status", {
      state: "ready",
      detail: "就绪",
      session: meta,
      sessionId: sid,
    });
    return { ok: true };
  } catch (err) {
    send("session:status", {
      state: "error",
      detail: err.message,
      session: meta,
      sessionId: sid,
    });
    throw err;
  }
});

ipcMain.handle("mcp:list", async () => mcp.listMcp());
ipcMain.handle("mcp:remove", async (_e, name) => mcp.removeMcp(name));
ipcMain.handle("mcp:doctor", async () => mcp.doctorMcp());
ipcMain.handle("mcp:add", async (_e, { name, command, args }) =>
  mcp.addMcp(name, command, args || []),
);

function extractModels(payload, client) {
  if (!payload) return null;
  const models = payload.models || payload;
  const available = models.availableModels || models.available || [];
  if (!available.length && !models.currentModelId) return null;
  return {
    currentModelId:
      models.currentModelId || client?.currentModelId || null,
    availableModels: available.map((m) => ({
      modelId: m.modelId || m.id,
      name: m.name || m.modelId || m.id,
      description: m.description || "",
      _meta: m._meta || null,
    })),
  };
}

ipcMain.handle("models:list", async (_e, { sessionId } = {}) => {
  const client = getAgent(sessionId || activeSessionId);
  // Prefer live session models; fall back to `grok models`
  if (client?.sessionId) {
    const fromCli = await settings.listModels();
    const live = client.lastModels?.availableModels;
    if (live?.length) {
      return {
        currentModelId:
          client.currentModelId || client.lastModels?.currentModelId || fromCli.defaultModel,
        availableModels: live.map((m) => ({
          modelId: m.modelId || m.id,
          name: m.name || m.modelId || m.id,
          description: m.description || "",
          _meta: m._meta || null,
        })),
      };
    }
    return {
      currentModelId: client.currentModelId || fromCli.defaultModel,
      availableModels: fromCli.models.map((m) => ({
        modelId: m.id,
        name: m.id,
        description: "",
      })),
    };
  }
  const fromCli = await settings.listModels();
  return {
    currentModelId: fromCli.defaultModel,
    availableModels: fromCli.models.map((m) => ({
      modelId: m.id,
      name: m.id,
      description: "",
    })),
  };
});

ipcMain.handle("models:set", async (_e, modelId, sessionId) => {
  // support both (modelId) and ({ modelId, sessionId })
  let mid = modelId;
  let sid = sessionId;
  if (modelId && typeof modelId === "object") {
    mid = modelId.modelId;
    sid = modelId.sessionId;
  }
  const client = getAgent(sid || activeSessionId);
  if (!client || !client.sessionId) throw new Error("请先打开一个会话");
  if (!mid) throw new Error("缺少 modelId");
  const res = await client.setModel(mid);
  // persist default for next sessions
  try {
    settings.updateGrokConfig({ defaultModel: mid });
  } catch {
    /* ignore */
  }
  send("session:model", { modelId: mid, sessionId: client.sessionId });
  return { ok: true, modelId: mid, result: res };
});

ipcMain.handle("app:info", async () => ({
  grokHome: grokHome(),
  grokCli: resolveGrokCli(),
  version: app.getVersion(),
  desktopVersion: "0.6.0",
  memoryEnabled: memory.isEnabledInConfig(),
  openAgents: agents.size,
}));
