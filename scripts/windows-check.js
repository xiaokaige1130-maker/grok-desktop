const assert = require("assert");
const {
  appConfigDir,
  commandExists,
  homeDir,
  resolveGrokCli,
  spawnCli,
} = require("../src/platform");

async function main() {
  assert.strictEqual(process.platform, "win32", "this check must run on Windows");
  const pkg = require("../package.json");
  assert.ok(pkg.build?.win, "missing Windows build config");

  const cli = resolveGrokCli();
  assert.ok(commandExists(cli), `Grok CLI not found: ${cli}`);
  assert.ok(appConfigDir().toLowerCase().includes("appdata"), "unexpected config directory");

  const version = await new Promise((resolve, reject) => {
    const child = spawnCli(cli, ["--version"], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(output.trim() || `exit ${code}`));
      else resolve(output.trim());
    });
  });

  console.log(`PACKAGE=${pkg.version}`);
  console.log(`HOME=${homeDir()}`);
  console.log(`CONFIG=${appConfigDir()}`);
  console.log(`CLI=${cli}`);
  console.log("CLI_EXISTS=true");
  console.log(`CLI_VERSION=${version}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
