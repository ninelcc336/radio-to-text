const path = require("path");
const { spawn } = require("child_process");

function runEngineRequest(request) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, "../../../engine/python/main.py");
    // 每次请求都启动一个独立 Python 进程，避免桌面层和模型状态强耦合。
    const child = spawn("python", ["-X", "utf8", scriptPath], {
      cwd: path.resolve(__dirname, "../../.."),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8"
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
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python engine exited with code ${code}`));
        return;
      }

      try {
        // Python 统一返回 JSON，桌面层只做协议解析，不参与业务判断。
        resolve(JSON.parse(stdout));
      } catch (error) {
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
