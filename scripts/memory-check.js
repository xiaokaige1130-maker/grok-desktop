const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-memory-check-"));
process.env.GROK_HOME = home;

try {
  const memory = require("../src/memory");

  assert.strictEqual(memory.memoryRoot(), path.join(home, "memory"));
  memory.setEnabled(true);
  assert.strictEqual(memory.isEnabledInConfig(), true);

  const note = memory.upsertEntry({
    type: "note",
    title: "Reply language",
    body: "Reply in Chinese.",
  }).entry;
  const experience = memory.upsertEntry({
    type: "experience",
    title: "Desktop release",
    body: "Run checks before packaging.",
    category: "build",
  }).entry;

  let all = memory.listEntries();
  assert.deepStrictEqual(all.counts, { note: 1, experience: 1, all: 2 });
  assert.strictEqual(memory.getEntry(note.id).body, "Reply in Chinese.");
  assert.strictEqual(memory.listEntries({ type: "experience" }).entries[0].category, "build");
  assert.strictEqual(memory.listEntriesForAgent({ experienceEnabled: false }).entries.length, 1);

  memory.upsertEntry({ id: note.id, body: "Always reply in Chinese." });
  assert.strictEqual(memory.getEntry(note.id).body, "Always reply in Chinese.");
  assert.ok(fs.readFileSync(path.join(home, "memory", "MEMORY.md"), "utf8").includes("Always reply"));
  assert.ok(fs.readFileSync(path.join(home, "memory", "EXPERIENCE.md"), "utf8").includes("Desktop release"));

  memory.deleteEntry(experience.id);
  all = memory.listEntries();
  assert.deepStrictEqual(all.counts, { note: 1, experience: 0, all: 1 });

  console.log("MEMORY CHECK OK");
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
