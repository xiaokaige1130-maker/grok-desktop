const assert = require("assert");
const path = require("path");

const appRoot =
  process.env.PACKAGED_APP_ROOT ||
  path.resolve(__dirname, "..", "release", "win-unpacked", "resources", "app.asar");
const pkg = require(path.join(appRoot, "package.json"));
const platform = require(path.join(appRoot, "src", "platform"));

const cli = platform.resolveGrokCli();
assert.ok(platform.commandExists(cli), `packaged CLI lookup failed: ${cli}`);

console.log(`PACKAGED_VERSION=${pkg.version}`);
console.log(`PACKAGED_CLI=${cli}`);
console.log("PACKAGED_CLI_EXISTS=true");
