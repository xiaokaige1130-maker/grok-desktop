/**
 * Read-only discovery of Grok lifecycle hooks on disk.
 * Does not execute hooks — UI only.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { grokHome } = require("./sessions");

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractEventsFromDoc(doc) {
  const events = new Set();
  if (!doc || typeof doc !== "object") return [];
  // Grok format: { hooks: { SessionStart: [ ... ], PreToolUse: [...] } }
  const root = doc.hooks && typeof doc.hooks === "object" ? doc.hooks : doc;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    for (const key of Object.keys(root)) {
      if (key === "hooks" || key === "matcher") continue;
      if (Array.isArray(root[key]) || (root[key] && typeof root[key] === "object")) {
        events.add(key);
      }
    }
  }
  return [...events];
}

function listJsonFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * @param {{ cwd?: string }} opts
 * @returns {{ hooks: Array<object>, roots: Array<object> }}
 */
function listHooks(opts = {}) {
  const home = grokHome();
  const cwd = opts.cwd || null;
  const roots = [
    { scope: "user", dir: path.join(home, "hooks"), trusted: true },
  ];
  if (cwd) {
    roots.push({
      scope: "project",
      dir: path.join(cwd, ".grok", "hooks"),
      trusted: null, // unknown without trust store
    });
  }
  // Compat sources (scan only if present)
  const cursorHooks = path.join(os.homedir(), ".cursor", "hooks.json");
  const claudeSettings = path.join(os.homedir(), ".claude", "settings.json");

  const hooks = [];
  const rootMeta = [];

  for (const r of roots) {
    const files = listJsonFiles(r.dir);
    rootMeta.push({
      scope: r.scope,
      dir: r.dir,
      exists: fs.existsSync(r.dir),
      fileCount: files.length,
      trusted: r.trusted,
    });
    for (const file of files) {
      const doc = safeReadJson(file);
      const events = extractEventsFromDoc(doc);
      hooks.push({
        id: `${r.scope}:${path.basename(file)}`,
        name: path.basename(file, ".json"),
        path: file,
        scope: r.scope,
        events,
        eventCount: events.length,
        ok: !!doc,
      });
    }
  }

  // Single-file compat
  for (const [scope, file] of [
    ["cursor", cursorHooks],
    ["claude", claudeSettings],
  ]) {
    if (!fs.existsSync(file)) continue;
    rootMeta.push({
      scope,
      dir: file,
      exists: true,
      fileCount: 1,
      trusted: true,
    });
    const doc = safeReadJson(file);
    // Claude settings may nest hooks under "hooks"
    const events = extractEventsFromDoc(doc?.hooks ? { hooks: doc.hooks } : doc);
    if (events.length || doc) {
      hooks.push({
        id: `${scope}:${path.basename(file)}`,
        name: path.basename(file),
        path: file,
        scope,
        events,
        eventCount: events.length,
        ok: !!doc,
        compat: true,
      });
    }
  }

  hooks.sort((a, b) => String(a.scope).localeCompare(b.scope) || String(a.name).localeCompare(b.name));
  return { hooks, roots: rootMeta, grokHome: home };
}

module.exports = { listHooks, extractEventsFromDoc };
