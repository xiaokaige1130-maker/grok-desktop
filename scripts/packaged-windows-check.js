const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const appRoot =
  process.env.PACKAGED_APP_ROOT ||
  path.resolve(__dirname, "..", "release", "win-unpacked", "resources", "app.asar");
let pkg;
let platform;
let rendererSource;
let mainSource;
let tempDir = null;

if (appRoot.endsWith(".asar")) {
  const asar = require("@electron/asar");
  pkg = JSON.parse(asar.extractFile(appRoot, "package.json").toString("utf8"));
  rendererSource = asar.extractFile(appRoot, "renderer/app.js").toString("utf8");
  mainSource = asar.extractFile(appRoot, "main.js").toString("utf8");
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "grok-packaged-check-"));
  const platformPath = path.join(tempDir, "platform.js");
  fs.writeFileSync(platformPath, asar.extractFile(appRoot, "src/platform.js"));
  platform = require(platformPath);
} else {
  pkg = require(path.join(appRoot, "package.json"));
  rendererSource = fs.readFileSync(path.join(appRoot, "renderer", "app.js"), "utf8");
  mainSource = fs.readFileSync(path.join(appRoot, "main.js"), "utf8");
  platform = require(path.join(appRoot, "src", "platform"));
}

const cli = platform.resolveGrokCli();
assert.ok(platform.commandExists(cli), `packaged CLI lookup failed: ${cli}`);
assert.strictEqual(pkg.version, "0.8.9", `unexpected packaged version: ${pkg.version}`);
assert.ok(
  rendererSource.includes('className = "turn-action-icon turn-copy"'),
  "message copy action missing from package",
);
assert.ok(
  rendererSource.includes('className = "turn-action-icon turn-branch"'),
  "message task branch action missing from package",
);
assert.ok(
  rendererSource.includes('className = "turn-action-icon turn-memory"'),
  "message memory action missing from package",
);
assert.ok(rendererSource.includes("const sendGenerations = new Map()"), "per-session concurrency guard missing");
assert.ok(mainSource.includes('memory:listEntries'), "memory management IPC missing from package");

console.log(`PACKAGED_VERSION=${pkg.version}`);
console.log(`PACKAGED_CLI=${cli}`);
console.log("PACKAGED_CLI_EXISTS=true");

if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
