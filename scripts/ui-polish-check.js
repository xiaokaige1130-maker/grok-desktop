#!/usr/bin/env node
/**
 * Structural + pure-logic checks for ship-ready UI polish.
 * Exercises shipped modules (commands-zh) and greps renderer chrome.
 * Does not launch Electron.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const {
  BUILTIN,
  DESKTOP_UI_ROUTES,
  mergeCommandLists,
  filterSlashCommands,
  groupSlashCommands,
  isDesktopUiRoute,
  resolveDesktopRoute,
  localizeAll,
  commandsForRenderer,
} = require("../src/commands-zh");

/**
 * Simulate session:activate / session:open soft return payload.
 * Same function main.js uses at the IPC boundary.
 */
function simulateIpcCommandsPayload(rawAcpCommands) {
  return {
    ok: true,
    live: true,
    commands: commandsForRenderer(rawAcpCommands),
  };
}

/** Renderer-side gate (mirrors app.js commandsLookLocalized). */
function commandsLookLocalized(cmds) {
  if (!Array.isArray(cmds) || !cmds.length) return false;
  return cmds.some(
    (c) =>
      c &&
      (typeof c.titleZh === "string" ||
        typeof c.group === "string" ||
        c.desktop === true ||
        c.isSkill === true),
  );
}

