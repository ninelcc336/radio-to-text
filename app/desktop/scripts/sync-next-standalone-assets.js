const fs = require("fs");
const path = require("path");
const { getWebRuntimePaths } = require("../lib/runtime-paths");

function ensureExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} not found: ${targetPath}`);
  }
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, {
    force: true,
    recursive: true
  });
}

function main() {
  const webPaths = getWebRuntimePaths();
  const standaloneServerPath = path.join(webPaths.workspaceStandaloneDir, "server.js");

  ensureExists(standaloneServerPath, "Next standalone server");
  ensureExists(webPaths.workspaceStaticDir, "Next static assets");

  copyDirectory(webPaths.workspaceStaticDir, webPaths.workspaceStandaloneStaticDir);

  console.log(`Synced Next static assets to standalone: ${webPaths.workspaceStandaloneStaticDir}`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
