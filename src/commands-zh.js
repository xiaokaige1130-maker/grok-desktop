/**
 * Full CLI slash-command catalog (from Grok docs) + ACP dynamic skills.
 * All of these are real when sent as `/name …` prompts to the agent.
 * Desktop-only routes are marked desktop:true and handled in the UI.
 *
 * Pure helpers (filter / group / desktop route) are exported for tests.
 */

/** Display groups for the slash palette (scan order). */
const GROUP_ORDER = [
  "session",
  "model",
  "memory",
  "extensions",
  "media",
  "agent",
  "system",
  "skill",
];

const GROUP_META = {
  session: { titleZh: "会话", titleEn: "Session" },
  model: { titleZh: "模型 / 模式", titleEn: "Model & mode" },
  memory: { titleZh: "记忆", titleEn: "Memory" },
  extensions: { titleZh: "扩展", titleEn: "Extensions" },
  media: { titleZh: "媒体", titleEn: "Media" },
  agent: { titleZh: "代理", titleEn: "Agent" },
  system: { titleZh: "系统", titleEn: "System" },
  skill: { titleZh: "Skills", titleEn: "Skills" },
};

/**
 * Pure UI routes handled by the desktop shell (never sent as fake agent prompts).
 * Values are stable action ids for applySlash / tests.
 */
const DESKTOP_UI_ROUTES = {
  settings: "open-settings",
  desktop: "open-settings",
  skills: "open-skills",
  plugins: "open-plugins",
  marketplace: "open-plugins",
  mcps: "open-mcp",
  memory: "open-memory",
  new: "new-session",
  clear: "new-session",
  home: "home",
  welcome: "home",
  rename: "rename",
  title: "rename",
  export: "export",
  copy: "copy-last",
};

const BUILTIN = [
  // Session
  { name: "new", title: "新对话", desc: "清空并开始新会话", desktop: true, group: "session" },
  { name: "clear", title: "清空会话", desc: "等同新对话", desktop: true, group: "session" },
  { name: "compact", title: "压缩上下文", desc: "压缩历史以节省上下文", hint: "可选：保留什么", group: "session" },
  { name: "context", title: "上下文用量", desc: "上下文窗口与会话统计", group: "session" },
  { name: "session-info", title: "会话信息", desc: "模型、轮次、上下文用量", group: "session" },
  { name: "fork", title: "分叉会话", desc: "从当前位置复制新会话", group: "session" },
  { name: "rewind", title: "回退", desc: "回到更早一轮", group: "session" },
  { name: "copy", title: "复制回复", desc: "复制最近助手回复", desktop: true, group: "session" },
  { name: "export", title: "导出会话", desc: "导出 Markdown 到文件", desktop: true, group: "session" },
  { name: "rename", title: "重命名", desc: "修改会话标题", desktop: true, group: "session" },
  { name: "home", title: "主页", desc: "回到欢迎页", desktop: true, group: "session" },

  // Model / mode
  { name: "model", title: "切换模型", desc: "更换模型", hint: "模型名", group: "model" },
  { name: "effort", title: "推理强度", desc: "low / medium / high / xhigh", hint: "high|medium|low", group: "model" },
  { name: "always-approve", title: "始终批准", desc: "跳过权限确认", hint: "on|off", group: "model" },
  { name: "auto", title: "自动权限", desc: "安全操作自动批准", group: "model" },
  { name: "plan", title: "计划模式", desc: "进入 Plan 模式", hint: "可选说明", group: "model" },
  { name: "view-plan", title: "查看计划", desc: "打开当前计划", group: "model" },

  // Memory
  { name: "memory", title: "记忆", desc: "浏览/开关记忆", desktop: true, group: "memory" },
  { name: "flush", title: "立即写入记忆", desc: "保存当前会话要点", group: "memory" },
  { name: "dream", title: "整理记忆", desc: "合并会话日志", group: "memory" },
  { name: "remember", title: "记住一条", desc: "立刻保存笔记", hint: "笔记内容", group: "memory" },

  // Extensions
  { name: "hooks", title: "Hooks", desc: "生命周期钩子", group: "extensions" },
  { name: "plugins", title: "插件", desc: "插件管理", desktop: true, group: "extensions" },
  { name: "marketplace", title: "插件市场", desc: "浏览安装插件", desktop: true, group: "extensions" },
  { name: "skills", title: "Skills", desc: "Skills 列表", desktop: true, group: "extensions" },
  { name: "mcps", title: "MCP 服务器", desc: "MCP 配置", desktop: true, group: "extensions" },

  // Media
  { name: "imagine", title: "生成图片", desc: "文生图", hint: "描述", group: "media" },
  { name: "imagine-video", title: "生成视频", desc: "文生视频", hint: "描述", group: "media" },

  // Agent
  { name: "goal", title: "目标模式", desc: "设置/查看/暂停自主目标", hint: "目标 或 status", group: "agent" },
  { name: "loop", title: "循环任务", desc: "按间隔重复执行", hint: "[间隔] 提示词", group: "agent" },
  { name: "feedback", title: "反馈", desc: "发送会话反馈", hint: "反馈文字", group: "agent" },
  { name: "btw", title: "旁问", desc: "不打断主任务的追问", hint: "问题", group: "agent" },

  // Account / system
  { name: "usage", title: "额度用量", desc: "查看额度与账单", group: "system" },
  { name: "login", title: "登录", desc: "登录 Grok", group: "system" },
  { name: "logout", title: "登出", desc: "退出登录", group: "system" },
  { name: "settings", title: "设置", desc: "打开设置", desktop: true, group: "system" },
  { name: "status", title: "当前状态", desc: "连接与会话状态", desktop: true, group: "system" },
  { name: "docs", title: "文档", desc: "打开文档", group: "system" },
  { name: "release-notes", title: "更新说明", desc: "查看版本说明", group: "system" },
  { name: "help", title: "帮助", desc: "帮助与配置说明", group: "system" },
  { name: "privacy", title: "隐私", desc: "隐私相关设置", group: "system" },
  { name: "config-agents", title: "配置 Agents", desc: "Agent 配置", group: "system" },
  { name: "personas", title: "人设", desc: "Persona 管理", group: "system" },
];

