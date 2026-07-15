const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

function resolveGrokCli() {
  if (process.env.GROK_CLI) return process.env.GROK_CLI;
  const candidates = [
    path.join(process.env.HOME || "", ".local/bin/grok"),
    "/usr/local/bin/grok",
    "/usr/bin/grok",
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return "grok";
}

function runGrok(args, { timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const cli = resolveGrokCli();
    const child = spawn(cli, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      reject(new Error(`timeout: grok ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `exit ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function listInstalled() {
  try {
    const { stdout } = await runGrok(["plugin", "list", "--json"]);
    const data = JSON.parse(stdout || "[]");
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // empty list is normal
    if (/No plugins/i.test(err.message)) return [];
    // if json parse of empty
    return [];
  }
}

async function listAvailable() {
  try {
    const { stdout } = await runGrok(["plugin", "list", "--json", "--available"], {
      timeoutMs: 180_000,
    });
    const data = JSON.parse(stdout || "[]");
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return { error: err.message, items: [] };
  }
}

async function installPlugin(spec) {
  if (!spec || !String(spec).trim()) throw new Error("需要插件名 / git URL / 本地路径");
  const { stdout, stderr } = await runGrok(["plugin", "install", String(spec).trim()], {
    timeoutMs: 300_000,
  });
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function uninstallPlugin(name) {
  const { stdout, stderr } = await runGrok(["plugin", "uninstall", name], {
    timeoutMs: 120_000,
  });
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function enablePlugin(name) {
  const { stdout, stderr } = await runGrok(["plugin", "enable", name]);
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function disablePlugin(name) {
  const { stdout, stderr } = await runGrok(["plugin", "disable", name]);
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function pluginDetails(name) {
  const { stdout, stderr } = await runGrok(["plugin", "details", name]);
  return { ok: true, output: (stdout || stderr || "").trim() };
}

module.exports = {
  listInstalled,
  listAvailable,
  installPlugin,
  uninstallPlugin,
  enablePlugin,
  disablePlugin,
  pluginDetails,
  resolveGrokCli,
};
