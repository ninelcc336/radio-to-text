const { spawn } = require("child_process");

function spawnScript(command, args) {
  return spawn(command, args, {
    stdio: "inherit",
    shell: true
  });
}

const web = spawnScript("npm", ["run", "dev:web"]);
const desktop = spawnScript("npm", ["run", "dev:desktop"]);

let shuttingDown = false;

function stopProcess(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  child.kill();
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  stopProcess(web);
  stopProcess(desktop);
  process.exit(code);
}

desktop.on("exit", (code) => {
  shutdown(code ?? 0);
});

web.on("exit", (code) => {
  shutdown(code ?? 0);
});

process.on("SIGINT", () => {
  shutdown(130);
});

process.on("SIGTERM", () => {
  shutdown(143);
});
