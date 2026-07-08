const fs = require("fs");
const path = require("path");

function workspaceRoot() {
  return path.resolve(__dirname, "../../..");
}

function resolvePathOverride(envName, fallbackPath) {
  const rawValue = process.env[envName];
  if (!rawValue) {
    return path.resolve(fallbackPath);
  }
  return path.resolve(rawValue);
}

function getRuntimePaths(options = {}) {
  const isPackaged = Boolean(options.isPackaged);
  const defaultRootDir = isPackaged
    ? path.resolve(options.userDataDir || workspaceRoot())
    : workspaceRoot();
  const rootDir = resolvePathOverride("RTT_ROOT_DIR", defaultRootDir);
  const tasksDir = resolvePathOverride("RTT_TASKS_DIR", path.join(rootDir, "tasks"));
  const logsDir = resolvePathOverride("RTT_LOG_DIR", path.join(rootDir, "logs"));
  const cacheRootDir = resolvePathOverride(
    "RTT_CACHE_ROOT_DIR",
    path.join(rootDir, "cache")
  );
  const modelCacheDir = resolvePathOverride(
    "RTT_MODEL_CACHE_DIR",
    path.join(cacheRootDir, "models")
  );
  const huggingfaceHomeDir = resolvePathOverride(
    "HF_HOME",
    path.join(cacheRootDir, "huggingface")
  );
  const engineEntry = isPackaged
    ? path.join(options.resourcesPath || process.resourcesPath || workspaceRoot(), "engine", "engine.exe")
    : path.join(workspaceRoot(), "engine", "python", "main.py");

  return {
    isPackaged,
    rootDir,
    tasksDir,
    logsDir,
    cacheRootDir,
    modelCacheDir,
    huggingfaceHomeDir,
    engineEntry
  };
}

function ensureRuntimeDirs(runtimePaths) {
  for (const target of [
    runtimePaths.rootDir,
    runtimePaths.tasksDir,
    runtimePaths.logsDir,
    runtimePaths.cacheRootDir,
    runtimePaths.modelCacheDir,
    runtimePaths.huggingfaceHomeDir
  ]) {
    fs.mkdirSync(target, { recursive: true });
  }
}

module.exports = {
  ensureRuntimeDirs,
  getRuntimePaths,
  workspaceRoot
};
