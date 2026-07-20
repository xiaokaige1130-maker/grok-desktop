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

/**
 * macOS/Linux install locations. GUI apps launched from Finder/Dock often have a
 * minimal PATH, so we probe absolute paths instead of relying on `which`.
 */
function existingUnixCandidates() {
  const home = homeDir();
  return [
    path.join(home, ".grok", "bin", "grok"), // official install.sh default
    path.join(home, ".local", "bin", "grok"), // common user bin / symlink
    "/opt/homebrew/bin/grok", // Apple Silicon Homebrew
    "/usr/local/bin/grok", // Intel Homebrew / manual
    "/usr/bin/grok",
  ];
}

/**
 * Directories that should be on PATH when spawning the CLI from a GUI app.
 * macOS Dock-launched apps typically only get /usr/bin:/bin:/usr/sbin:/sbin.
 */
function extraCliPathDirs() {
  const home = homeDir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [
      path.join(home, ".grok", "bin"),
      path.join(home, ".local", "bin"),
      path.join(appData, "npm"),
      path.join(localAppData, "Programs", "grok"),
    ];
  }
  return [
    path.join(home, ".grok", "bin"),
    path.join(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
}

/** Env for CLI child processes — ensures grok is findable from Dock-launched app. */
function cliEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  const key = process.platform === "win32" && env.Path && !env.PATH ? "Path" : "PATH";
  const current = String(env[key] || env.PATH || env.Path || "");
  const parts = current.split(path.delimiter).filter(Boolean);
  const seen = new Set(parts);
  for (const dir of extraCliPathDirs().reverse()) {
    if (dir && !seen.has(dir)) {
      parts.unshift(dir);
      seen.add(dir);
    }
  }
  env[key] = parts.join(path.delimiter);
  if (key === "Path" && env.PATH == null) env.PATH = env[key];
  return env;
}

function resolveGrokCli() {
  if (process.env.GROK_CLI) return stripQuotes(process.env.GROK_CLI);
  const candidates =
    process.platform === "win32" ? existingWindowsCandidates() : existingUnixCandidates();
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  // Fall back to PATH lookup with augmented dirs (GUI apps need this on macOS)
  const whichEnv = cliEnv(process.env);
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const name = process.platform === "win32" ? "grok.cmd" : "grok";
  try {
    const result = spawnSync(finder, [name], {
      stdio: ["ignore", "pipe", "ignore"],
      env: whichEnv,
      encoding: "utf8",
    });
    const line = String(result.stdout || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    if (line && fs.existsSync(line)) return line;
  } catch {
    /* ignore */
  }
  return name;
}

function commandExists(command) {
  const cmd = stripQuotes(command);
  if (!cmd) return false;
  if (cmd.includes(path.sep) || (process.platform === "win32" && cmd.includes("/"))) {
    try {
      return fs.existsSync(cmd);
    } catch {
      return false;
    }
  }
  const finder = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(finder, [cmd], {
    stdio: "ignore",
    env: cliEnv(process.env),
  });
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
  // Always give CLI children a usable PATH (Dock-launched macOS apps are sparse)
  opts.env = cliEnv(opts.env || process.env);
  return spawn(stripQuotes(command), args, opts);
}

module.exports = {
  APP_DATA_NAME,
  appConfigDir,
  cliEnv,
  commandExists,
  defaultCwd,
  homeDir,
  resolveGrokCli,
  spawnCli,
};