const ZH_EXTRA = {
  // keep map for ACP-only names
};

function groupOf(cmd) {
  if (cmd?.isSkill) return "skill";
  if (cmd?.group && GROUP_META[cmd.group]) return cmd.group;
  const fromBuiltin = BUILTIN.find((b) => b.name === (cmd?.name || ""));
  if (fromBuiltin?.group) return fromBuiltin.group;
  return "system";
}

function localizeCommand(cmd) {
  const name = cmd.name || "";
  const fromBuiltin = BUILTIN.find((b) => b.name === name);
  const isSkill = !!(cmd._meta && (cmd._meta.path || cmd._meta.scope));
  const titleZh =
    fromBuiltin?.title ||
    ZH_EXTRA[name]?.title ||
    (isSkill ? `Skill · ${name}` : `/${name}`);
  const descZh =
    fromBuiltin?.desc ||
    ZH_EXTRA[name]?.desc ||
    cmd.description ||
    "";
  const group = isSkill ? "skill" : fromBuiltin?.group || groupOf(cmd) || "system";
  const desktop = !!fromBuiltin?.desktop && !isSkill;
  return {
    name,
    description: cmd.description || fromBuiltin?.desc || "",
    input: cmd.input || (fromBuiltin?.hint ? { hint: fromBuiltin.hint } : null),
    _meta: cmd._meta || null,
    isSkill,
    desktop,
    group,
    titleZh,
    descZh,
  };
}

/**
 * Merge static CLI catalog + live ACP list (skills + runtime builtins).
 * ACP entries win on description; static fills missing builtins.
 * Sorted by group order, then name.
 */
