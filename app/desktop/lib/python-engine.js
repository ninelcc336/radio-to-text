const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { getRuntimePaths } = require("./runtime-paths");

function normalizeEngineRequestValue(key, value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeEngineRequestValue("", item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeEngineRequestValue(entryKey, entryValue)
      ])
    );
  }

  if (
    typeof value === "string" &&
    /(?:path|dir)$/i.test(key) &&
    value.includes("\\")
  ) {
    return value.replace(/\\/g, "/");
  }

  return value;
}

function normalizeEngineRequest(request) {
  if (!request || typeof request !== "object") {
    return request || {};
  }

  return normalizeEngineRequestValue("", request);
}

async function appendEngineLog(logsDir, message) {
  try {
    await fs.mkdir(logsDir, { recursive: true });
    await fs.appendFile(
      path.join(logsDir, "engine.log"),
      `[${new Date().toISOString()}] ${message}\n`,
      "utf8"
    );
  } catch (_error) {
    // 记录日志失败不应再覆盖原始业务错误。
  }
}

async function createEngineIpcFiles(runtimePaths, request) {
  const ipcDir = path.join(runtimePaths.cacheRootDir, "engine-ipc");
  const requestPath = path.join(
    ipcDir,
    `request-${Date.now()}-${crypto.randomUUID()}.json`
  );
  const responsePath = path.join(
    ipcDir,
    `response-${Date.now()}-${crypto.randomUUID()}.json`
  );

  await fs.mkdir(ipcDir, { recursive: true });
  await fs.writeFile(requestPath, JSON.stringify(request), "utf8");

  return {
    requestPath,
    responsePath
  };
}

async function cleanupEngineIpcFiles(ipcFiles) {
  if (!ipcFiles) {
    return;
  }

  await Promise.all([
    fs.rm(ipcFiles.requestPath, { force: true }).catch(() => {}),
    fs.rm(ipcFiles.responsePath, { force: true }).catch(() => {})
  ]);
}

async function readEngineResponseText(ipcFiles, stdout) {
  if (!ipcFiles) {
    return stdout;
  }

  try {
    return await fs.readFile(ipcFiles.responsePath, "utf8");
  } catch (_error) {
    return stdout;
  }
}

async function runEngineRequest(request, options = {}) {
  const runtimePaths =
    options.runtimePaths ||
    getRuntimePaths({
      isPackaged: false
    });
  const isPackagedEngine = path.extname(runtimePaths.engineEntry).toLowerCase() === ".exe";
  const command = isPackagedEngine ? runtimePaths.engineEntry : "python";
  const args = isPackagedEngine ? [] : ["-X", "utf8", runtimePaths.engineEntry];
  const childCwd = isPackagedEngine
    ? path.dirname(runtimePaths.engineEntry)
    : runtimePaths.rootDir;
  const normalizedRequest = normalizeEngineRequest(request);
  const ipcFiles = isPackagedEngine
    ? await createEngineIpcFiles(runtimePaths, normalizedRequest)
    : null;

  try {
    const { code, stdout, stderr } = await new Promise((resolve, reject) => {
      // 每次请求都启动一个独立 Python 进程，避免桌面层和模型状态强耦合。
      const child = spawn(command, args, {
        cwd: childCwd,
        stdio: ipcFiles ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          RTT_ROOT_DIR: runtimePaths.rootDir,
          RTT_TASKS_DIR: runtimePaths.tasksDir,
          RTT_LOG_DIR: runtimePaths.logsDir,
          RTT_CACHE_ROOT_DIR: runtimePaths.cacheRootDir,
          RTT_MODEL_CACHE_DIR: runtimePaths.modelCacheDir,
          RTT_DISTRIBUTION_VARIANT: runtimePaths.distributionVariant || "lite",
          RTT_ASR_MODEL_DIR: runtimePaths.bundledModelDir || "",
          RTT_REQUIRE_BUNDLED_MODEL: runtimePaths.bundledModelRequired ? "1" : "0",
          RTT_ENGINE_REQUEST_FILE: ipcFiles ? ipcFiles.requestPath : "",
          RTT_ENGINE_RESPONSE_FILE: ipcFiles ? ipcFiles.responsePath : "",
          HF_HOME: runtimePaths.huggingfaceHomeDir,
          HUGGINGFACE_HUB_CACHE: runtimePaths.modelCacheDir,
          TRANSFORMERS_CACHE: runtimePaths.modelCacheDir,
          XDG_CACHE_HOME: runtimePaths.cacheRootDir
        }
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", async (error) => {
        await appendEngineLog(
          runtimePaths.logsDir,
          `Engine process failed to start: ${error.message}`
        );
        reject(
          new Error(
            isPackagedEngine
              ? `无法启动本地转写引擎：${error.message}`
              : error.message
          )
        );
      });

      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });

      if (!ipcFiles) {
        // 开发态继续走标准输入，便于命令行直连调试。
        child.stdin.write(JSON.stringify(normalizedRequest));
        child.stdin.end();
      }
    });

    if (stderr.trim()) {
      await appendEngineLog(runtimePaths.logsDir, stderr.trim());
    }

    const responseText = await readEngineResponseText(ipcFiles, stdout);

    let parsedResponse = null;
    try {
      // Python 统一返回 JSON，桌面层只做协议解析，不参与业务判断。
      parsedResponse = JSON.parse(responseText);
    } catch (error) {
      if (code !== 0) {
        throw new Error(
          stderr ||
            `Python engine exited with code ${code}. Logs: ${path.join(
              runtimePaths.logsDir,
              "engine.log"
            )}`
        );
      }

      await appendEngineLog(
        runtimePaths.logsDir,
        `Failed to parse engine response: ${error.message}\n${responseText}`
      );
      throw new Error(`Failed to parse Python engine response: ${error.message}`);
    }

    if (code !== 0) {
      const engineMessage =
        parsedResponse &&
        parsedResponse.error &&
        typeof parsedResponse.error.message === "string" &&
        parsedResponse.error.message.trim()
          ? parsedResponse.error.message.trim()
          : "";

      if (engineMessage) {
        await appendEngineLog(
          runtimePaths.logsDir,
          `Engine request failed (code ${code}): ${engineMessage}`
        );
        throw new Error(engineMessage);
      }

      throw new Error(
        stderr ||
          `Python engine exited with code ${code}. Logs: ${path.join(
            runtimePaths.logsDir,
            "engine.log"
          )}`
      );
    }

    return parsedResponse;
  } finally {
    await cleanupEngineIpcFiles(ipcFiles);
  }
}

module.exports = {
  normalizeEngineRequest,
  runEngineRequest
};
