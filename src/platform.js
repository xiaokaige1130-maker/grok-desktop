const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const APP_DATA_NAME = process.platform === "linux" ? "linux-grok-desktop" : "grok-desktop";

function homeDir() {
  return (
    os.homedir() ||
    process.env.HOME ||
    process.env.USERPROFILE ||
    (process.env.HOMEDRIVE && process.env.HOMEPATH
      ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}`
      : "") ||
    process.cwd()
  );
}

function defaultCwd() {
  const home = homeDir();
  return home && fs.existsSync(home) ? home : process.cwd();
}

function appConfigDir() {
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA || path.join(homeDir(), "AppData", "Roaming"),
      APP_DATA_NAME,
    );
  }
  if (process.platform === "darwin") {
    return path.join(homeDir(), "Library", "Application Support", APP_DATA_NAME);
  }
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(homeDir(), ".config"),
    APP_DATA_NAME,
  );
}

function stripQuotes(value) {
  return String(value || "").replace(/^["']|["']$/g, "");
}

function existingWindowsCandidates() {
  const home = homeDir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  return [
    path.join(home, ".grok", "bin", "grok.exe"),
    path.join(home, ".grok", "bin", "grok.cmd"),
    path.join(appData, "npm", "grok.cmd"),
    path.join(appData, "npm", "grok.exe"),
    path.join(localAppData, "Programs", "grok", "grok.exe"),
    path.join(localAppData, "grok", "grok.exe"),
    path.join(home, ".local", "bin", "grok.cmd"),
    path.join(home, ".local", "bin", "grok.exe"),
  ];
}

function resolveGrokCli() {
  if (process.env.GROK_CLI) return stripQuotes(process.env.GROK_CLI);
  const candidates =
    process.platform === "win32"
      ? existingWindowsCandidates()
      : [
          path.join(homeDir(), ".local", "bin", "grok"),
          "/usr/local/bin/grok",
          "/usr/bin/grok",
        ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return process.platform === "win32" ? "grok.cmd" : "grok";
}

function commandExists(command) {
  const cmd = stripQuotes(command);
  if (!cmd) return false;
  if (cmd.includes(path.sep) || (path.sep === "\\" && cmd.includes("/"))) {
    return fs.existsSync(cmd);
  }
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(finder, [cmd], { stdio: "ignore" });
  return result.status === 0;
}

function shouldUseShell(command) {
  if (process.platform !== "win32") return false;
  const ext = path.extname(stripQuotes(command)).toLowerCase();
  return !ext || ext === ".cmd" || ext === ".bat";
}

function spawnCli(command, args = [], options = {}) {
  const opts = { ...options };
  if (shouldUseShell(command) && opts.shell == null) opts.shell = true;
  return spawn(stripQuotes(command), args, opts);
}

module.exports = {
  APP_DATA_NAME,
  appConfigDir,
  commandExists,
  defaultCwd,
  homeDir,
  resolveGrokCli,
  spawnCli,
};
