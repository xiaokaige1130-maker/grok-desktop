const fs = require("fs");
const path = require("path");
const { grokHome } = require("./sessions");
const { resolveGrokCli } = require("./plugins");
const { commandExists, spawnCli } = require("./platform");

function memoryRoot() {
  return path.join(grokHome(), "memory");
}

function isEnabledInConfig() {
  try {
    const cfg = path.join(grokHome(), "config.toml");
    if (!fs.existsSync(cfg)) return false;
    const text = fs.readFileSync(cfg, "utf8");
    // [memory] enabled = true
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

function listMemoryFiles() {
  const root = memoryRoot();
  const out = [];
  if (!fs.existsSync(root)) {
    return { enabled: isEnabledInConfig(), root, files: [] };
  }

  // global
  const globalFile = path.join(root, "MEMORY.md");
  if (fs.existsSync(globalFile)) {
    let stat;
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
    let stat;
    try {
      stat = fs.statSync(mem);
    } catch {
      stat = null;
    }
    // count session notes
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
    // allow only under memory root
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
  return { path: full, ok: true };
}

/** Append a plain note to global or workspace MEMORY.md */
function appendNote({ text, scope = "global", cwd } = {}) {
  const body = String(text || "").trim();
  if (!body) throw new Error("内容为空");
  const root = memoryRoot();
  fs.mkdirSync(root, { recursive: true });
  let filePath;
  if (scope === "workspace" && cwd) {
    // best-effort: find matching workspace folder by path fragment, else create slug
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
      const crypto = require("crypto");
      const hash = crypto.createHash("sha1").update(cwd).digest("hex").slice(0, 8);
      dir = path.join(root, `${slugBase}-${hash}`);
      fs.mkdirSync(dir, { recursive: true });
    }
    filePath = path.join(dir, "MEMORY.md");
  } else {
    filePath = path.join(root, "MEMORY.md");
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `\n## Note ${stamp}\n\n- ${body.replace(/\n+/g, " ")}\n`;
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      `# Memory\n\n> Managed by Grok Desktop\n${block}`,
      "utf8",
    );
  } else {
    fs.appendFileSync(filePath, block, "utf8");
  }
  return { path: filePath, ok: true };
}

function clearMemory({ scope = "all" } = {}) {
  return new Promise((resolve, reject) => {
    const args = ["memory", "clear"];
    // CLI: clear workspace by default — use as best effort
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
        // fallback: don't wipe blindly if CLI fails
        reject(new Error(err.trim() || `memory clear failed (${code})`));
        return;
      }
      resolve({ ok: true, scope });
    });
    child.on("error", reject);
  });
}

module.exports = {
  memoryRoot,
  isEnabledInConfig,
  setEnabled,
  listMemoryFiles,
  readMemoryFile,
  writeMemoryFile,
  appendNote,
  clearMemory,
};
