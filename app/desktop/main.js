const path = require("path");
const nativeFs = require("fs");
const fs = require("fs/promises");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const { Readable } = require("stream");
const { app, BrowserWindow, dialog, ipcMain, protocol, screen } = require("electron");
const appConfig = require("../shared/app-config.json");
const { runEngineRequest } = require("./lib/python-engine");
const { startNextServer, waitForUrl } = require("./lib/next-server");
const {
  ensureRuntimeDirs,
  getRuntimePaths,
  getWebRuntimePaths
} = require("./lib/runtime-paths");
const { createSettingsStore } = require("./lib/settings-store");

const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a"]);
const DEFAULT_WINDOW_RATIO = 16 / 9;
const MIN_WINDOW_WIDTH = 1280;
const MIN_WINDOW_HEIGHT = Math.round(MIN_WINDOW_WIDTH / DEFAULT_WINDOW_RATIO);
const DEFAULT_WEB_PORT = 3000;
const DEFAULT_WEB_URL = `http://127.0.0.1:${DEFAULT_WEB_PORT}`;
const TASK_MEDIA_SCHEME = "rtt-media";

let activeWebServer = null;

protocol.registerSchemesAsPrivileged([
  {
    scheme: TASK_MEDIA_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true
    }
  }
]);

function isDevelopmentMode() {
  // 如果脚本显式传了 NODE_ENV，就优先按脚本意图判断。
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV === "development";
  }

  // 未显式指定环境时，再退回到 Electron 的打包状态判断。
  return !app.isPackaged;
}

function isSmokeTestMode() {
  return process.env.RTT_SMOKE_TEST === "1";
}

function shouldRequireNextRenderer() {
  return process.env.RTT_REQUIRE_NEXT_RENDERER === "1";
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
  const webPaths = getWebRuntimePaths({
    resourcesPath: process.resourcesPath
  });
  const candidates = [webPaths.packagedStandaloneDir, webPaths.workspaceStandaloneDir];

  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, "server.js"));
      await fs.access(path.join(candidate, ".next", "static"));
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
      if (shouldRequireNextRenderer()) {
        throw error;
      }
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
        if (shouldRequireNextRenderer()) {
          throw error;
        }
        console.warn(`[desktop] Next standalone unavailable, fallback to legacy renderer: ${error.message}`);
        await disposeActiveWebServer();
      }
    } else if (shouldRequireNextRenderer()) {
      throw new Error("Next standalone build not found.");
    }
  }

  await loadLegacyRenderer(window);
}

async function runSmokeAssertions(window) {
  const details = await window.webContents.executeJavaScript(
    `
      (async () => {
        const hasDesktopApi = Boolean(window.desktopApi);
        const hasTaskList = typeof window.desktopApi?.tasks?.list === "function";
        const hasEngineHealth = typeof window.desktopApi?.engine?.health === "function";
        const hasSettingsGet = typeof window.desktopApi?.settings?.get === "function";
        const settings = hasSettingsGet ? await window.desktopApi.settings.get() : null;
        const stylesheetLinks = Array.from(
          document.querySelectorAll('link[rel="stylesheet"]')
        ).map((node) => node.href);
        const stylesheetStatuses = await Promise.all(
          stylesheetLinks.map(async (href) => {
            try {
              const response = await fetch(href, { cache: "no-store" });
              return {
                href,
                ok: response.ok,
                status: response.status
              };
            } catch (error) {
              return {
                href,
                ok: false,
                status: 0,
                error: error.message
              };
            }
          })
        );

        return {
          href: window.location.href,
          hasDesktopApi,
          hasTaskList,
          hasEngineHealth,
          hasSettingsGet,
          settingsLoaded: Boolean(settings && typeof settings === "object"),
          stylesheetLinks,
          stylesheetStatuses
        };
      })();
    `,
    true
  );

  if (!details.hasDesktopApi) {
    throw new Error("desktopApi bridge not found");
  }

  if (!details.hasTaskList || !details.hasEngineHealth) {
    throw new Error("desktopApi bridge is incomplete");
  }

  if (!details.href.startsWith("http://127.0.0.1:")) {
    throw new Error(`unexpected renderer URL: ${details.href}`);
  }

  if (!details.hasSettingsGet || !details.settingsLoaded) {
    throw new Error("desktopApi.settings.get() did not return settings");
  }

  if (
    !details.stylesheetLinks.length ||
    details.stylesheetStatuses.some((item) => !item.ok)
  ) {
    throw new Error(`stylesheet assets are unavailable: ${JSON.stringify(details.stylesheetStatuses)}`);
  }
}

