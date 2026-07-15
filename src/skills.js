const fs = require("fs");
const path = require("path");
const os = require("os");
const { grokHome } = require("./sessions");

function expandHome(p) {
  if (!p) return p;
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: md };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val === ">" || val === "|") continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[key] = val;
  }
  // multi-line description after description: >
  const descBlock = m[1].match(/description:\s*>\s*\n((?:[ \t]+.+\n?)+)/);
  if (descBlock) {
    meta.description = descBlock[1]
      .split("\n")
      .map((l) => l.replace(/^\s+/, ""))
      .join(" ")
      .trim();
  }
  const short = m[1].match(/short-description:\s*["']?([^"'\n]+)/);
  if (short) meta.shortDescription = short[1].trim();
  return { meta, body: m[2] || "" };
}

function skillRoots() {
  const home = grokHome();
  const roots = [
    { scope: "bundled", dir: path.join(home, "bundled", "skills") },
    { scope: "user", dir: path.join(home, "skills") },
    { scope: "user-commands", dir: path.join(home, "commands") },
  ];
  // also scan common agent skill homes if present
  const extras = [
    path.join(os.homedir(), ".agents", "skills"),
    path.join(os.homedir(), ".claude", "skills"),
    path.join(os.homedir(), ".cursor", "skills"),
  ];
  for (const dir of extras) {
    if (fs.existsSync(dir)) roots.push({ scope: "compat", dir });
  }
  return roots.filter((r) => fs.existsSync(r.dir));
}

function collectSkillsFromDir(rootDir, scope) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const skillDir = path.join(rootDir, ent.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    let md = "";
    try {
      md = fs.readFileSync(skillFile, "utf8");
    } catch {
      continue;
    }
    const { meta, body } = parseFrontmatter(md);
    const name = meta.name || ent.name;
    const description =
      meta.shortDescription || meta.description || body.slice(0, 160).replace(/\s+/g, " ");
    let mtime = null;
    try {
      mtime = fs.statSync(skillFile).mtime.toISOString();
    } catch {
      /* ignore */
    }
    out.push({
      name,
      description,
      scope,
      path: skillDir,
      skillFile,
      updatedAt: mtime,
    });
  }
  return out;
}

/**
 * List discovered skills (dedupe by name, higher-priority scope wins).
 * Priority: user > bundled > compat
 */
function listSkills() {
  const priority = { user: 3, "user-commands": 3, bundled: 2, compat: 1 };
  const map = new Map();
  for (const root of skillRoots()) {
    for (const skill of collectSkillsFromDir(root.dir, root.scope)) {
      const prev = map.get(skill.name);
      if (!prev || (priority[skill.scope] || 0) >= (priority[prev.scope] || 0)) {
        map.set(skill.name, skill);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function readSkill(name) {
  const skill = listSkills().find((s) => s.name === name);
  if (!skill) return null;
  try {
    const md = fs.readFileSync(skill.skillFile, "utf8");
    const { meta, body } = parseFrontmatter(md);
    return { ...skill, meta, body, markdown: md };
  } catch (err) {
    return { ...skill, error: err.message };
  }
}

function createSkill({ name, description }) {
  const safe = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!safe) throw new Error("技能名称无效");
  const dir = path.join(grokHome(), "skills", safe);
  if (fs.existsSync(dir)) throw new Error(`技能已存在: ${safe}`);
  fs.mkdirSync(dir, { recursive: true });
  const desc = description || `Skill ${safe}`;
  const md = `---
name: ${safe}
description: >
  ${desc}
---

# ${safe}

Describe what this skill does and when Grok should use it.

## Steps

1. …
`;
  fs.writeFileSync(path.join(dir, "SKILL.md"), md, "utf8");
  return readSkill(safe);
}

module.exports = {
  listSkills,
  readSkill,
  createSkill,
  skillRoots,
  expandHome,
};
