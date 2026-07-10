const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function requestUrl(url) {
  const client = url.startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      response.resume();
      resolve();
    });

    request.on("error", reject);
  });
}

async function waitForUrl(url, timeoutMs = 15000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    try {
      await requestUrl(url);
      return;
    } catch (_error) {
      await wait(250);
    }
  }

  throw new Error(`Next server not ready: ${url}`);
}

function waitForChildExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    child.once("exit", () => {
      resolve();
    });
  });
}

async function startNextServer({ cwd, port, hostname = "127.0.0.1" }) {
  const serverPath = path.join(cwd, "server.js");
  await fs.access(serverPath);

  let stderr = "";
  const child = spawn(process.execPath, [serverPath], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: {
      ...process.env,
      // 打包后 process.execPath 指向应用自身的 EXE，需要强制让 Electron 以 Node 模式执行 server.js。
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: hostname,
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port)
    }
  });

  if (child.stdout) {
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
  }

  const url = `http://${hostname}:${port}`;

  try {
    await waitForUrl(url);
  } catch (error) {
    child.kill();
    await waitForChildExit(child);
    const detail = stderr.trim() ? `\n${stderr.trim()}` : "";
    throw new Error(`${error.message}${detail}`);
  }

  return {
    url,
    async dispose() {
      if (child.exitCode !== null || child.killed) {
        return;
      }

      child.kill();
      await waitForChildExit(child);
    }
  };
}

module.exports = {
  startNextServer,
  waitForUrl
};