function mergeCommandLists(acpCommands = []) {
  const map = new Map();
  for (const b of BUILTIN) {
    map.set(b.name, localizeCommand({ name: b.name, description: b.desc, input: b.hint ? { hint: b.hint } : null }));
  }
  for (const c of acpCommands || []) {
    if (!c?.name) continue;
    const loc = localizeCommand(c);
    const prev = map.get(c.name);
    if (prev) {
      map.set(c.name, {
        ...prev,
        ...loc,
        titleZh: prev.titleZh && !loc.isSkill ? prev.titleZh : loc.titleZh,
        descZh: loc.descZh || prev.descZh,
        isSkill: loc.isSkill || prev.isSkill,
        desktop: loc.isSkill ? false : prev.desktop,
        group: loc.isSkill ? "skill" : prev.group || loc.group,
        _meta: loc._meta || prev._meta,
        input: loc.input || prev.input,
      });
    } else {
      map.set(c.name, loc);
    }
  }
  return [...map.values()].sort(compareCommands);
}

function compareCommands(a, b) {
  const ga = GROUP_ORDER.indexOf(groupOf(a));
  const gb = GROUP_ORDER.indexOf(groupOf(b));
  const ia = ga < 0 ? 99 : ga;
  const ib = gb < 0 ? 99 : gb;
  if (ia !== ib) return ia - ib;
  if (a.isSkill !== b.isSkill) return a.isSkill ? 1 : -1;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function localizeAll(commands) {
  return mergeCommandLists(commands);
}

/**
 * IPC boundary helper used by main.js (session:activate / session:open /
 * commands:list / commands:update). Same path the renderer must receive.
 */
function commandsForRenderer(raw) {
  return localizeAll(raw || []);
}

/** Whether name is a pure desktop UI route (no agent prompt for the slash name itself). */
function isDesktopUiRoute(name, isSkill = false) {
  if (isSkill) return false;
  return Object.prototype.hasOwnProperty.call(DESKTOP_UI_ROUTES, name);
}

/** Resolve stable action id for desktop UI route, or null. */
function resolveDesktopRoute(name, isSkill = false) {
  if (isSkill) return null;
  return DESKTOP_UI_ROUTES[name] || null;
}

/**
 * Filter slash commands by query (without leading slash).
 * Merges optional extra locals (e.g. desktop-only status if missing).
 */
function filterSlashCommands(commands = [], query = "", { limit = 40, extras = [] } = {}) {
  const q = String(query || "")
    .toLowerCase()
    .replace(/^\//, "");
  const map = new Map();
  for (const c of commands || []) {
    if (c?.name) map.set(c.name, c);
  }
  for (const e of extras || []) {
    if (e?.name && !map.has(e.name)) map.set(e.name, e);
  }
  let list = [...map.values()].sort(compareCommands);
  if (q) {
    list = list.filter((c) => {
      const hay = `${c.name} ${c.titleZh || ""} ${c.descZh || ""} ${c.description || ""} ${c.group || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return list.slice(0, limit);
}

/**
 * Group a flat command list for palette rendering.
 * Returns [{ group, titleZh, titleEn, items }] in GROUP_ORDER.
 */
function groupSlashCommands(commands = []) {
  const buckets = new Map();
  for (const g of GROUP_ORDER) buckets.set(g, []);
  for (const c of commands || []) {
    const g = groupOf(c);
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g).push(c);
  }
  const out = [];
  for (const g of GROUP_ORDER) {
    const items = buckets.get(g) || [];
    if (!items.length) continue;
    const meta = GROUP_META[g] || { titleZh: g, titleEn: g };
    out.push({
      group: g,
      titleZh: meta.titleZh,
      titleEn: meta.titleEn,
      items,
    });
  }
  // any unknown groups
  for (const [g, items] of buckets) {
    if (GROUP_ORDER.includes(g) || !items.length) continue;
    out.push({ group: g, titleZh: g, titleEn: g, items });
  }
  return out;
}

module.exports = {
  BUILTIN,
  GROUP_ORDER,
  GROUP_META,
  DESKTOP_UI_ROUTES,
  localizeCommand,
  localizeAll,
  commandsForRenderer,
  mergeCommandLists,
  isDesktopUiRoute,
  resolveDesktopRoute,
  filterSlashCommands,
  groupSlashCommands,
  groupOf,
  compareCommands,
};
