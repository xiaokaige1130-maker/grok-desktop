const fs = require("fs");
const path = require("path");

/**
 * Very small line-diff for UI previews (no external deps).
 * Returns light payload: path, hunks, stats, truncation flags (no full file bodies).
 */
function extractWritePayload(rawInput) {
  if (!rawInput) return null;
  let obj = rawInput;
  if (typeof rawInput === "string") {
    try {
      obj = JSON.parse(rawInput);
    } catch {
      return null;
    }
  }
  const filePath =
    obj.path || obj.file_path || obj.filePath || obj.file || obj.target_file || null;
  const after =
    obj.contents ??
    obj.content ??
    obj.new_string ??
    obj.newString ??
    obj.text ??
    null;
  if (!filePath || after == null) return null;
  return { path: String(filePath), after: String(after) };
}

function isWriteLikeTool(payload) {
  const kind = String(payload?.kind || "").toLowerCase();
  const title = String(payload?.title || "").toLowerCase();
  if (/edit|write|create|patch|str_replace|search_replace/.test(kind)) return true;
  if (/write|edit|create|replace|patch|save/.test(title)) return true;
  return !!extractWritePayload(payload?.rawInput);
}

function lineDiff(before, after, maxLines = 200) {
  const a = String(before || "").split("\n");
  const b = String(after || "").split("\n");
  const A = a.slice(0, maxLines);
  const B = b.slice(0, maxLines);
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const hunks = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      hunks.push({ type: "same", text: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      hunks.push({ type: "del", text: A[i] });
      i++;
    } else {
      hunks.push({ type: "add", text: B[j] });
      j++;
    }
  }
  while (i < n) {
    hunks.push({ type: "del", text: A[i++] });
  }
  while (j < m) {
    hunks.push({ type: "add", text: B[j++] });
  }
  const linesTruncated = a.length > maxLines || b.length > maxLines;
  if (linesTruncated) {
    hunks.push({
      type: "meta",
      text: `… 预览截断（前后各最多 ${maxLines} 行，原 ${a.length} → ${b.length} 行）`,
    });
  }
  return {
    hunks,
    beforeLines: a.length,
    afterLines: b.length,
    linesTruncated,
    maxLines,
  };
}

function buildFileChange(payload, cwd) {
  if (!isWriteLikeTool(payload)) return null;
  const w = extractWritePayload(payload.rawInput);
  if (!w) return null;
  let abs = w.path;
  if (!path.isAbsolute(abs) && cwd) {
    abs = path.resolve(cwd, w.path);
  }
  let before = "";
  let exists = false;
  let fileTooLarge = false;
  let fileSize = 0;
  const MAX_BYTES = 1_500_000;
  try {
    if (fs.existsSync(abs)) {
      exists = true;
      const st = fs.statSync(abs);
      fileSize = st.size;
      if (st.size < MAX_BYTES) before = fs.readFileSync(abs, "utf8");
      else {
        fileTooLarge = true;
        before = "";
      }
    }
  } catch {
    before = "";
  }

  let hunks;
  let stats;
  let linesTruncated = false;
  let beforeLines = 0;
  let afterLines = String(w.after || "").split("\n").length;
  let maxLines = 200;

  if (fileTooLarge) {
    hunks = [
      {
        type: "meta",
        text: `文件过大（${formatBytes(fileSize)}），跳过全文 diff 预览`,
      },
      {
        type: "meta",
        text: `写入约 ${afterLines} 行 · 可用下方按钮打开文件查看`,
      },
    ];
    stats = { added: afterLines, deleted: 0 };
  } else {
    const diff = lineDiff(before, w.after, maxLines);
    hunks = diff.hunks;
    beforeLines = diff.beforeLines;
    afterLines = diff.afterLines;
    linesTruncated = diff.linesTruncated;
    maxLines = diff.maxLines;
    stats = {
      added: hunks.filter((h) => h.type === "add").length,
      deleted: hunks.filter((h) => h.type === "del").length,
    };
  }

  return {
    toolCallId: payload.toolCallId || null,
    path: abs,
    relativePath: w.path,
    dir: path.dirname(abs),
    basename: path.basename(abs),
    exists,
    // intentionally omit full before/after bodies
    hunks,
    stats,
    truncated: {
      lines: linesTruncated,
      fileTooLarge,
      beforeLines,
      afterLines,
      maxLines,
      fileSize,
    },
    status: payload.status || "running",
    title: payload.title || "write",
  };
}

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  extractWritePayload,
  isWriteLikeTool,
  lineDiff,
  buildFileChange,
  formatBytes,
};
