const fs = require("fs");
const path = require("path");
const { getWebRuntimePaths } = require("../lib/runtime-paths");

const enginePath = path.resolve(__dirname, "../../../dist-python/engine/engine.exe");
const webPaths = getWebRuntimePaths();
const standaloneServerPath = path.join(webPaths.workspaceStandaloneDir, "server.js");
const staticDirPath = webPaths.workspaceStaticDir;

if (!fs.existsSync(enginePath)) {
  console.error(`Python engine build is missing: ${enginePath}`);
  process.exit(1);
}

if (!fs.existsSync(standaloneServerPath)) {
  console.error(`Next standalone build is missing: ${standaloneServerPath}`);
  process.exit(1);
}

if (!fs.existsSync(staticDirPath)) {
  console.error(`Next static assets are missing: ${staticDirPath}`);
  process.exit(1);
}

console.log(`Verified Python engine build: ${enginePath}`);
console.log(`Verified Next standalone build: ${standaloneServerPath}`);
console.log(`Verified Next static assets: ${staticDirPath}`);
