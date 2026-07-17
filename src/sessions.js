const fs = require("fs");
const path = require("path");
const { defaultCwd, homeDir } = require("./platform");

function grokHome() {
  return process.env.GROK_HOME || path.join(homeDir(), ".grok");
}

function sessionsRoot() {
  return path.join(grokHome(), "sessions");
}

function safeReadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block) return "";
      if (typeof block === "string") return block;
      if (block.type === "text" && typeof block.text === "string") return block.text;
      if (typeof block.text === "string") return block.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Prefer <user_query> body; strip bulky system wrappers. */
function cleanUserText(text) {
  if (!text) return "";
  let t = text;
  const m = t.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i);
  if (m) t = m[1];
  t = t.replace(/<user_info>[\s\S]*?<\/user_info>/gi, "");
  t = t.replace(/<system_reminder>[\s\S]*?<\/system_reminder>/gi, "");
  t = t.replace(/<\/?[a-zA-Z_][\w:-]*(?:\s[^>]*)?>/g, " ");
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncate(text, max = 4000) {
  if (!text || text.length <= max) return text || "";
  return text.slice(0, max) + "\n…";
}

/**
 * Walk ~/.grok/sessions for summary.json files.
 * Returns newest-first list.
 */
function listSessions({ limit = 200 } = {}) {
  const root = sessionsRoot();
  if (!fs.existsSync(root)) return [];

  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        // skip sqlite etc
        if (ent.name === "session_search.sqlite" || ent.name.endsWith(".sqlite")) continue;
        stack.push(full);
        continue;
      }
      if (ent.name !== "summary.json") continue;
      const data = safeReadJson(full);
      if (!data?.info?.id) continue;
      const title =
        data.generated_title ||
        data.session_summary ||
        data.info.id.slice(0, 8);
      out.push({
        id: data.info.id,
        cwd: data.info.cwd || null,
        title: String(title).replace(/\s+/g, " ").trim(),
        summary: (data.session_summary || "").slice(0, 200),
        createdAt: data.created_at || null,
        updatedAt: data.updated_at || data.last_active_at || null,
        model: data.current_model_id || null,
        numMessages: data.num_chat_messages ?? data.num_messages ?? 0,
        dir: path.dirname(full),
      });
    }
  }

  out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return out.slice(0, limit);
}

/**
 * Load a light conversation preview.
 * Only keeps user/assistant turns; truncates each body for UI safety.
 */
function loadHistoryPreview(sessionDir, { maxMessages = 40, maxChars = 3500 } = {}) {
  const file = path.join(sessionDir, "chat_history.jsonl");
  if (!fs.existsSync(file)) return [];

  let raw;
  try {
    // Avoid reading multi‑hundred‑MB files into memory: tail last ~2MB
    const st = fs.statSync(file);
    const maxBytes = 2 * 1024 * 1024;
    if (st.size <= maxBytes) {
      raw = fs.readFileSync(file, "utf8");
    } else {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
      fs.closeSync(fd);
      raw = buf.toString("utf8");
      // drop partial first line
      const nl = raw.indexOf("\n");
      if (nl >= 0) raw = raw.slice(nl + 1);
    }
  } catch {
    return [];
  }

  const messages = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    const type = row.type || row.role;
    if (type === "system" || type === "tool") continue;
    if (type === "user") {
      const text = truncate(cleanUserText(extractTextContent(row.content)), maxChars);
      if (text) messages.push({ role: "user", text });
    } else if (type === "assistant" || type === "model") {
      const text = truncate(extractTextContent(row.content).trim(), maxChars);
      if (text) messages.push({ role: "assistant", text });
    }
  }

  if (messages.length > maxMessages) return messages.slice(-maxMessages);
  return messages;
}

function findSession(sessionId) {
  if (!sessionId) return null;
  // Fast path: walk only matching id folder names
  const root = sessionsRoot();
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const full = path.join(dir, ent.name);
      if (ent.name === sessionId) {
        const summary = path.join(full, "summary.json");
        if (fs.existsSync(summary)) {
          const data = safeReadJson(summary);
          if (data?.info?.id) {
            return {
              id: data.info.id,
              cwd: data.info.cwd || null,
              title:
                data.generated_title ||
                data.session_summary ||
                data.info.id.slice(0, 8),
              summary: data.session_summary || "",
              createdAt: data.created_at || null,
              updatedAt: data.updated_at || data.last_active_at || null,
              model: data.current_model_id || null,
              numMessages: data.num_chat_messages ?? data.num_messages ?? 0,
              dir: full,
            };
          }
        }
      }
      stack.push(full);
    }
  }
  return listSessions({ limit: 5000 }).find((s) => s.id === sessionId) || null;
}

/** Ensure a session appears in the sidebar immediately after create. */
function ensureSessionSummary({ id, cwd, title }) {
  if (!id) throw new Error("missing session id");
  const workDir = cwd || defaultCwd();
  const group = encodeURIComponent(workDir);
  const dir = path.join(sessionsRoot(), group, id);
  fs.mkdirSync(dir, { recursive: true });
  const summaryPath = path.join(dir, "summary.json");
  const now = new Date().toISOString();
  let data = safeReadJson(summaryPath) || {};
  data.info = { id, cwd: workDir, ...(data.info || {}) };
  data.generated_title = title || data.generated_title || "新对话";
  data.session_summary = data.session_summary || data.generated_title;
  data.created_at = data.created_at || now;
  data.updated_at = now;
  data.last_active_at = now;
  data.num_messages = data.num_messages || 0;
  data.num_chat_messages = data.num_chat_messages || 0;
  fs.writeFileSync(summaryPath, JSON.stringify(data, null, 2), "utf8");
  return {
    id,
    cwd: workDir,
    title: data.generated_title,
    summary: data.session_summary,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    model: data.current_model_id || null,
    numMessages: data.num_chat_messages || 0,
    dir,
  };
}

function renameSession(sessionId, title) {
  const s = findSession(sessionId);
  if (!s) throw new Error("会话不存在");
  const summaryPath = path.join(s.dir, "summary.json");
  const data = safeReadJson(summaryPath);
  if (!data) throw new Error("无法读取会话摘要");
  const t = String(title || "").trim();
  if (!t) throw new Error("标题不能为空");
  const now = new Date().toISOString();
  data.generated_title = t;
  data.session_summary = t;
  data.updated_at = now;
  data.last_active_at = now;
  fs.writeFileSync(summaryPath, JSON.stringify(data, null, 2), "utf8");
  return { ...s, title: t, summary: t, updatedAt: now };
}

function deleteSessionDir(sessionId) {
  const s = findSession(sessionId);
  if (!s) throw new Error("会话不存在");
  // safety: only delete under sessions root
  const root = path.resolve(sessionsRoot());
  const dir = path.resolve(s.dir);
  if (!dir.startsWith(root + path.sep) && dir !== root) {
    throw new Error("拒绝删除：路径不在会话目录内");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, id: sessionId };
}

module.exports = {
  grokHome,
  sessionsRoot,
  listSessions,
  loadHistoryPreview,
  findSession,
  ensureSessionSummary,
  renameSession,
  deleteSessionDir,
  extractTextContent,
  cleanUserText,
};
