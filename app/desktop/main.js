const path = require("path");
const fs = require("fs/promises");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const { runEngineRequest } = require("./lib/python-engine");
const { startNextServer, waitForUrl } = require("./lib/next-server");
const { ensureRuntimeDirs, getRuntimePaths } = require("./lib/runtime-paths");
const { createSettingsStore } = require("./lib/settings-store");

const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a"]);
const DEFAULT_WINDOW_RATIO = 16 / 9;
const MIN_WINDOW_WIDTH = 1280;
const MIN_WINDOW_HEIGHT = Math.round(MIN_WINDOW_WIDTH / DEFAULT_WINDOW_RATIO);
const DEFAULT_WEB_PORT = 3000;
const DEFAULT_WEB_URL = `http://127.0.0.1:${DEFAULT_WEB_PORT}`;

let activeWebServer = null;

function isDevelopmentMode() {
  // 如果脚本显式传了 NODE_ENV，就优先按脚本意图判断。
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV === "development";
  }

  // 未显式指定环境时，再退回到 Electron 的打包状态判断。
  return !app.isPackaged;
}

async function disposeActiveWebServer() {
  if (!activeWebServer) {
    return;
  }

  const server = activeWebServer;
  activeWebServer = null;
  await server.dispose();
}

function getLegacyRendererPath() {
  return path.join(__dirname, "renderer", "index.html");
}

async function loadLegacyRenderer(window) {
  await window.loadFile(getLegacyRendererPath());
}

async function findStandaloneWebDir() {
  const candidates = [
    path.join(process.resourcesPath, "web"),
    path.join(__dirname, "web", ".next", "standalone")
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "server.js"));
      return candidate;
    } catch (_error) {
      // 当前候选不存在时继续尝试下一个。
    }
  }

  return null;
}

async function loadRenderer(window) {
  if (isDevelopmentMode()) {
    const devUrl = process.env.RTT_WEB_URL || DEFAULT_WEB_URL;
    try {
      await waitForUrl(devUrl, 30000);
      await window.loadURL(devUrl);
      return;
    } catch (error) {
      console.warn(`[desktop] Next dev server unavailable, fallback to legacy renderer: ${error.message}`);
    }
  } else {
    const standaloneDir = await findStandaloneWebDir();
    if (standaloneDir) {
      const port = Number(process.env.RTT_WEB_PORT) || DEFAULT_WEB_PORT;
      try {
        activeWebServer = await startNextServer({
          cwd: standaloneDir,
          port
        });
        await window.loadURL(activeWebServer.url);
        return;
      } catch (error) {
        console.warn(`[desktop] Next standalone unavailable, fallback to legacy renderer: ${error.message}`);
        await disposeActiveWebServer();
      }
    }
  }

  await loadLegacyRenderer(window);
}

// 主窗口只负责承载页面，业务处理统一走本地 Python 引擎。
async function createWindow() {
  const isDev = isDevelopmentMode();
  const { width, height } = getDefaultWindowSize();
  const window = new BrowserWindow({
    width,
    height,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    autoHideMenuBar: !isDev,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 开发模式保留菜单，方便调试；生产模式隐藏菜单，让界面更像独立客户端。
  if (!isDev && process.platform !== "darwin") {
    window.removeMenu();
  }

  window.on("closed", () => {
    setImmediate(() => {
      if (BrowserWindow.getAllWindows().length === 0) {
        void disposeActiveWebServer();
      }
    });
  });

  await loadRenderer(window);
  return window;
}

function getDefaultWindowSize() {
  const cursorPoint = screen.getCursorScreenPoint();
  const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
  const { width: workAreaWidth, height: workAreaHeight } = currentDisplay.workAreaSize;
  const targetWidth = Math.max(Math.round(workAreaWidth * 0.7), MIN_WINDOW_WIDTH);
  const width = Math.min(targetWidth, workAreaWidth);
  const height = Math.min(Math.round(width / DEFAULT_WINDOW_RATIO), workAreaHeight);
  const fittedWidth = Math.round(Math.min(width, height * DEFAULT_WINDOW_RATIO));
  const fittedHeight = Math.round(fittedWidth / DEFAULT_WINDOW_RATIO);

  return {
    width: fittedWidth,
    height: fittedHeight
  };
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function resolveTaskAudioSource(payload, runtimePaths) {
  const taskId = String(payload?.taskId || "").trim();
  if (!taskId) {
    return {
      available: false,
      reason: "未提供任务 ID。"
    };
  }

  const tasksDir = runtimePaths.tasksDir;
  const taskDir = path.join(tasksDir, taskId);
  const sourceDir = path.join(taskDir, "source");
  const candidates = [];
  const preferredPath = payload?.sourcePath ? path.resolve(payload.sourcePath) : null;

  if (!isPathInside(tasksDir, taskDir)) {
    return {
      available: false,
      reason: "任务目录不合法。"
    };
  }

  if (preferredPath && isPathInside(taskDir, preferredPath)) {
    candidates.push(preferredPath);
  }

  for (const extension of SUPPORTED_AUDIO_EXTENSIONS) {
    candidates.push(path.join(sourceDir, `original${extension}`));
  }

  for (const candidate of [...new Set(candidates)]) {
    const resolved = path.resolve(candidate);
    const extension = path.extname(resolved).toLowerCase();
    if (!SUPPORTED_AUDIO_EXTENSIONS.has(extension)) {
      continue;
    }
    if (!isPathInside(taskDir, resolved)) {
      continue;
    }

    try {
      await fs.access(resolved);
      return {
        available: true,
        path: resolved,
        url: pathToFileURL(resolved).toString(),
        extension,
        fileName: path.basename(resolved)
      };
    } catch (_error) {
      // 候选路径不存在时继续尝试下一个。
    }
  }

  return {
    available: false,
    reason: "当前任务没有可播放音频。"
  };
}

app.whenReady().then(async () => {
  const runtimePaths = getRuntimePaths({
    isPackaged: app.isPackaged,
    userDataDir: app.getPath("userData"),
    resourcesPath: process.resourcesPath
  });
  ensureRuntimeDirs(runtimePaths);
  const settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));

  // 页面所有业务请求都通过一个统一 IPC 通道转发给 Python。
  ipcMain.handle("engine:request", async (_event, request) => {
    return runEngineRequest(request, { runtimePaths });
  });

  // 选择音频文件也放在主进程做，避免渲染层直接接触 Node 能力。
  ipcMain.handle("dialog:select-audio", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Audio",
          extensions: ["mp3", "wav", "m4a"]
        }
      ]
    });
    return result;
  });

  ipcMain.handle("dialog:save-text", async (_event, payload) => {
    const saveResult = await dialog.showSaveDialog({
      title: payload?.title || "保存文件",
      defaultPath: payload?.defaultFileName || "transcript.txt",
      filters: payload?.filters || [
        {
          name: "Text",
          extensions: ["txt"]
        }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return saveResult;
    }

    await fs.writeFile(saveResult.filePath, payload?.content || "", "utf8");
    return saveResult;
  });

  ipcMain.handle("media:resolve-task-audio", async (_event, payload) => {
    return resolveTaskAudioSource(payload, runtimePaths);
  });

  ipcMain.handle("settings:get", async () => {
    return settingsStore.get();
  });

  ipcMain.handle("settings:set", async (_event, payload) => {
    return settingsStore.set(payload);
  });

  await createWindow();

  // macOS 上关闭窗口后保留应用，重新激活时再创建新窗口。
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("before-quit", () => {
  void disposeActiveWebServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
