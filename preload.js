const { contextBridge, ipcRenderer } = require("electron");

function on(channel, cb) {
  const handler = (_e, data) => cb(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("grokDesktop", {
  // host platform (sync) — used for macOS titlebar drag / traffic-light padding
  platform: process.platform,

  // sessions
  listSessions: (opts) => ipcRenderer.invoke("sessions:list", opts || {}),
  loadHistory: (sessionId) => ipcRenderer.invoke("sessions:history", { sessionId }),
  openSession: (sessionId, opts) =>
    ipcRenderer.invoke("session:open", { sessionId, ...(opts || {}) }),
  activateSession: (sessionId) => ipcRenderer.invoke("session:activate", { sessionId }),
  newSession: (cwd) => ipcRenderer.invoke("session:new", { cwd }),
  renameSession: (sessionId, title) =>
    ipcRenderer.invoke("sessions:rename", { sessionId, title }),
  deleteSession: (sessionId) => ipcRenderer.invoke("sessions:delete", { sessionId }),
  sessionPath: (sessionId) => ipcRenderer.invoke("sessions:path", { sessionId }),
  searchSessions: (query, limit) =>
    ipcRenderer.invoke("sessions:searchContent", { query, limit }),
  prompt: (payload) => ipcRenderer.invoke("session:prompt", payload),
  cancel: (sessionId) => ipcRenderer.invoke("session:cancel", { sessionId }),

  // multi-agent
  listAgents: () => ipcRenderer.invoke("agents:list"),
  closeAgent: (sessionId) => ipcRenderer.invoke("agents:close", { sessionId }),

  // memory
  listMemory: () => ipcRenderer.invoke("memory:list"),
  readMemory: (p) => ipcRenderer.invoke("memory:read", p),
  writeMemory: (path, content) => ipcRenderer.invoke("memory:write", { path, content }),
  appendMemory: (payload) => ipcRenderer.invoke("memory:append", payload),
  setMemoryEnabled: (enabled) => ipcRenderer.invoke("memory:setEnabled", enabled),
  clearMemory: () => ipcRenderer.invoke("memory:clear"),

  // files
  pickDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"),
  pickImages: () => ipcRenderer.invoke("dialog:pickImages"),
  pickFiles: () => ipcRenderer.invoke("dialog:pickFiles"),
  readImage: (p) => ipcRenderer.invoke("file:readImage", p),
  respondPermission: (id, optionId, sessionId) =>
    ipcRenderer.invoke("permission:respond", { id, optionId, sessionId }),
  setAutoApprove: (on) => ipcRenderer.invoke("permission:setAutoApprove", on),
  openPath: (p) => ipcRenderer.invoke("shell:openPath", p),
  showItem: (p) => ipcRenderer.invoke("shell:showItem", p),

  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveDesktopSettings: (p) => ipcRenderer.invoke("settings:saveDesktop", p),
  saveGrokSettings: (p) => ipcRenderer.invoke("settings:saveGrok", p),
  listWallpapers: () => ipcRenderer.invoke("wallpaper:list"),

  // plugins
  listInstalledPlugins: () => ipcRenderer.invoke("plugins:listInstalled"),
  listAvailablePlugins: () => ipcRenderer.invoke("plugins:listAvailable"),
  installPlugin: (spec) => ipcRenderer.invoke("plugins:install", spec),
  uninstallPlugin: (name) => ipcRenderer.invoke("plugins:uninstall", name),
  enablePlugin: (name) => ipcRenderer.invoke("plugins:enable", name),
  disablePlugin: (name) => ipcRenderer.invoke("plugins:disable", name),
  pluginDetails: (name) => ipcRenderer.invoke("plugins:details", name),

  // skills
  listSkills: () => ipcRenderer.invoke("skills:list"),
  readSkill: (name) => ipcRenderer.invoke("skills:read", name),
  createSkill: (payload) => ipcRenderer.invoke("skills:create", payload),
  openSkill: (p) => ipcRenderer.invoke("skills:open", p),

  appInfo: () => ipcRenderer.invoke("app:info"),
  diagnose: () => ipcRenderer.invoke("app:diagnose"),
  checkUpdate: () => ipcRenderer.invoke("app:checkUpdate"),
  notify: (payload) => ipcRenderer.invoke("app:notify", payload || {}),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
  listCommands: (sessionId) => ipcRenderer.invoke("commands:list", { sessionId }),
  listModels: (sessionId) => ipcRenderer.invoke("models:list", { sessionId }),
  setModel: (modelId, sessionId) => ipcRenderer.invoke("models:set", modelId, sessionId),
  exportSession: (sessionId) => ipcRenderer.invoke("session:export", { sessionId }),
  runSlash: (command, args, sessionId) =>
    ipcRenderer.invoke("session:run-slash", { command, args, sessionId }),
  listMcp: () => ipcRenderer.invoke("mcp:list"),
  removeMcp: (name) => ipcRenderer.invoke("mcp:remove", name),
  doctorMcp: () => ipcRenderer.invoke("mcp:doctor"),
  addMcp: (payload) => ipcRenderer.invoke("mcp:add", payload),

  onChunk: (cb) => on("chat:chunk", cb),
  onTool: (cb) => on("chat:tool", cb),
  onDiff: (cb) => on("chat:diff", cb),
  onMedia: (cb) => on("chat:media", cb),
  onPermission: (cb) => on("chat:permission", cb),
  onStatus: (cb) => on("session:status", cb),
  onPlan: (cb) => on("session:plan", cb),
  onAgents: (cb) => on("agents:update", cb),
  onLog: (cb) => on("log", cb),
  onInsertText: (cb) => on("chat:insert-text", cb),
  onPasteRequest: (cb) => on("chat:paste-request", cb),
  onCommands: (cb) => on("commands:update", cb),
  onMode: (cb) => on("session:mode", cb),
  onModels: (cb) => on("session:models", cb),
  onModel: (cb) => on("session:model", cb),
});
