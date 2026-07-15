/**
 * Full CLI slash-command catalog (from Grok docs) + ACP dynamic skills.
 * All of these are real when sent as `/name …` prompts to the agent.
 * Desktop-only routes are marked desktop:true and handled in the UI.
 */

const BUILTIN = [
  // Session
  { name: "new", title: "新对话", desc: "清空并开始新会话", desktop: true },
  { name: "clear", title: "清空会话", desc: "等同新对话", desktop: true },
  { name: "compact", title: "压缩上下文", desc: "压缩历史以节省上下文", hint: "可选：保留什么" },
  { name: "context", title: "上下文用量", desc: "上下文窗口与会话统计" },
  { name: "session-info", title: "会话信息", desc: "模型、轮次、上下文用量" },
  { name: "fork", title: "分叉会话", desc: "从当前位置复制新会话" },
  { name: "rewind", title: "回退", desc: "回到更早一轮" },
  { name: "copy", title: "复制回复", desc: "复制最近助手回复", desktop: true },
  { name: "export", title: "导出会话", desc: "导出 Markdown 到文件", desktop: true },
  { name: "rename", title: "重命名", desc: "修改会话标题", desktop: true },
  { name: "home", title: "主页", desc: "回到欢迎页", desktop: true },

  // Model / mode
  { name: "model", title: "切换模型", desc: "更换模型", hint: "模型名" },
  { name: "effort", title: "推理强度", desc: "low / medium / high / xhigh", hint: "high|medium|low" },
  { name: "always-approve", title: "始终批准", desc: "跳过权限确认", hint: "on|off" },
  { name: "auto", title: "自动权限", desc: "安全操作自动批准" },
  { name: "plan", title: "计划模式", desc: "进入 Plan 模式", hint: "可选说明" },
  { name: "view-plan", title: "查看计划", desc: "打开当前计划" },

  // Memory
  { name: "memory", title: "记忆", desc: "浏览/开关记忆", desktop: true },
  { name: "flush", title: "立即写入记忆", desc: "保存当前会话要点" },
  { name: "dream", title: "整理记忆", desc: "合并会话日志" },
  { name: "remember", title: "记住一条", desc: "立刻保存笔记", hint: "笔记内容" },

  // Extensions
  { name: "hooks", title: "Hooks", desc: "生命周期钩子" },
  { name: "plugins", title: "插件", desc: "插件管理", desktop: true },
  { name: "marketplace", title: "插件市场", desc: "浏览安装插件", desktop: true },
  { name: "skills", title: "Skills", desc: "Skills 列表", desktop: true },
  { name: "mcps", title: "MCP 服务器", desc: "MCP 配置", desktop: true },

  // Media
  { name: "imagine", title: "生成图片", desc: "文生图", hint: "描述" },
  { name: "imagine-video", title: "生成视频", desc: "文生视频", hint: "描述" },

  // Agent
  { name: "goal", title: "目标模式", desc: "设置/查看/暂停自主目标", hint: "目标 或 status" },
  { name: "loop", title: "循环任务", desc: "按间隔重复执行", hint: "[间隔] 提示词" },
  { name: "feedback", title: "反馈", desc: "发送会话反馈", hint: "反馈文字" },
  { name: "btw", title: "旁问", desc: "不打断主任务的追问", hint: "问题" },

  // Account / system
  { name: "usage", title: "额度用量", desc: "查看额度与账单" },
  { name: "login", title: "登录", desc: "登录 Grok" },
  { name: "logout", title: "登出", desc: "退出登录" },
  { name: "settings", title: "设置", desc: "打开设置", desktop: true },
  { name: "status", title: "当前状态", desc: "连接与会话状态", desktop: true },
  { name: "docs", title: "文档", desc: "打开文档" },
  { name: "release-notes", title: "更新说明", desc: "查看版本说明" },
  { name: "help", title: "帮助", desc: "帮助与配置说明" },
  { name: "privacy", title: "隐私", desc: "隐私相关设置" },
  { name: "config-agents", title: "配置 Agents", desc: "Agent 配置" },
  { name: "personas", title: "人设", desc: "Persona 管理" },
];

const ZH_EXTRA = {
  // keep map for ACP-only names
};

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
  return {
    name,
    description: cmd.description || fromBuiltin?.desc || "",
    input: cmd.input || (fromBuiltin?.hint ? { hint: fromBuiltin.hint } : null),
    _meta: cmd._meta || null,
    isSkill,
    desktop: !!fromBuiltin?.desktop && !isSkill,
    titleZh,
    descZh,
  };
}

/**
 * Merge static CLI catalog + live ACP list (skills + runtime builtins).
 * ACP entries win on description; static fills missing builtins.
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
        _meta: loc._meta || prev._meta,
        input: loc.input || prev.input,
      });
    } else {
      map.set(c.name, loc);
    }
  }
  return [...map.values()].sort((a, b) => {
    // builtins first, then skills
    if (a.isSkill !== b.isSkill) return a.isSkill ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function localizeAll(commands) {
  return mergeCommandLists(commands);
}

module.exports = { BUILTIN, localizeCommand, localizeAll, mergeCommandLists };
