const { resolveGrokCli } = require("./plugins");
const { commandExists, spawnCli } = require("./platform");

function run(args, { timeoutMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const cli = resolveGrokCli();
    if (!commandExists(cli)) {
      reject(
        new Error(
          `未找到 Grok CLI：${cli}。请先安装并登录官方 Grok CLI，或设置 GROK_CLI 为完整路径。`,
        ),
      );
      return;
    }
    const child = spawnCli(cli, args, {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const t = setTimeout(() => {
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
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `exit ${code}`));
        return;
      }
      resolve({ stdout, stderr, code });
    });
  });
}

async function listMcp() {
  try {
    const { stdout } = await run(["mcp", "list"]);
    const text = stdout.trim();
    if (!text || /No MCP servers/i.test(text)) return { servers: [], raw: text };
    // parse lines best-effort
    const servers = [];
    for (const line of text.split("\n")) {
      const m = line.match(/^[\s\-\*]*(\S+)/);
      if (m && !/^(name|server|mcp)/i.test(m[1])) {
        servers.push({ name: m[1], line: line.trim() });
      }
    }
    return { servers, raw: text };
  } catch (err) {
    return { servers: [], raw: "", error: err.message };
  }
}

async function addMcp(name, command, args = []) {
  if (!name || !command) throw new Error("需要名称和命令");
  const a = ["mcp", "add", name, command, ...args];
  const { stdout, stderr } = await run(a, { timeoutMs: 120_000 });
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function removeMcp(name) {
  if (!name) throw new Error("需要名称");
  const { stdout, stderr } = await run(["mcp", "remove", name]);
  return { ok: true, output: (stdout || stderr || "").trim() };
}

async function doctorMcp() {
  const { stdout, stderr } = await run(["mcp", "doctor"], { timeoutMs: 120_000 });
  return { ok: true, output: (stdout || stderr || "").trim() };
}

module.exports = { listMcp, addMcp, removeMcp, doctorMcp };
