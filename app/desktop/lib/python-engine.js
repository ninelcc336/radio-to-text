const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const { getRuntimePaths } = require("./runtime-paths");

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

function runEngineRequest(request, options = {}) {
  return new Promise((resolve, reject) => {
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

    // 每次请求都启动一个独立 Python 进程，避免桌面层和模型状态强耦合。
    const child = spawn(command, args, {
      cwd: childCwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        RTT_ROOT_DIR: runtimePaths.rootDir,
        RTT_TASKS_DIR: runtimePaths.tasksDir,
        RTT_LOG_DIR: runtimePaths.logsDir,
        RTT_CACHE_ROOT_DIR: runtimePaths.cacheRootDir,
        RTT_MODEL_CACHE_DIR: runtimePaths.modelCacheDir,
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

    child.on("error", (error) => {
      void appendEngineLog(
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
      if (stderr.trim()) {
        void appendEngineLog(runtimePaths.logsDir, stderr.trim());
      }

      if (code !== 0) {
        reject(
          new Error(
            stderr ||
              `Python engine exited with code ${code}. Logs: ${path.join(
                runtimePaths.logsDir,
                "engine.log"
              )}`
          )
        );
        return;
      }

      try {
        // Python 统一返回 JSON，桌面层只做协议解析，不参与业务判断。
        resolve(JSON.parse(stdout));
      } catch (error) {
        void appendEngineLog(
          runtimePaths.logsDir,
          `Failed to parse engine response: ${error.message}\n${stdout}`
        );
        reject(
          new Error(`Failed to parse Python engine response: ${error.message}`)
        );
      }
    });

    // 请求体通过标准输入传给 Python，避免拼接命令参数导致转义问题。
    child.stdin.write(JSON.stringify(request || {}));
    child.stdin.end();
  });
}

module.exports = {
  runEngineRequest
};
