const path = require("path");
const { spawn } = require("child_process");

function workspaceRoot() {
  return path.resolve(__dirname, "../../..");
}

function getElectronBinaryPath() {
  const executableName = process.platform === "win32" ? "electron.exe" : "electron";
  return path.join(workspaceRoot(), "node_modules", "electron", "dist", executableName);
}

function runElectronSmoke() {
  const electronPath = getElectronBinaryPath();
  const cwd = workspaceRoot();

  return new Promise((resolve, reject) => {
    const child = spawn(electronPath, ["."], {
      cwd,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        RTT_SMOKE_TEST: "1",
        RTT_REQUIRE_NEXT_RENDERER: "1",
        RTT_WEB_PORT: "3000"
      }
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Electron smoke exited with code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  await runElectronSmoke();
  console.log("Electron smoke passed.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
