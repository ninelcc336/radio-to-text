const path = require("path");
const { spawn } = require("child_process");

function runEngineRequest(request) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(__dirname, "../../../engine/python/main.py");
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
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(`Failed to parse Python engine response: ${error.message}`)
        );
      }
    });

    child.stdin.write(JSON.stringify(request || {}));
    child.stdin.end();
  });
}

module.exports = {
  runEngineRequest
};
