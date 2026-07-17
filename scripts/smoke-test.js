#!/usr/bin/env node
/**
 * Headless regression: sessions list survives find + history + ACP load.
 * Does not launch Electron UI; verifies core modules.
 */
const assert = require("assert");

const { listSessions, loadHistoryPreview, findSession } = require("../src/sessions");
const { AcpClient } = require("../src/acp");
const { defaultCwd, resolveGrokCli } = require("../src/platform");

async function main() {
  const list1 = listSessions({ limit: 50 });
  console.log(`[1] listSessions → ${list1.length} sessions`);
  assert.ok(list1.length > 0, "expected at least one session on disk");

  const target = list1[0];
  console.log(`[2] target ${target.id.slice(0, 8)}… “${target.title}”`);

  const found = findSession(target.id);
  assert.ok(found, "findSession must return the session");
  assert.strictEqual(found.id, target.id);

  const hist = loadHistoryPreview(found.dir, { maxMessages: 40, maxChars: 2800 });
  console.log(`[3] history preview → ${hist.length} messages`);
  // history may be empty for some sessions; just ensure no throw and array
  assert.ok(Array.isArray(hist));

  const list2 = listSessions({ limit: 50 });
  console.log(`[4] listSessions again → ${list2.length} (must not shrink to 0)`);
  assert.ok(list2.length > 0, "list must still work after history read");
  assert.ok(list2.some((s) => s.id === target.id), "target still in list");

  const cli = resolveGrokCli();
  const cwd = found.cwd && require("fs").existsSync(found.cwd) ? found.cwd : defaultCwd();
  const client = new AcpClient({
    cliPath: cli,
    cwd,
    log: (m) => console.log("  acp:", m),
  });

  let chunkCount = 0;
  client.on("messageChunk", () => {
    chunkCount++;
  });

  console.log(`[5] ACP initialize + loadSession (hydrate mute)…`);
  await client.start();
  await client.loadSession(target.id);
  // allow grace period for late packets
  await new Promise((r) => setTimeout(r, 600));
  console.log(`[6] chunks during/after hydrate: ${chunkCount} (expect ~0)`);
  // Soft assert: allow a few stragglers but not a flood
  assert.ok(chunkCount < 20, `hydrate leaked too many chunks: ${chunkCount}`);

  const list3 = listSessions({ limit: 50 });
  console.log(`[7] listSessions after ACP load → ${list3.length}`);
  assert.ok(list3.length > 0, "list must survive ACP load");

  client.dispose();
  console.log("SMOKE OK");
}

main().catch((err) => {
  console.error("SMOKE FAIL", err);
  process.exit(1);
});
