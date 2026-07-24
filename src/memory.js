const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { grokHome } = require("./sessions");
const { resolveGrokCli } = require("./plugins");
const { commandExists, spawnCli } = require("./platform");

/** @typedef {'note'|'experience'} MemoryEntryType */

const EXPERIENCE_CATEGORIES = [
  "frontend",
  "backend",
  "api",
  "desktop",
  "build",
  "ops",
  "other",
];

function memoryRoot() {
  return path.join(grokHome(), "memory");
}

function entriesPath() {
  return path.join(memoryRoot(), "entries.json");
}

function globalMemoryPath() {
  return path.join(memoryRoot(), "MEMORY.md");
}

function experienceMdPath() {
  return path.join(memoryRoot(), "EXPERIENCE.md");
}

function isEnabledInConfig() {
  try {
    const cfg = path.join(grokHome(), "config.toml");
    if (!fs.existsSync(cfg)) return false;
    const text = fs.readFileSync(cfg, "utf8");
    const block = text.match(/\[memory\][\s\S]*?(?=\n\[|$)/);
    if (!block) return false;
    return /^\s*enabled\s*=\s*true\s*$/m.test(block[0]);
  } catch {
    return false;
  }
}

function setEnabled(enabled) {
  const cfg = path.join(grokHome(), "config.toml");
  let text = "";
  try {
    text = fs.existsSync(cfg) ? fs.readFileSync(cfg, "utf8") : "";
  } catch {
    text = "";
  }
  const val = enabled ? "true" : "false";
  if (/\[memory\]/.test(text)) {
    if (/^\s*enabled\s*=/m.test(text.match(/\[memory\][\s\S]*?(?=\n\[|$)/)?.[0] || "")) {
      text = text.replace(
        /(\[memory\][\s\S]*?)^\s*enabled\s*=\s*.+$/m,
        (block) => block.replace(/^\s*enabled\s*=\s*.+$/m, `enabled = ${val}`),
      );
    } else {
      text = text.replace(/(\[memory\])/, `$1\nenabled = ${val}`);
    }
  } else {
    text = text.trimEnd() + `\n\n[memory]\nenabled = ${val}\n`;
  }
  fs.mkdirSync(path.dirname(cfg), { recursive: true });
  fs.writeFileSync(cfg, text.endsWith("\n") ? text : text + "\n", "utf8");
  return { enabled: !!enabled };
}

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function normalizeCategory(cat) {
  const c = String(cat || "other").toLowerCase();
  return EXPERIENCE_CATEGORIES.includes(c) ? c : "other";
}

function normalizeType(type) {
  return type === "experience" ? "experience" : "note";
}

function emptyStore() {
  return { version: 1, items: [] };
}

function parseLegacyMemoryMd(text) {
  /** @type {Array<{id:string,type:MemoryEntryType,title:string,body:string,category:string|null,createdAt:string,updatedAt:string}>} */
  const items = [];
  if (!text || !String(text).trim()) return items;
  const parts = String(text).split(/\n(?=##\s+)/);
  for (const part of parts) {
    const m = part.match(/^##\s+(.+?)\s*\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    if (/^memory$/i.test(title)) continue;
    let body = m[2].trim();
    // bullet notes: "- text"
    const bullets = [...body.matchAll(/^\s*[-*]\s+(.+)$/gm)].map((x) => x[1].trim());
    if (bullets.length === 1 && body.split("\n").filter((l) => l.trim()).length <= 2) {
      body = bullets[0];
    }
    if (!body) continue;
    const dateMatch = title.match(/(\d{4}-\d{2}-\d{2})/);
    const iso = dateMatch ? `${dateMatch[1]}T00:00:00.000Z` : new Date().toISOString();
    items.push({
      id: newId(),
      type: "note",
      title: /^Note\b/i.test(title) ? body.slice(0, 48) : title,
      body,
      category: null,
      createdAt: iso,
      updatedAt: iso,
    });
  }
  return items;
}

function loadStore() {
  const root = memoryRoot();
  fs.mkdirSync(root, { recursive: true });
  const file = entriesPath();
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      if (data && Array.isArray(data.items)) {
        return {
          version: 1,
          items: data.items
            .filter((x) => x && x.id && x.body != null)
            .map((x) => ({
              id: String(x.id),
              type: normalizeType(x.type),
              title: String(x.title || "").trim() || String(x.body).slice(0, 48),
              body: String(x.body || ""),
              category: x.type === "experience" ? normalizeCategory(x.category) : null,
              createdAt: x.createdAt || new Date().toISOString(),
              updatedAt: x.updatedAt || x.createdAt || new Date().toISOString(),
            })),
        };
      }
    } catch {
      /* fall through migrate */
    }
  }
  // migrate from MEMORY.md once
  let legacy = [];
  try {
    if (fs.existsSync(globalMemoryPath())) {
      legacy = parseLegacyMemoryMd(fs.readFileSync(globalMemoryPath(), "utf8"));
    }
  } catch {
    legacy = [];
  }
  const store = { version: 1, items: legacy };
  saveStore(store);
  return store;
}

function saveStore(store) {
  const root = memoryRoot();
  fs.mkdirSync(root, { recursive: true });
  const clean = {
    version: 1,
    items: Array.isArray(store.items) ? store.items : [],
  };
  fs.writeFileSync(entriesPath(), JSON.stringify(clean, null, 2), "utf8");
  syncMarkdownMirrors(clean.items);
  return clean;
}

function syncMarkdownMirrors(items) {
  const notes = items.filter((i) => i.type === "note");
  const exps = items.filter((i) => i.type === "experience");

  const noteLines = [
    "# Memory",
    "",
    "> Managed by Grok Desktop",
    "",
  ];
  for (const n of notes) {
    const day = String(n.updatedAt || n.createdAt || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    noteLines.push(`## ${n.title || "Note"} (${day})`, "", n.body.trim(), "");
  }
  fs.writeFileSync(globalMemoryPath(), noteLines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");

  const expLines = [
    "# Experience",
    "",
    "> Managed by Grok Desktop · read only when relevant or when the user asks",
    "",
  ];
  for (const e of exps) {
    const cat = e.category || "other";
    expLines.push(
      `## [${cat}] ${e.title || "Experience"}`,
      "",
      e.body.trim(),
      "",
    );
  }
  fs.writeFileSync(experienceMdPath(), expLines.join("\n").replace(/\n{3,}/g, "\n\n"), "utf8");
}

/**
 * List structured entries for the memory UI / agent tools.
 * @param {{ type?: string, category?: string, includeExperience?: boolean }} [opts]
 */
function listEntries(opts = {}) {
  const store = loadStore();
  const includeExperience = opts.includeExperience !== false;
  let items = store.items.slice();
  if (opts.type === "note" || opts.type === "experience") {
    items = items.filter((i) => i.type === opts.type);
  }
  if (!includeExperience) {
    items = items.filter((i) => i.type !== "experience");
  }
  if (opts.category) {
    const cat = normalizeCategory(opts.category);
    items = items.filter((i) => i.type !== "experience" || i.category === cat);
  }
  items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return {
    enabled: isEnabledInConfig(),
    root: memoryRoot(),
    categories: EXPERIENCE_CATEGORIES.slice(),
    entries: items,
    counts: {
      note: store.items.filter((i) => i.type === "note").length,
      experience: store.items.filter((i) => i.type === "experience").length,
      all: store.items.length,
    },
  };
}

function getEntry(id) {
  const store = loadStore();
  const entry = store.items.find((i) => i.id === id);
  if (!entry) throw new Error("记忆条不存在");
  return entry;
}

/**
 * Create or update an entry.
 * @param {{ id?: string, type?: string, title?: string, body?: string, category?: string }} partial
 */
function upsertEntry(partial = {}) {
  const body = String(partial.body ?? "").trim();
  if (!body && !partial.id) throw new Error("内容为空");
  const store = loadStore();
  const now = new Date().toISOString();
  if (partial.id) {
    const idx = store.items.findIndex((i) => i.id === partial.id);
    if (idx < 0) throw new Error("记忆条不存在");
    const prev = store.items[idx];
    const type = partial.type != null ? normalizeType(partial.type) : prev.type;
    const next = {
      ...prev,
      type,
      title:
        partial.title != null
          ? String(partial.title).trim() || body.slice(0, 48) || prev.title
          : prev.title,
      body: partial.body != null ? body || prev.body : prev.body,
      category: type === "experience" ? normalizeCategory(partial.category ?? prev.category) : null,
      updatedAt: now,
    };
    if (!String(next.body || "").trim()) throw new Error("内容为空");
    store.items[idx] = next;
    saveStore(store);
    return { ok: true, entry: next };
  }
  const type = normalizeType(partial.type);
  const entry = {
    id: newId(),
    type,
    title: String(partial.title || "").trim() || body.slice(0, 48),
    body,
    category: type === "experience" ? normalizeCategory(partial.category) : null,
    createdAt: now,
    updatedAt: now,
  };
  store.items.unshift(entry);
  saveStore(store);
  return { ok: true, entry };
}

function deleteEntry(id) {
  const store = loadStore();
  const before = store.items.length;
  store.items = store.items.filter((i) => i.id !== id);
  if (store.items.length === before) throw new Error("记忆条不存在");
  saveStore(store);
  return { ok: true, id };
}

function listMemoryFiles() {
  const root = memoryRoot();
  const out = [];
  // ensure store + mirrors exist
  try {
    loadStore();
  } catch {
    /* ignore */
  }
  if (!fs.existsSync(root)) {
    return { enabled: isEnabledInConfig(), root, files: [] };
  }

  const globalFile = globalMemoryPath();
  if (fs.existsSync(globalFile)) {
    let stat = null;
    try {
      stat = fs.statSync(globalFile);
    } catch {
      stat = null;
    }
    out.push({
      id: "global",
      scope: "global",
      title: "全局记忆",
      description: "跨所有项目的偏好与事实",
      path: globalFile,
      size: stat?.size || 0,
      updatedAt: stat?.mtime?.toISOString() || null,
    });
  }

  const expFile = experienceMdPath();
  if (fs.existsSync(expFile)) {
    let stat = null;
    try {
      stat = fs.statSync(expFile);
    } catch {
      stat = null;
    }
    out.push({
      id: "experience-md",
      scope: "experience",
      title: "经验总结",
      description: "分类经验 · 按需阅读",
      path: expFile,
      size: stat?.size || 0,
      updatedAt: stat?.mtime?.toISOString() || null,
    });
  }

  let dirs = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    dirs = [];
  }

  for (const d of dirs) {
    const dir = path.join(root, d.name);
    const mem = path.join(dir, "MEMORY.md");
    if (!fs.existsSync(mem)) continue;
    let stat = null;
    try {
      stat = fs.statSync(mem);
    } catch {
      stat = null;
    }
    let sessionNotes = 0;
    const sessDir = path.join(dir, "sessions");
    if (fs.existsSync(sessDir)) {
      try {
        sessionNotes = fs.readdirSync(sessDir).filter((f) => f.endsWith(".md")).length;
      } catch {
        /* ignore */
      }
    }
    out.push({
      id: d.name,
      scope: "workspace",
      title: d.name.replace(/-[a-f0-9]{8}$/i, "") || d.name,
      slug: d.name,
      description: sessionNotes ? `${sessionNotes} 条会话笔记` : "项目级约定与上下文",
      path: mem,
      dir,
      sessionNotes,
      size: stat?.size || 0,
      updatedAt: stat?.mtime?.toISOString() || null,
    });
  }

  out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return { enabled: isEnabledInConfig(), root, files: out };
}

function readMemoryFile(filePath) {
  if (!filePath || !filePath.startsWith(memoryRoot())) {
    const root = memoryRoot();
    if (!filePath || !path.resolve(filePath).startsWith(path.resolve(root))) {
      throw new Error("非法路径");
    }
  }
  const full = path.resolve(filePath);
  if (!fs.existsSync(full)) throw new Error("文件不存在");
  const content = fs.readFileSync(full, "utf8");
  return { path: full, content };
}

function writeMemoryFile(filePath, content) {
  const root = path.resolve(memoryRoot());
  const full = path.resolve(filePath);
  if (!full.startsWith(root)) throw new Error("非法路径");
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content ?? "", "utf8");
  // If user edited the global MEMORY.md raw, re-import notes best-effort
  if (full === path.resolve(globalMemoryPath())) {
    try {
      const store = loadStore();
      const experiences = store.items.filter((i) => i.type === "experience");
      const notes = parseLegacyMemoryMd(content ?? "");
      store.items = [...notes, ...experiences];
      // avoid recursive sync loop: write json only then mirrors
      fs.writeFileSync(entriesPath(), JSON.stringify({ version: 1, items: store.items }, null, 2), "utf8");
      syncMarkdownMirrors(store.items);
    } catch {
      /* ignore reimport errors */
    }
  }
  return { path: full, ok: true };
}

/** Append a plain note to global entries (+ MEMORY.md mirror) */
function appendNote({ text, scope = "global", cwd, type = "note", title, category } = {}) {
  const body = String(text || "").trim();
  if (!body) throw new Error("内容为空");
  if (type === "experience") {
    return upsertEntry({
      type: "experience",
      title: title || body.slice(0, 48),
      body,
      category: category || "other",
    });
  }
  // workspace notes still append to project MEMORY.md (legacy path)
  if (scope === "workspace" && cwd) {
    const root = memoryRoot();
    fs.mkdirSync(root, { recursive: true });
    const slugBase = path.basename(cwd).replace(/[^a-zA-Z0-9._-]+/g, "-") || "project";
    let dir = null;
    try {
      for (const d of fs.readdirSync(root, { withFileTypes: true })) {
        if (!d.isDirectory()) continue;
        if (d.name.startsWith(slugBase)) {
          dir = path.join(root, d.name);
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (!dir) {
      const hash = crypto.createHash("sha1").update(cwd).digest("hex").slice(0, 8);
      dir = path.join(root, `${slugBase}-${hash}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    const filePath = path.join(dir, "MEMORY.md");
    const stamp = new Date().toISOString().slice(0, 10);
    const block = `\n## Note ${stamp}\n\n- ${body.replace(/\n+/g, " ")}\n`;
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, `# Memory\n\n> Managed by Grok Desktop\n${block}`, "utf8");
    } else {
      fs.appendFileSync(filePath, block, "utf8");
    }
    return { path: filePath, ok: true };
  }
  return upsertEntry({
    type: "note",
    title: title || body.slice(0, 48),
    body,
  });
}

function clearMemory({ scope = "all" } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["memory", "clear"];
    const cli = resolveGrokCli();
    if (!commandExists(cli)) {
      reject(
        new Error(
          `未找到 Grok CLI：${cli}。请先安装并登录官方 Grok CLI，或设置 GROK_CLI 为完整路径。`,
        ),
      );
      return;
    }
    const child = spawnCli(cli, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `memory clear failed (${code})`));
        return;
      }
      // also clear our structured store when user clears
      try {
        saveStore(emptyStore());
      } catch {
        /* ignore */
      }
      resolve({ ok: true, scope });
    });
    child.on("error", reject);
  });
}

/**
 * Agent-facing hint: when experience is disabled, do not surface experience entries.
 */
function listEntriesForAgent({ experienceEnabled = true, type, category } = {}) {
  return listEntries({
    type,
    category,
    includeExperience: !!experienceEnabled,
  });
}

module.exports = {
  EXPERIENCE_CATEGORIES,
  memoryRoot,
  isEnabledInConfig,
  setEnabled,
  listMemoryFiles,
  listEntries,
  listEntriesForAgent,
  getEntry,
  upsertEntry,
  deleteEntry,
  readMemoryFile,
  writeMemoryFile,
  appendNote,
  clearMemory,
};
