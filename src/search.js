const fs = require("fs");
const path = require("path");
const { listSessions, extractTextContent, cleanUserText } = require("./sessions");

/**
 * Full-text search across session chat_history.jsonl files.
 * Returns hits with snippet + matched query for UI highlight.
 */
function searchSessions(query, { limit = 40 } = {}) {
  const rawQ = String(query || "").trim();
  const q = rawQ.toLowerCase();
  if (!q) return [];
  const sessions = listSessions({ limit: 300 });
  const hits = [];

  for (const s of sessions) {
    const file = path.join(s.dir, "chat_history.jsonl");
    if (!fs.existsSync(file)) continue;
    let raw = "";
    try {
      const st = fs.statSync(file);
      const maxBytes = 1.5 * 1024 * 1024;
      if (st.size <= maxBytes) raw = fs.readFileSync(file, "utf8");
      else {
        const fd = fs.openSync(file, "r");
        const buf = Buffer.alloc(maxBytes);
        fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
        fs.closeSync(fd);
        raw = buf.toString("utf8");
        const nl = raw.indexOf("\n");
        if (nl >= 0) raw = raw.slice(nl + 1);
      }
    } catch {
      continue;
    }

    let bestSnippet = "";
    let matchCount = 0;
    let matchRole = null;
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      const type = row.type || row.role;
      if (type === "system" || type === "tool" || type === "tool_result") continue;
      let text = extractTextContent(row.content);
      if (type === "user") text = cleanUserText(text);
      if (!text) continue;
      const low = text.toLowerCase();
      if (!low.includes(q)) continue;
      matchCount++;
      if (!bestSnippet) {
        const idx = low.indexOf(q);
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + q.length + 80);
        bestSnippet =
          (start > 0 ? "…" : "") +
          text.slice(start, end).replace(/\s+/g, " ") +
          (end < text.length ? "…" : "");
        matchRole = type === "user" ? "user" : "assistant";
      }
    }
    const titleHit = (s.title || "").toLowerCase().includes(q);
    if (matchCount > 0 || titleHit) {
      hits.push({
        id: s.id,
        title: s.title,
        cwd: s.cwd,
        updatedAt: s.updatedAt,
        matchCount: matchCount + (titleHit ? 1 : 0),
        snippet: bestSnippet || s.summary || s.title,
        query: rawQ,
        matchRole,
        titleOnly: matchCount === 0 && titleHit,
      });
    }
    if (hits.length >= limit * 2) break;
  }

  hits.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  });
  return hits.slice(0, limit);
}

module.exports = { searchSessions };