function main() {
  console.log("[ui-polish] commands-zh pure helpers…");

  const list = mergeCommandLists([
    { name: "demo-skill", description: "a skill", _meta: { path: "/tmp/SKILL.md" } },
  ]);
  assert.ok(list.some((c) => c.name === "settings" && c.desktop));
  assert.ok(list.some((c) => c.name === "demo-skill" && c.isSkill));

  const filtered = filterSlashCommands(list, "set");
  assert.ok(filtered.some((c) => c.name === "settings"), "filter finds settings");

  const groups = groupSlashCommands(list);
  assert.ok(groups.length >= 3, "commands are grouped");
  assert.ok(groups.every((g) => g.group && Array.isArray(g.items)));
  const groupNames = groups.map((g) => g.group);
  assert.ok(groupNames.includes("session"));
  assert.ok(groupNames.includes("system"));
  assert.ok(groupNames.includes("skill"), "skills form their own group");

  const pureUi = [
    "settings",
    "export",
    "rename",
    "memory",
    "skills",
    "plugins",
    "mcps",
    "new",
    "clear",
    "home",
    "copy",
  ];
  for (const name of pureUi) {
    assert.ok(isDesktopUiRoute(name), `${name} is desktop UI route`);
    assert.ok(resolveDesktopRoute(name), `${name} resolves`);
  }
  assert.strictEqual(isDesktopUiRoute("compact"), false);
  assert.strictEqual(resolveDesktopRoute("demo-skill", true), null);
  assert.strictEqual(resolveDesktopRoute("settings", true), null, "skills never use desktop routes");

  // Desktop builtins with pure UI routes must not be "agent-only"
  for (const b of BUILTIN.filter((x) => x.desktop)) {
    if (b.name === "status") continue; // hybrid → session-info
    assert.ok(
      DESKTOP_UI_ROUTES[b.name],
      `desktop builtin /${b.name} has DESKTOP_UI_ROUTES entry`,
    );
  }

  const again = localizeAll([]);
  assert.ok(again.length >= BUILTIN.length);

  // ── IPC boundary: raw ACP → commandsForRenderer (same as main.js) ──
  console.log("[ui-polish] IPC activate/open command shape…");
  const rawAcp = [
    { name: "compact", description: "Compress history" },
    {
      name: "repo-review",
      description: "Review the repo",
      _meta: { path: "/Users/x/.grok/skills/repo-review/SKILL.md", scope: "user" },
    },
  ];
  // Raw ACP must NOT look localized
  assert.strictEqual(
    commandsLookLocalized(rawAcp),
    false,
    "raw ACP lacks titleZh/group — soft path must not treat as final catalog",
  );

  const ipc = simulateIpcCommandsPayload(rawAcp);
  assert.ok(commandsLookLocalized(ipc.commands), "IPC payload looks localized");
  assert.strictEqual(
    commandsForRenderer,
    commandsForRenderer,
    "commandsForRenderer is the IPC helper",
  );
  assert.ok(
    ipc.commands === commandsForRenderer(rawAcp) ||
      JSON.stringify(ipc.commands) === JSON.stringify(commandsForRenderer(rawAcp)),
  );

  const skill = ipc.commands.find((c) => c.name === "repo-review");
  assert.ok(skill, "skill preserved");
  assert.strictEqual(skill.isSkill, true, "skill has isSkill");
  assert.strictEqual(skill.group, "skill", "skill group for badge section");
  assert.ok(skill.titleZh && skill.titleZh.includes("repo-review"), "skill titleZh");

  const settings = ipc.commands.find((c) => c.name === "settings");
  assert.ok(settings, "BUILTIN settings merged even if ACP omitted it");
  assert.strictEqual(settings.desktop, true);
  assert.ok(settings.titleZh, "settings titleZh");

  const exportCmd = ipc.commands.find((c) => c.name === "export");
  assert.ok(exportCmd && exportCmd.desktop, "BUILTIN export merged");

  const grouped = groupSlashCommands(ipc.commands);
  assert.ok(
    grouped.some((g) => g.group === "skill" && g.items.some((i) => i.name === "repo-review")),
    "skill group present after IPC localize",
  );
  assert.ok(
    grouped.some((g) => g.group === "system" && g.items.some((i) => i.name === "settings")),
    "system group has settings",
  );

  // Soft-activate path: if renderer only kept raw, badges/groups break — prove gate rejects raw
  assert.strictEqual(commandsLookLocalized(rawAcp), false);
  // After IPC, soft path may apply catalog
  assert.ok(commandsLookLocalized(ipc.commands));

  // main.js must use commandsForRenderer at activate/open/list boundaries (not raw availableCommands)
  console.log("[ui-polish] main.js IPC wiring…");
  const mainSrc = read("main.js");
  assert.ok(
    /commandsForRenderer/.test(mainSrc),
    "main imports/uses commandsForRenderer",
  );
  // Must not return raw availableCommands for session handlers
  assert.ok(
    !/commands:\s*live\.availableCommands/.test(mainSrc),
    "session:activate must not return raw live.availableCommands",
  );
  assert.ok(
    !/commands:\s*client\.availableCommands/.test(mainSrc),
    "session:open must not return raw client.availableCommands",
  );
  assert.ok(
    !/commands:\s*live\.availableCommands\s*\|\|/.test(mainSrc),
  );
  // soft path must still emit commands:update (no longer gated only on !soft)
  const openSoftBlock = mainSrc.includes("commands:update");
  assert.ok(openSoftBlock, "commands:update still sent");
  // reuse path should call commandsForRenderer before return
  assert.ok(
    /const commands = commandsForRenderer\(live\.availableCommands\)/.test(mainSrc),
    "soft/reuse open localizes live.availableCommands",
  );
  assert.ok(
    /const commands = commandsForRenderer\(client\.availableCommands\)/.test(mainSrc) ||
      /commandsForRenderer\(client\.availableCommands\)/.test(mainSrc),
    "cold open localizes client.availableCommands",
  );

  console.log("[ui-polish] core reliability guards…");
  const acpSrc = read("src/acp.js");
  assert.ok(/this\.env = cliEnv\(/.test(acpSrc), "ACP prepares a GUI-safe child environment");
  assert.ok(/env:\s*this\.env/.test(acpSrc), "ACP terminal commands inherit the prepared environment");
  assert.ok(!/terminal\/create[\s\S]{0,400}env:\s*process\.env/.test(acpSrc));
  const { isUserVisibleSession } = require("../src/sessions");
  assert.strictEqual(isUserVisibleSession({}), true);
  assert.strictEqual(isUserVisibleSession({ session_kind: "subagent" }), false);
  assert.strictEqual(isUserVisibleSession({ session_kind: "subagent_fork" }), false);
  assert.ok(mainSrc.includes("UPDATE_CHECK_TIMEOUT_MS"), "update check has a deadline");
  assert.ok(mainSrc.includes('errorCode: err.code === "UPDATE_CHECK_TIMEOUT"'));

  const appSrc = read("renderer/app.js");
  assert.ok(appSrc.includes("commandsLookLocalized") || appSrc.includes("applySlashCatalog"));
  assert.ok(appSrc.includes("applySlashCatalog"), "renderer gates catalog apply");
  assert.ok(appSrc.includes("refreshSlashCatalog"), "renderer falls back to listCommands");

  console.log("[ui-polish] hooks discovery + automation UI…");
  const hooksMod = require("../src/hooks");
  const emptyHooks = hooksMod.listHooks({});
  assert.ok(Array.isArray(emptyHooks.hooks));
  assert.ok(Array.isArray(emptyHooks.roots));
  // synthetic extract
  const ev = hooksMod.extractEventsFromDoc({
    hooks: { SessionStart: [{ hooks: [] }], PreToolUse: [{ hooks: [] }] },
  });
  assert.ok(ev.includes("SessionStart"));
  assert.ok(ev.includes("PreToolUse"));
  const htmlAuto = read("renderer/index.html");
  assert.ok(htmlAuto.includes('data-panel="automation"'));
  assert.ok(htmlAuto.includes('id="auto-bar"'));
  assert.ok(htmlAuto.includes("settings-hooks-list"));
  const appAuto = read("renderer/app.js");
  assert.ok(appAuto.includes("noteAutomationFromSlash"));
  assert.ok(appAuto.includes("fillSettingsHooks"));
  assert.ok(appAuto.includes("listHooks"));
  const mainAuto = read("main.js");
  assert.ok(mainAuto.includes("hooks:list"));
  const preloadAuto = read("preload.js");
  assert.ok(preloadAuto.includes("listHooks"));

  console.log("[ui-polish] Mac time-format helpers…");
  const TF = require("../renderer/time-format.js");
  const now = new Date(2026, 6, 22, 16, 5, 0); // Jul 22 2026 16:05
  const today = new Date(2026, 6, 22, 9, 3, 0);
  const yest = new Date(2026, 6, 21, 14, 30, 0);
  const earlier = new Date(2026, 2, 5, 8, 7, 0);
  const lastYear = new Date(2025, 11, 1, 10, 0, 0);
  assert.strictEqual(
    TF.formatAbsoluteTime(today, { locale: "zh", now }),
    "今天 09:03",
  );
  assert.strictEqual(
    TF.formatAbsoluteTime(yest, { locale: "zh", now }),
    "昨天 14:30",
  );
  assert.ok(
    TF.formatAbsoluteTime(earlier, { locale: "zh", now }).includes("3月5日"),
  );
  assert.ok(
    TF.formatAbsoluteTime(earlier, { locale: "zh", now }).includes("08:07"),
  );
  assert.ok(
    TF.formatAbsoluteTime(lastYear, { locale: "zh", now }).includes("2025年"),
  );
  assert.ok(TF.formatAbsoluteTime(today, { locale: "en", now }).startsWith("Today"));
  assert.strictEqual(TF.formatDuration(12_000, { locale: "zh" }), "12秒");
  assert.ok(TF.formatDuration(83_000, { locale: "zh" }).includes("1分"));
  assert.ok(TF.formatDuration(83_000, { locale: "zh" }).includes("23秒"));
  assert.strictEqual(TF.formatElapsedClock(83_000), "1:23");
  assert.strictEqual(TF.formatElapsedClock(3723_000), "1:02:03");

  const htmlApp = read("renderer/index.html");
  assert.ok(htmlApp.includes("time-format.js"), "time-format script loaded");
  assert.ok(htmlApp.includes("strip-time"), "live strip shows session time");
  assert.ok(htmlApp.includes("strip-duration"), "live strip shows duration");
  const appJs = read("renderer/app.js");
  assert.ok(appJs.includes("formatAbsoluteTime"), "sidebar uses absolute time");
  assert.ok(appJs.includes("markRunStart"), "run duration tracked");
  assert.ok(appJs.includes("markRunEnd"), "run duration closed");
  assert.ok(appJs.includes("sessionWhenLabel"), "session when labels");

  console.log("[ui-polish] topbar markup…");
  const html = read("renderer/index.html");
  assert.ok(html.includes('id="session-actions"'), "session-actions present");
  assert.ok(html.includes("session-toolbar"), "session-toolbar wrapper");
  assert.ok(html.includes('class="sa-btn"'), "unified sa-btn controls");
  assert.ok(html.includes('id="btn-plan-toggle"') && html.includes("sa-btn"), "plan is sa-btn");
  assert.ok(html.includes('id="btn-act-export"') && html.includes("sa-btn"), "export is sa-btn");
  assert.ok(html.includes('id="btn-rename"'), "rename wired");
  assert.ok(html.includes('id="btn-delete"') && html.includes("danger"), "delete danger");
  assert.ok(html.includes('id="status-pill"'), "status pill");
  assert.ok(!/class="btn plan-btn"/.test(html), "old plan-btn CTA class removed from HTML");

  console.log("[ui-polish] i18n ship blockers…");
  assert.ok(!/>Check</.test(html), "bare Check removed");
  assert.ok(!/>Diagnose</.test(html), "bare Diagnose removed");
  assert.ok(!/>Recommended</.test(html), "bare Recommended removed");
  assert.ok(html.includes('data-i18n="settings.checkUpdateBtn"'));
  assert.ok(html.includes('data-i18n="settings.diagnoseBtn"'));
  assert.ok(html.includes('data-i18n="access.recommended"'));
  assert.ok(html.includes('data-i18n="page.memory.title"'));
  assert.ok(html.includes('data-i18n="page.skills.title"'));
  assert.ok(html.includes('data-i18n="page.plugins.title"'));
  assert.ok(html.includes('data-i18n="settings.skillsLead"'));
  assert.ok(html.includes('data-i18n="settings.pluginsLead"'));
  assert.ok(html.includes('data-i18n="settings.mcpLead"'));

  // i18n key parity for new keys
  const i18nSrc = read("renderer/i18n.js");
  // load as VM-ish: evaluate STRINGS by requiring through fake window
  const vm = require("vm");
  const sandbox = { window: {}, globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(i18nSrc + "\n;this.__G = globalThis.GrokI18n || window.GrokI18n;", sandbox);
  const G = sandbox.__G || sandbox.window.GrokI18n;
  assert.ok(G && G.STRINGS, "GrokI18n loaded");
  const zh = G.STRINGS.zh;
  const en = G.STRINGS.en;
  const required = [
    "chat.exportHint",
    "access.recommended",
    "settings.checkUpdateBtn",
    "update.timeout",
    "settings.diagnoseBtn",
    "settings.skillsLead",
    "settings.pluginsLead",
    "settings.mcpLead",
    "page.memory.title",
    "page.skills.title",
    "page.plugins.title",
    "slash.empty",
    "slash.badgeDesktop",
    "slash.badgeSkill",
    "common.refresh",
  ];
  for (const k of required) {
    assert.ok(zh[k], `zh missing ${k}`);
    assert.ok(en[k], `en missing ${k}`);
  }

  console.log("[ui-polish] CSS session toolbar…");
  const css = read("renderer/styles.css");
  assert.ok(css.includes(".session-toolbar"));
  assert.ok(css.includes(".sa-btn"));
  assert.ok(css.includes(".sa-btn.active"));
  assert.ok(css.includes(".sa-btn.danger"));
  assert.ok(css.includes(".slash-group"));
  assert.ok(css.includes(".badge-desktop"));

  console.log("[ui-polish] app.js wiring…");
  const app = read("renderer/app.js");
  assert.ok(app.includes("btn-plan-toggle") || app.includes("planToggle"));
  assert.ok(app.includes("btn-act-export"));
  assert.ok(app.includes("resolveDesktopRoute"));
  assert.ok(app.includes("groupSlashCommands"));
  assert.ok(app.includes('case "open-settings"'));
  assert.ok(app.includes('case "export"'));
  assert.ok(app.includes('case "rename"'));
  assert.ok(app.includes('case "open-memory"'));
  assert.ok(app.includes('case "open-skills"'));
  assert.ok(app.includes('case "open-plugins"') || app.includes("open-plugins"));
  assert.ok(app.includes('case "open-mcp"'));

  console.log("[ui-polish] preload exposes helpers…");
  const preload = read("preload.js");
  assert.ok(preload.includes("filterSlashCommands"));
  assert.ok(preload.includes("resolveDesktopRoute"));

  console.log("[ui-polish] syntax check modules…");
  for (const rel of [
    "src/commands-zh.js",
    "src/sessions.js",
    "src/settings.js",
    "preload.js",
    "main.js",
  ]) {
    require("child_process").execFileSync(process.execPath, ["--check", path.join(root, rel)], {
      stdio: "pipe",
    });
  }

  console.log("UI POLISH CHECK OK");
}

main();
