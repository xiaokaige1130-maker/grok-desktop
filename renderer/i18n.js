/**
 * Lightweight i18n for Grok Desktop (zh / en).
 * Usage: t("key"), applyI18n(root), setLocale("en")
 */
(function (global) {
  const STRINGS = {
    zh: {
      "app.name": "Grok Desktop",
      "nav.chat": "对话",
      "nav.memory": "记忆",
      "nav.skills": "Skills",
      "nav.plugins": "插件",
      "nav.settings": "设置",
      "nav.newChat": "新对话",
      "nav.recent": "最近会话",
      "nav.searchPh": "搜索标题 / 全文…",
      "nav.refresh": "刷新列表",

      "chat.welcomeTitle": "欢迎使用 Grok Desktop",
      "chat.welcomeSub": "选择左侧会话继续，或开始新对话",
      "chat.export": "导出",
      "chat.rename": "重命名",
      "chat.delete": "删除",
      "chat.plan": "计划",
      "chat.planTitle": "执行计划",
      "chat.planEmpty": "尚无计划条目。助手进入计划模式后会出现在这里。",
      "chat.planHint": "打开 / 关闭右侧计划面板",
      "chat.planClose": "关闭计划面板",
      "chat.ready": "就绪",
      "chat.send": "发送 ↑",
      "chat.stop": "停止",
      "chat.effort": "强度",
      "chat.model": "模型",
      "chat.inputPh": "消息 · 拖入图片 · / 命令 · @ 文件… Enter 发送",
      "chat.noCwd": "未选择工作目录",
      "chat.attachFile": "附加文件 @",

      "welcome.h2": "开始构建",
      "welcome.p":
        "Grok Desktop 是 Grok Build 的独立窗口。支持多会话并行、文件 diff 预览、全文搜索与计划面板。",
      "welcome.s1t": "选一个最近会话",
      "welcome.s1d": "左侧按项目分组，点一下即可恢复；可同时开多个会话并行跑",
      "welcome.s2t": "或开新对话",
      "welcome.s2d": "选择工作目录后开始；写文件时显示 diff 卡片",
      "welcome.s3t": "计划与插话",
      "welcome.s3d": "顶栏「计划」查看任务清单；任务中 Enter 排队，点「引导」打断纠正",
      "welcome.new": "＋ 新对话",
      "welcome.memory": "查看记忆",

      "status.idle": "就绪",
      "status.ready": "已完成",
      "status.working": "运行中",
      "status.error": "出错",
      "status.disconnected": "已断开",

      "perm.needApprove": "需要批准",
      "perm.toolDefault": "工具权限",
      "perm.selected": "已选择：",
      "perm.fail": "权限响应失败：",
      "perm.allowOnce": "允许一次",
      "perm.reject": "拒绝",

      "access.safe": "审批模式",
      "access.safeDesc": "写文件、跑命令前需要你确认。最安全，适合陌生仓库。",
      "access.balanced": "智能模式",
      "access.balancedDesc": "常规工具自动放行，高风险操作仍会提示。推荐日常使用。",
      "access.full": "完全访问",
      "access.fullDesc": "工具默认自动批准，效率最高。仅建议在可信本机项目使用。",
      "access.yolo": "YOLO 全自动",
      "access.yoloDesc": "更激进的自动执行（有风险，仅限完全信任的环境）",
      "access.badge.safe": "审批",
      "access.badge.balanced": "智能",
      "access.badge.full": "完全访问",

      "settings.back": "← 返回应用",
      "settings.searchPh": "搜索设置…",
      "settings.group.personal": "个人",
      "settings.group.security": "权限与安全",
      "settings.group.integrations": "集成",
      "settings.group.about": "关于",
      "settings.general": "常规",
      "settings.generalLead": "语言、输入、通知与更新",
      "settings.appearance": "外观",
      "settings.appearanceLead": "界面密度、聊天背景",
      "settings.model": "模型",
      "settings.modelLead": "默认模型（也可在对话输入框旁随时切换）",
      "settings.memory": "记忆",
      "settings.memoryLead": "跨会话记住项目约定与偏好",
      "settings.permissions": "权限",
      "settings.permissionsLead": "控制助手访问本机文件与命令的方式",
      "settings.skills": "Skills",
      "settings.plugins": "插件",
      "settings.mcp": "MCP 服务器",
      "settings.about": "环境",
      "settings.aboutLead": "本机路径、CLI 与更新",
      "settings.save": "保存更改",
      "settings.saved": "已保存",
      "settings.saving": "保存中…",
      "settings.language": "界面语言",
      "settings.languageDesc": "中文 / English，立即生效",
      "settings.enterSend": "Enter 发送消息",
      "settings.enterSendDesc": "空闲时发送；任务进行中为排队。Shift+Enter 始终换行",
      "settings.showThinking": "显示思考过程",
      "settings.showThinkingDesc": "在对话中展示模型的思考片段",
      "settings.notifyDone": "完成后通知",
      "settings.notifyDoneDesc": "后台会话跑完时弹出系统通知（当前会话不打扰）",
      "settings.checkUpdates": "启动时检查更新",
      "settings.checkUpdatesDesc": "向 GitHub 查询是否有新版本（仅提示，不自动安装）",
      "settings.shortcuts": "常用快捷键",
      "settings.density": "界面密度",
      "settings.densityDesc": "紧凑模式减少间距，一屏显示更多内容",
      "settings.density.comfortable": "舒适",
      "settings.density.compact": "紧凑",
      "settings.wallpaper": "聊天背景",
      "settings.wallpaperDesc": "只作用于中间对话区，可随时换",
      "settings.wallpaperDim": "背景压暗",
      "settings.wallpaperDimDesc": "越大字越清晰",
      "settings.wallpaperCustom": "自选图片",
      "settings.wallpaperPick": "选择图片",
      "settings.defaultModel": "默认模型",
      "settings.defaultModelDesc": "新会话默认使用的模型",
      "settings.memoryEnable": "启用跨会话记忆",
      "settings.memoryEnableDesc": "开启后新连接的 agent 会读取 ~/.grok/memory",
      "settings.openMemory": "打开记忆管理 →",
      "settings.accessMode": "访问模式",
      "settings.accessModeDesc": "一键切换审批强度，更像可上线产品的安全策略",
      "settings.checkUpdate": "检查更新",
      "settings.checkUpdateDesc": "查询 GitHub 最新 Release",
      "settings.diagnose": "重新检测环境",
      "settings.diagnoseDesc": "CLI 是否安装、是否已登录",
      "settings.usage": "额度 / 账单",
      "settings.usageDesc": "执行真实 /usage，查看额度与用量",
      "settings.context": "上下文用量",
      "settings.contextDesc": "执行 /context，查看窗口占用与统计",
      "settings.compact": "压缩上下文",
      "settings.compactDesc": "执行 /compact，压缩历史以节省上下文",
      "settings.sessionInfo": "会话信息",
      "settings.sessionInfoDesc": "执行 /session-info（模型、轮次等）",

      "setup.title": "欢迎使用 Grok 桌面版",
      "setup.lead": "使用前请确认本机官方 CLI 与登录状态",
      "setup.recheck": "重新检测",
      "setup.cliDoc": "CLI 安装说明",
      "setup.continue": "进入应用",

      "notify.doneTitle": "会话已完成",
      "notify.doneBody": "「{title}」已结束，可在左侧查看",

      "update.found": "发现新版本 {latest}（当前 {current}）",
      "update.latest": "已是最新（{current}）",
      "update.checking": "检查中…",
      "update.fail": "检查失败：{error}",
      "update.view": "查看",
      "update.dismiss": "关闭",

      "sc.enter": "发送 / 任务中排队",
      "sc.shiftEnter": "换行",
      "sc.guide": "打断并立刻发送纠正",
      "sc.n": "新对话（焦点不在输入框时）",
      "sc.tab": "切换已打开会话",
      "sc.slash": "斜杠命令",
      "sc.plan": "打开 / 关闭计划面板",
    },
    en: {
      "app.name": "Grok Desktop",
      "nav.chat": "Chat",
      "nav.memory": "Memory",
      "nav.skills": "Skills",
      "nav.plugins": "Plugins",
      "nav.settings": "Settings",
      "nav.newChat": "New chat",
      "nav.recent": "Recent",
      "nav.searchPh": "Search title / content…",
      "nav.refresh": "Refresh list",

      "chat.welcomeTitle": "Welcome to Grok Desktop",
      "chat.welcomeSub": "Pick a session on the left, or start a new chat",
      "chat.export": "Export",
      "chat.rename": "Rename",
      "chat.delete": "Delete",
      "chat.plan": "Plan",
      "chat.planTitle": "Execution plan",
      "chat.planEmpty": "No plan items yet. They appear when the agent enters plan mode.",
      "chat.planHint": "Toggle the plan panel",
      "chat.planClose": "Close plan panel",
      "chat.ready": "Ready",
      "chat.send": "Send ↑",
      "chat.stop": "Stop",
      "chat.effort": "Effort",
      "chat.model": "Model",
      "chat.inputPh": "Message · drop images · / commands · @ files… Enter to send",
      "chat.noCwd": "No workspace selected",
      "chat.attachFile": "Attach file @",

      "welcome.h2": "Start building",
      "welcome.p":
        "Grok Desktop is a standalone window for Grok Build. Multi-session, file diffs, full-text search, and a plan panel.",
      "welcome.s1t": "Open a recent session",
      "welcome.s1d": "Grouped by project on the left; resume with one click; run many in parallel",
      "welcome.s2t": "Or start a new chat",
      "welcome.s2d": "Pick a workspace folder; file edits show as diff cards",
      "welcome.s3t": "Plan & steer",
      "welcome.s3d": "Use top-bar Plan for the checklist; while busy, Enter queues, Guide interrupts",
      "welcome.new": "＋ New chat",
      "welcome.memory": "Memory",

      "status.idle": "Ready",
      "status.ready": "Done",
      "status.working": "Working",
      "status.error": "Error",
      "status.disconnected": "Disconnected",

      "perm.needApprove": "Approval required",
      "perm.toolDefault": "Tool permission",
      "perm.selected": "Selected: ",
      "perm.fail": "Permission response failed: ",
      "perm.allowOnce": "Allow once",
      "perm.reject": "Reject",

      "access.safe": "Approval mode",
      "access.safeDesc": "Confirm before writes and shell commands. Safest for unfamiliar repos.",
      "access.balanced": "Smart mode",
      "access.balancedDesc": "Auto-allow routine tools; still prompt on higher-risk actions. Recommended.",
      "access.full": "Full access",
      "access.fullDesc": "Tools auto-approved by default. Fastest — only on trusted local projects.",
      "access.yolo": "YOLO auto-run",
      "access.yoloDesc": "More aggressive auto-execution (risky; trusted environments only)",
      "access.badge.safe": "Approval",
      "access.badge.balanced": "Smart",
      "access.badge.full": "Full access",

      "settings.back": "← Back to app",
      "settings.searchPh": "Search settings…",
      "settings.group.personal": "Personal",
      "settings.group.security": "Security",
      "settings.group.integrations": "Integrations",
      "settings.group.about": "About",
      "settings.general": "General",
      "settings.generalLead": "Language, input, notifications, updates",
      "settings.appearance": "Appearance",
      "settings.appearanceLead": "Density and chat wallpaper",
      "settings.model": "Model",
      "settings.modelLead": "Default model (also switchable next to the composer)",
      "settings.memory": "Memory",
      "settings.memoryLead": "Remember project preferences across sessions",
      "settings.permissions": "Permissions",
      "settings.permissionsLead": "How the agent may access files and run commands",
      "settings.skills": "Skills",
      "settings.plugins": "Plugins",
      "settings.mcp": "MCP servers",
      "settings.about": "Environment",
      "settings.aboutLead": "Paths, CLI, and updates",
      "settings.save": "Save changes",
      "settings.saved": "Saved",
      "settings.saving": "Saving…",
      "settings.language": "Language",
      "settings.languageDesc": "Chinese / English — applies immediately",
      "settings.enterSend": "Enter to send",
      "settings.enterSendDesc": "Sends when idle; queues while working. Shift+Enter for newline",
      "settings.showThinking": "Show thinking",
      "settings.showThinkingDesc": "Display model reasoning snippets in the thread",
      "settings.notifyDone": "Notify when done",
      "settings.notifyDoneDesc": "System notification when a background session finishes",
      "settings.checkUpdates": "Check for updates on launch",
      "settings.checkUpdatesDesc": "Query GitHub for new releases (prompt only, no auto-install)",
      "settings.shortcuts": "Keyboard shortcuts",
      "settings.density": "Density",
      "settings.densityDesc": "Compact mode reduces spacing for more content",
      "settings.density.comfortable": "Comfortable",
      "settings.density.compact": "Compact",
      "settings.wallpaper": "Chat wallpaper",
      "settings.wallpaperDesc": "Applies only to the thread area",
      "settings.wallpaperDim": "Dim background",
      "settings.wallpaperDimDesc": "Higher = clearer text",
      "settings.wallpaperCustom": "Custom image",
      "settings.wallpaperPick": "Choose image",
      "settings.defaultModel": "Default model",
      "settings.defaultModelDesc": "Used for new sessions",
      "settings.memoryEnable": "Enable cross-session memory",
      "settings.memoryEnableDesc": "New agents read ~/.grok/memory when enabled",
      "settings.openMemory": "Open memory manager →",
      "settings.accessMode": "Access mode",
      "settings.accessModeDesc": "One-click safety policy — product-ready defaults",
      "settings.checkUpdate": "Check for updates",
      "settings.checkUpdateDesc": "Query the latest GitHub Release",
      "settings.diagnose": "Re-check environment",
      "settings.diagnoseDesc": "CLI installed? Logged in?",
      "settings.usage": "Usage / billing",
      "settings.usageDesc": "Run real /usage for quota and spend",
      "settings.context": "Context usage",
      "settings.contextDesc": "Run /context for window occupancy",
      "settings.compact": "Compact context",
      "settings.compactDesc": "Run /compact to shrink history",
      "settings.sessionInfo": "Session info",
      "settings.sessionInfoDesc": "Run /session-info (model, turns, …)",

      "setup.title": "Welcome to Grok Desktop",
      "setup.lead": "Confirm official CLI and login status before you start",
      "setup.recheck": "Re-check",
      "setup.cliDoc": "CLI install guide",
      "setup.continue": "Continue",

      "notify.doneTitle": "Session finished",
      "notify.doneBody": "“{title}” is done — check the sidebar",

      "update.found": "Update {latest} available (you have {current})",
      "update.latest": "You're up to date ({current})",
      "update.checking": "Checking…",
      "update.fail": "Check failed: {error}",
      "update.view": "View",
      "update.dismiss": "Dismiss",

      "sc.enter": "Send / queue while busy",
      "sc.shiftEnter": "New line",
      "sc.guide": "Interrupt and send correction",
      "sc.n": "New chat (when not typing)",
      "sc.tab": "Cycle open sessions",
      "sc.slash": "Slash commands",
      "sc.plan": "Toggle plan panel",
    },
  };

  let locale = "zh";

  function detectLocale() {
    try {
      const nav = (navigator.language || "zh").toLowerCase();
      if (nav.startsWith("en")) return "en";
    } catch {
      /* ignore */
    }
    return "zh";
  }

  function t(key, vars) {
    const pack = STRINGS[locale] || STRINGS.zh;
    let s = pack[key] ?? STRINGS.zh[key] ?? key;
    if (vars && typeof vars === "object") {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  }

  function setLocale(loc) {
    locale = loc === "en" ? "en" : "zh";
    try {
      document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    } catch {
      /* ignore */
    }
    return locale;
  }

  function getLocale() {
    return locale;
  }

  function applyI18n(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const val = t(key);
      if (el.dataset.i18nHtml === "1") el.innerHTML = val;
      else el.textContent = val;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.setAttribute("placeholder", t(key));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const key = el.getAttribute("data-i18n-title");
      if (key) el.setAttribute("title", t(key));
    });
  }

  // init
  setLocale(detectLocale());

  global.GrokI18n = {
    STRINGS,
    t,
    setLocale,
    getLocale,
    applyI18n,
    detectLocale,
  };
  global.t = t;
})(typeof window !== "undefined" ? window : globalThis);
