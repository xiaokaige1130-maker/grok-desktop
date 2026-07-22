const fs = require("fs");
const path = require("path");
const { grokHome } = require("./sessions");
const { appConfigDir, spawnCli } = require("./platform");
const { resolveGrokCli } = require("./plugins");

const DESKTOP_SETTINGS = path.join(appConfigDir(), "settings.json");

const DEFAULT_DESKTOP = {
  showThinking: true,
  density: "comfortable", // comfortable | compact
  enterToSend: true,
  /** dark | light | system */
  theme: "dark",
  autoApprove: true, // product default: skip permission prompts
  /** Session ids that were open as tabs last time */
  openTabs: [],
  /** Last focused session id */
  lastActiveId: null,
  /** 聊天背景：none | aurora | ember | ocean | mist | custom */
  wallpaper: "none",
  /** 自定义壁纸绝对路径 */
  wallpaperPath: null,
  /** 背景压暗 0–80 */
  wallpaperDim: 45,
  /** 后台会话完成时系统通知 */
  notifyOnDone: true,
  /**
   * 关闭窗口时最小化到系统托盘（不退出）
   * Windows/Linux 默认 true；macOS 默认 false（更贴近 Dock 习惯）
   */
  closeToTray: process.platform !== "darwin",
  /** 最小化时也进托盘（Windows 常见习惯，默认关避免吓人） */
  minimizeToTray: false,
  /** 开机自启（由主进程同步到 OS login item） */
  openAtLogin: false,
  /** 已展示过「关闭进入托盘」提示 */
  trayHintShown: false,
  /** 启动时检查 GitHub 更新 */
  checkUpdates: true,
  /** 是否已完成首次环境引导 */
  setupDismissed: false,
  /** 界面语言 zh | en */
  locale: "zh",
  /**
   * 访问模式（产品化权限）
   * safe = 审批 · balanced = 智能 · full = 完全访问
   */
  accessMode: "full",
  /** 本地归档的会话 id（不删 CLI 数据，仅桌面端分组） */
  archivedSessionIds: [],
  /** 置顶会话 id */
  pinnedSessionIds: [],
  /** 窗口几何：{ x, y, width, height } */
  windowBounds: null,
  /** 上次是否最大化 */
  windowMaximized: false,
};

function configPath() {
  return path.join(grokHome(), "config.toml");
}

function readDesktopSettings() {
  try {
    if (fs.existsSync(DESKTOP_SETTINGS)) {
      return { ...DEFAULT_DESKTOP, ...JSON.parse(fs.readFileSync(DESKTOP_SETTINGS, "utf8")) };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_DESKTOP };
}

function writeDesktopSettings(partial) {
  const next = { ...readDesktopSettings(), ...partial };
  fs.mkdirSync(path.dirname(DESKTOP_SETTINGS), { recursive: true });
  fs.writeFileSync(DESKTOP_SETTINGS, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Minimal TOML get for flat keys under [section] */
function readTomlValue(text, section, key) {
  const re = new RegExp(
    `\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][\\s\\S]*?(?=\\n\\[|$)`,
  );
  const m = text.match(re);
  if (!m) return null;
  const block = m[0];
  const line = block.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, "m"));
  if (!line) return null;
  let v = line[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function upsertTomlValue(text, section, key, value) {
  let body = text || "";
  const sectionRe = new RegExp(
    `(\\[${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\][^\\[]*)`,
  );
  const rendered =
    typeof value === "boolean"
      ? String(value)
      : typeof value === "number"
        ? String(value)
        : `"${String(value).replace(/"/g, '\\"')}"`;

  if (!sectionRe.test(body)) {
    body = body.trimEnd() + `\n\n[${section}]\n${key} = ${rendered}\n`;
    return body;
  }

  body = body.replace(sectionRe, (block) => {
    const keyRe = new RegExp(`^(\\s*${key}\\s*=\\s*).+$`, "m");
    if (keyRe.test(block)) {
      return block.replace(keyRe, `$1${rendered}`);
    }
    // insert after section header line
    return block.replace(/(\[[^\]]+\]\n)/, `$1${key} = ${rendered}\n`);
  });
  return body;
}

function readGrokConfigSummary() {
  const file = configPath();
  let text = "";
  try {
    text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  } catch {
    text = "";
  }
  return {
    path: file,
    raw: text,
    permissionMode: readTomlValue(text, "ui", "permission_mode") || "default",
    yolo: readTomlValue(text, "ui", "yolo") === true,
    compactMode: readTomlValue(text, "ui", "compact_mode") === true,
    defaultModel: readTomlValue(text, "models", "default") || null,
    autoUpdate: readTomlValue(text, "cli", "auto_update"),
  };
}

function updateGrokConfig(patch = {}) {
  const file = configPath();
  let text = "";
  try {
    text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  } catch {
    text = "";
  }

  if (patch.permissionMode != null) {
    text = upsertTomlValue(text, "ui", "permission_mode", patch.permissionMode);
  }
  if (patch.yolo != null) {
    text = upsertTomlValue(text, "ui", "yolo", !!patch.yolo);
  }
  if (patch.compactMode != null) {
    text = upsertTomlValue(text, "ui", "compact_mode", !!patch.compactMode);
  }
  if (patch.defaultModel != null && patch.defaultModel !== "") {
    text = upsertTomlValue(text, "models", "default", patch.defaultModel);
  }
  if (patch.autoUpdate != null) {
    text = upsertTomlValue(text, "cli", "auto_update", !!patch.autoUpdate);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith("\n") ? text : text + "\n", "utf8");
  return readGrokConfigSummary();
}

function listModels() {
  return new Promise((resolve) => {
    const cli = resolveGrokCli();
    const child = spawnCli(cli, ["models"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.on("close", () => {
      const models = [];
      let defaultModel = null;
      for (const line of out.split("\n")) {
        const def = line.match(/Default model:\s*(\S+)/i);
        if (def) defaultModel = def[1];
        const m = line.match(/^\s*[\*\-]\s+(\S+)/);
        if (m) models.push({ id: m[1], isDefault: /\*/.test(line) || m[1] === defaultModel });
      }
      resolve({ models, defaultModel, raw: out });
    });
    child.on("error", () => resolve({ models: [], defaultModel: null, raw: "" }));
  });
}

function getAllSettings() {
  return {
    desktop: readDesktopSettings(),
    grok: readGrokConfigSummary(),
    grokHome: grokHome(),
    desktopSettingsPath: DESKTOP_SETTINGS,
  };
}

module.exports = {
  DESKTOP_SETTINGS,
  readDesktopSettings,
  writeDesktopSettings,
  readGrokConfigSummary,
  updateGrokConfig,
  listModels,
  getAllSettings,
  configPath,
};