// 主窗口只负责承载页面，业务处理统一走本地 Python 引擎。
async function createWindow() {
  const isDev = isDevelopmentMode();
  const { width, height } = getDefaultWindowSize();
  const window = new BrowserWindow({
    title: appConfig.brandName,
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

function getAudioContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".m4a") {
    return "audio/mp4";
  }
  return "audio/wav";
}

function parseRangeHeader(rangeHeader, fileSize) {
  if (!rangeHeader || typeof rangeHeader !== "string") {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) {
    return null;
  }

  let start;
  let end;

  if (startRaw) {
    start = Number.parseInt(startRaw, 10);
    end = endRaw ? Number.parseInt(endRaw, 10) : fileSize - 1;
  } else {
    const suffixLength = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null;
    }
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= fileSize) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
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
  const workingDir = path.join(taskDir, "working");
  const candidates = [];
  const preferredPath = payload?.sourcePath ? path.resolve(payload.sourcePath) : null;

  if (!isPathInside(tasksDir, taskDir)) {
    return {
      available: false,
      reason: "任务目录不合法。"
    };
  }

  candidates.push(path.join(workingDir, "normalized_base.wav"));
  candidates.push(path.join(workingDir, "normalized.wav"));

  for (const extension of SUPPORTED_AUDIO_EXTENSIONS) {
    candidates.push(path.join(sourceDir, `original${extension}`));
  }

  if (preferredPath && isPathInside(taskDir, preferredPath)) {
    candidates.push(preferredPath);
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
      const relativePath = path
        .relative(taskDir, resolved)
        .split(path.sep)
        .map(encodeURIComponent)
        .join("/");
      return {
        available: true,
        path: resolved,
        url: `${TASK_MEDIA_SCHEME}://task/${encodeURIComponent(taskId)}/${relativePath}`,
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

async function selectAudioForImport() {
  return dialog.showOpenDialog({
    title: appConfig.brandName,
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "wav", "m4a"]
      }
    ]
  });
}

async function stageAudioForImport(sourcePath, runtimePaths) {
  const sourceExtension = path.extname(sourcePath).toLowerCase();
  const stagingDir = path.join(runtimePaths.cacheRootDir, "import-staging");
  const stagedFilePath = path.join(
    stagingDir,
    `import-${Date.now()}-${crypto.randomUUID()}${sourceExtension}`
  );

  await fs.mkdir(stagingDir, { recursive: true });
  await fs.copyFile(sourcePath, stagedFilePath);

  return stagedFilePath;
}

async function importAudioTask(runtimePaths) {
  const selection = await selectAudioForImport();
  if (selection.canceled || !selection.filePaths?.length) {
    return null;
  }

  const sourcePath = path.resolve(selection.filePaths[0]);
  const stagedSourcePath = await stageAudioForImport(sourcePath, runtimePaths);

  try {
    const response = await runEngineRequest(
      {
        action: "import_audio",
        payload: {
          sourcePath: stagedSourcePath,
          originalSourcePath: sourcePath,
          originalFileName: path.basename(sourcePath)
        }
      },
      { runtimePaths }
    );

    return response?.data?.task || null;
  } finally {
    await fs.rm(stagedSourcePath, { force: true }).catch(() => {});
  }
}

app.whenReady().then(async () => {
  const runtimePaths = getRuntimePaths({
    isPackaged: app.isPackaged,
    userDataDir: app.getPath("userData"),
    resourcesPath: process.resourcesPath
  });
  ensureRuntimeDirs(runtimePaths);
  const settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));

  protocol.handle(TASK_MEDIA_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);
    const [taskIdSegment, ...relativeSegments] = requestUrl.pathname.split("/").filter(Boolean);
    const taskId = decodeURIComponent(taskIdSegment || "");

    if (requestUrl.hostname !== "task" || !taskId || !relativeSegments.length) {
      return new Response("Invalid media path", { status: 400 });
    }

    const taskDir = path.join(runtimePaths.tasksDir, taskId);
    const targetPath = path.resolve(
      taskDir,
      ...relativeSegments.map((segment) => decodeURIComponent(segment))
    );

    if (!isPathInside(runtimePaths.tasksDir, taskDir) || !isPathInside(taskDir, targetPath)) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      const fileStat = await fs.stat(targetPath);
      const fileSize = fileStat.size;
      const contentType = getAudioContentType(targetPath);
      const rangeHeader = request.headers.get("range");
      const byteRange = parseRangeHeader(rangeHeader, fileSize);

      if (rangeHeader && !byteRange) {
        return new Response(null, {
          status: 416,
          headers: {
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes */${fileSize}`
          }
        });
      }

      const start = byteRange?.start ?? 0;
      const end = byteRange?.end ?? fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = nativeFs.createReadStream(targetPath, { start, end });

      return new Response(Readable.toWeb(stream), {
        status: byteRange ? 206 : 200,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
          ...(byteRange ? { "Content-Range": `bytes ${start}-${end}/${fileSize}` } : {})
        }
      });
    } catch (_error) {
      return new Response("Not Found", { status: 404 });
    }
  });

  // 页面所有业务请求都通过一个统一 IPC 通道转发给 Python。
  ipcMain.handle("engine:request", async (_event, request) => {
    return runEngineRequest(request, { runtimePaths });
  });

  ipcMain.handle("tasks:import-audio", async () => {
    return importAudioTask(runtimePaths);
  });

  // 选择音频文件也放在主进程做，避免渲染层直接接触 Node 能力。
  ipcMain.handle("dialog:select-audio", async () => {
    return selectAudioForImport();
  });

  ipcMain.handle("dialog:save-text", async (_event, payload) => {
    const saveResult = await dialog.showSaveDialog({
      title: payload?.title || `${appConfig.brandName} · 保存文件`,
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

  const window = await createWindow();

  if (isSmokeTestMode()) {
    await runSmokeAssertions(window);
    await disposeActiveWebServer();
    app.quit();
    return;
  }

  // macOS 上关闭窗口后保留应用，重新激活时再创建新窗口。
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
}).catch((error) => {
  console.error(error.stack || error.message);
  app.exit(1);
});

app.on("before-quit", () => {
  void disposeActiveWebServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
