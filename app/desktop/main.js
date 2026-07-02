const path = require("path");
const fs = require("fs/promises");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { runEngineRequest } = require("./lib/python-engine");

function isDevelopmentMode() {
  // 如果脚本显式传了 NODE_ENV，就优先按脚本意图判断。
  if (process.env.NODE_ENV) {
    return process.env.NODE_ENV === "development";
  }

  // 未显式指定环境时，再退回到 Electron 的打包状态判断。
  return !app.isPackaged;
}

// 主窗口只负责承载页面，业务处理统一走本地 Python 引擎。
function createWindow() {
  const isDev = isDevelopmentMode();
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
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

  window.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  // 页面所有业务请求都通过一个统一 IPC 通道转发给 Python。
  ipcMain.handle("engine:request", async (_event, request) => {
    return runEngineRequest(request);
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

  createWindow();

  // macOS 上关闭窗口后保留应用，重新激活时再创建新窗口。
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
