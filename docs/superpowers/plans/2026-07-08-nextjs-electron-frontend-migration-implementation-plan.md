# Next.js Electron 前端迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持 `Electron + preload + Python` 主链路和 `tasks/task.json` 数据模型兼容的前提下，把现有静态渲染层升级为 `Next.js App Router + TypeScript + Tailwind + shadcn/ui` 的多页前端工程。

**Architecture:** 新增 `app/desktop/web/` 作为独立 Next 前端，开发期由 Electron 加载 `Next dev server`，生产期由 Electron 拉起 `Next standalone` 本地 Node 服务。前端只通过 `window.desktopApi` 访问桌面能力，任务处理、审校、导出和音频路径解析继续由现有 Electron 主进程与 Python 引擎负责。

**Tech Stack:** Electron 37、Next.js App Router、TypeScript、Tailwind CSS、shadcn/ui、Zustand、Node.js、现有 Python 引擎、现有 `node:test` / `npm run smoke`

## Global Constraints

- 保持现有 `Electron + preload + Python` 主链路不变
- 前端页面结构至少包含 `任务列表 / 任务详情 / 设置` 三类路由
- 将任务列表、详情、播放器、审校、导出等能力拆为独立组件和前端状态模块
- 在开发期支持 `Next dev server + Electron` 联调
- 在生产期支持 `Next standalone + Electron` 打包运行
- 保持当前 `tasks/` 目录、`task.json` 数据模型和 Python 处理链兼容
- 本次不迁移到 `Tauri` 或 `Rust`
- 本次不重写 Python 引擎协议和 `task.json` 存储模型
- 本次不引入本地数据库替代任务目录结构
- 本次不新增录音、会议摘要、团队协作或云同步能力

---

## File Structure

- Modify: `E:\ai-list\radio-to-text\package.json`
  - 增加 `dev:web`、`build:web`、`start:web`、`dev`、`dist:win` 等编排脚本
- Modify: `E:\ai-list\radio-to-text\app\desktop\main.js`
  - 根据开发/生产环境加载 Next URL，并复用现有窗口与 IPC
- Modify: `E:\ai-list\radio-to-text\app\desktop\preload.js`
  - 暴露类型清晰的 `desktopApi`
- Create: `E:\ai-list\radio-to-text\app\desktop\lib\settings-store.js`
  - 管理桌面侧设置读写与默认值
- Create: `E:\ai-list\radio-to-text\app\desktop\lib\next-server.js`
  - 启动、探活、关闭 Next standalone 服务
- Create: `E:\ai-list\radio-to-text\app\desktop\web\package.json`
  - 独立管理 Next 依赖与脚本
- Create: `E:\ai-list\radio-to-text\app\desktop\web\next.config.mjs`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tsconfig.json`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\postcss.config.mjs`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tailwind.config.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components.json`
  - shadcn/ui 配置
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\button.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\input.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\textarea.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\badge.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\dropdown-menu.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\scroll-area.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\ui\separator.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\layout.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\globals.css`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\tasks\[taskId]\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\settings\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\providers.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\app-shell.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-panel.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-item.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-summary-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-action-bar.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\player\audio-player-panel.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-toolbar.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-list.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-editor.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\export\export-menu.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\settings\settings-form.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\settings\engine-health-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\desktop-types.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\desktop-api.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\errors.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\formatters.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\constants.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\tasks-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\task-detail-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\player-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\settings-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\desktop-api.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\tasks-store.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\task-detail-store.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\player-store.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\settings-store.test.ts`
- Modify: `E:\ai-list\radio-to-text\app\desktop\scripts\smoke.js`
  - 让冒烟测试等待 Next 页面与桥接 API

## Shared Interfaces

- `type DesktopTask = { task_id: string; name: string; status: string; stage: string; metadata: Record<string, unknown>; results: DesktopTaskResults; artifacts: Record<string, string>; exports: Record<string, string>; logs: Array<{ timestamp: string; message: string }> }`
- `type DesktopApi = { tasks: { list(): Promise<DesktopTask[]>; get(taskId: string): Promise<DesktopTask>; importAudio(): Promise<DesktopTask | null>; process(taskId: string): Promise<DesktopTask>; rename(taskId: string, name: string): Promise<DesktopTask>; delete(taskId: string): Promise<{ taskId: string }> }; review: { update(taskId: string, segmentIndex: number, action: "confirm" | "correct" | "delete", reviewedText?: string): Promise<DesktopTask> }; media: { resolveTaskAudio(taskId: string, sourcePath?: string): Promise<ResolvedTaskAudio> }; dialog: { saveText(payload: SaveTextPayload): Promise<{ canceled: boolean; filePath?: string }> }; settings: { get(): Promise<DesktopSettings>; set(payload: DesktopSettingsInput): Promise<DesktopSettings> }; engine: { health(): Promise<EngineHealth> } }`
- `const useTasksStore = create<TasksStoreState>()`
- `const useTaskDetailStore = create<TaskDetailStoreState>()`
- `const usePlayerStore = create<PlayerStoreState>()`
- `const useSettingsStore = create<SettingsStoreState>()`
- `startNextServer(options: { cwd: string; port: number }): Promise<{ url: string; dispose(): Promise<void> }>`

## Task 1: 搭建 Next 前端工程骨架与根脚本

**Files:**
- Modify: `E:\ai-list\radio-to-text\package.json`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\package.json`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\next.config.mjs`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tsconfig.json`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\postcss.config.mjs`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tailwind.config.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components.json`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\layout.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\globals.css`
- Test: `E:\ai-list\radio-to-text\app\desktop\web\package.json`

**Interfaces:**
- Consumes: 根仓库已有 `npm` 工作流、Electron 主入口 `app/desktop/main.js`
- Produces: `npm run dev:web`, `npm run build:web`, `npm run start:web`, `npm run dev:desktop`, `npm run dev`

- [ ] **Step 1: 写根脚本失败断言，先固定需要新增的脚本名**

```js
const pkg = require("../../../package.json");

if (!pkg.scripts["dev:web"] || !pkg.scripts["build:web"] || !pkg.scripts["start:web"]) {
  throw new Error("missing web scripts");
}
```

- [ ] **Step 2: 运行断言，确认当前脚本不存在**

Run: `@'const pkg=require("./package.json");if(!pkg.scripts["dev:web"]||!pkg.scripts["build:web"]||!pkg.scripts["start:web"]){throw new Error("missing web scripts")}console.log("ok")'@ | node -`
Expected: FAIL，报错包含 `missing web scripts`

- [ ] **Step 3: 新建 `app/desktop/web/package.json` 与 Next 基础配置**

```json
{
  "name": "radio-to-text-web",
  "private": true,
  "scripts": {
    "dev": "next dev --hostname 127.0.0.1 --port 3000",
    "build": "next build",
    "start": "next start --hostname 127.0.0.1 --port 3000",
    "lint": "next lint",
    "test": "tsx --test tests/*.test.ts"
  },
  "dependencies": {
    "next": "^14.2.25",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.4",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "lucide-react": "^0.453.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "@types/node": "^22.10.1",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "tsx": "^4.19.2",
    "tailwindcss": "^3.4.14",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20"
  }
}
```

- [ ] **Step 4: 修改根 `package.json`，增加前端脚本编排**

```json
{
  "scripts": {
    "dev:web": "npm --prefix app/desktop/web run dev",
    "build:web": "npm --prefix app/desktop/web run build",
    "start:web": "npm --prefix app/desktop/web run start",
    "dev:desktop": "set NODE_ENV=development&& .\\node_modules\\electron\\dist\\electron.exe .",
    "dev": "node app/desktop/scripts/dev-with-next.js",
    "dist:win": "npm run build:web && npm run build:engine && npm run build:engine:verify && node app/desktop/scripts/clean-dist-output.js release/win-unpacked && electron-builder --config.directories.output=release --win nsis portable"
  }
}
```

- [ ] **Step 5: 写最小 `layout.tsx` 和 `globals.css`，确保 Next 能启动空壳页面**

```tsx
// app/desktop/web/app/layout.tsx
import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/desktop/web/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  min-height: 100vh;
  background: #f4f1e8;
  color: #1f1e1a;
}
```

- [ ] **Step 6: 安装前端依赖并确认 Next 构建可运行**

Run: `npm install --prefix app/desktop/web`
Expected: 退出码 `0`

Run: `npx --prefix app/desktop/web shadcn@latest init -d`
Expected: 退出码 `0`

Run: `npx --prefix app/desktop/web shadcn@latest add button card input textarea badge dropdown-menu scroll-area separator`
Expected: 退出码 `0`

Run: `npm run build:web`
Expected: 退出码 `0`

- [ ] **Step 7: 提交骨架工程**

```bash
git add package.json app/desktop/web/package.json app/desktop/web/package-lock.json app/desktop/web
git commit -m "搭建 Next 前端工程骨架"
```

## Task 2: 接入 Electron 开发/生产加载链与类型化桌面 API

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\main.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\preload.js`
- Create: `E:\ai-list\radio-to-text\app\desktop\lib\next-server.js`
- Create: `E:\ai-list\radio-to-text\app\desktop\scripts\dev-with-next.js`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\desktop-types.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\lib\desktop-api.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\desktop-api.test.ts`

**Interfaces:**
- Consumes: `runEngineRequest(request, { runtimePaths })`, `dialog:select-audio`, `dialog:save-text`, `media:resolve-task-audio`
- Produces: `window.desktopApi`, `getDesktopApi(): DesktopApi`, `startNextServer()`

- [ ] **Step 1: 写桌面 API 测试，固定前端侧调用形状**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createDesktopApi } from "../lib/desktop-api";

test("desktop api maps task list call to preload bridge", async () => {
  const calls: Array<{ channel: string; payload: unknown }> = [];
  const bridge = {
    invoke(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return Promise.resolve({ ok: true, data: { tasks: [] } });
    }
  };
  const api = createDesktopApi(bridge as never);
  await api.tasks.list();
  assert.deepEqual(calls[0], {
    channel: "engine:request",
    payload: { action: "list_tasks", payload: {} }
  });
});
```

- [ ] **Step 2: 运行测试，确认当前实现不存在**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/desktop-api.test.ts`
Expected: FAIL，报错包含 `Cannot find module`

- [ ] **Step 3: 新建 `next-server.js`，封装 standalone 服务启动与探活**

```js
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

function waitForUrl(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    (function poll() {
      http
        .get(url, (response) => {
          response.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - startedAt > timeoutMs) {
            reject(new Error(`Next server not ready: ${url}`));
            return;
          }
          setTimeout(poll, 250);
        });
    })();
  });
}

async function startNextServer({ cwd, port }) {
  const serverPath = path.join(cwd, "server.js");
  const child = spawn(process.execPath, [serverPath], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" }
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForUrl(url);
  return {
    url,
    async dispose() {
      child.kill();
    }
  };
}

module.exports = { startNextServer, waitForUrl };
```

- [ ] **Step 4: 修改 `main.js`，开发期加载 `http://127.0.0.1:3000`，生产期加载 standalone 服务**

```js
const { startNextServer, waitForUrl } = require("./lib/next-server");

async function loadRenderer(window) {
  if (isDevelopmentMode()) {
    const devUrl = "http://127.0.0.1:3000";
    await waitForUrl(devUrl, 30000);
    await window.loadURL(devUrl);
    return;
  }

  const webCwd = path.join(process.resourcesPath, "web");
  const webServer = await startNextServer({ cwd: webCwd, port: 3000 });
  window.on("closed", () => {
    void webServer.dispose();
  });
  await window.loadURL(webServer.url);
}
```

- [ ] **Step 5: 新建 `dev-with-next.js`，并发拉起 Next dev server 与 Electron**

```js
const { spawn } = require("child_process");

const web = spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: true });
const desktop = spawn("npm", ["run", "dev:desktop"], { stdio: "inherit", shell: true });

function shutdown(code) {
  web.kill();
  desktop.kill();
  process.exit(code);
}

desktop.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(130));
```

- [ ] **Step 6: 修改 `preload.js`，暴露语义化的 `desktopApi`**

```js
contextBridge.exposeInMainWorld("desktopApi", {
  tasks: {
    list() {
      return ipcRenderer.invoke("engine:request", { action: "list_tasks", payload: {} });
    },
    get(taskId) {
      return ipcRenderer.invoke("engine:request", { action: "get_task", payload: { taskId } });
    },
    async importAudio() {
      const result = await ipcRenderer.invoke("dialog:select-audio");
      if (result.canceled || !result.filePaths?.length) {
        return null;
      }
      const response = await ipcRenderer.invoke("engine:request", {
        action: "import_audio",
        payload: { sourcePath: result.filePaths[0] }
      });
      return response.data.task;
    },
    process(taskId) {
      return ipcRenderer.invoke("engine:request", { action: "process_task", payload: { taskId } });
    },
    rename(taskId, name) {
      return ipcRenderer.invoke("engine:request", { action: "rename_task", payload: { taskId, name } });
    },
    delete(taskId) {
      return ipcRenderer.invoke("engine:request", { action: "delete_task", payload: { taskId } });
    }
  },
  review: {
    update(taskId, segmentIndex, reviewAction, reviewedText) {
      return ipcRenderer.invoke("engine:request", {
        action: "update_segment_review",
        payload: { taskId, segmentIndex, reviewAction, reviewedText }
      });
    }
  },
  media: {
    resolveTaskAudio(taskId, sourcePath) {
      return ipcRenderer.invoke("media:resolve-task-audio", { taskId, sourcePath });
    }
  },
  dialog: {
    selectAudio() {
      return ipcRenderer.invoke("dialog:select-audio");
    },
    saveText(payload) {
      return ipcRenderer.invoke("dialog:save-text", payload);
    }
  },
  engine: {
    health() {
      return ipcRenderer.invoke("engine:request", { action: "health", payload: {} });
    }
  }
});
```

- [ ] **Step 7: 写前端封装 `createDesktopApi()`，把 preload 返回值转成稳定类型**

```ts
import type { DesktopApi, DesktopBridge } from "./desktop-types";

export function createDesktopApi(bridge: DesktopBridge): DesktopApi {
  return {
    tasks: {
      async list() {
        const response = await bridge.invoke("engine:request", { action: "list_tasks", payload: {} });
        return response.data.tasks;
      },
      async get(taskId) {
        const response = await bridge.invoke("engine:request", { action: "get_task", payload: { taskId } });
        return response.data.task;
      },
      async importAudio() {
        const selected = await bridge.invoke("dialog:select-audio");
        if (selected.canceled || !selected.filePaths?.length) {
          return null;
        }
        const response = await bridge.invoke("engine:request", {
          action: "import_audio",
          payload: { sourcePath: selected.filePaths[0] }
        });
        return response.data.task;
      },
      async process(taskId) {
        const response = await bridge.invoke("engine:request", { action: "process_task", payload: { taskId } });
        return response.data.task;
      },
      async rename(taskId, name) {
        const response = await bridge.invoke("engine:request", {
          action: "rename_task",
          payload: { taskId, name }
        });
        return response.data.task;
      },
      async delete(taskId) {
        const response = await bridge.invoke("engine:request", {
          action: "delete_task",
          payload: { taskId }
        });
        return response.data;
      }
    },
    review: {
      async update(taskId, segmentIndex, action, reviewedText) {
        const response = await bridge.invoke("engine:request", {
          action: "update_segment_review",
          payload: { taskId, segmentIndex, reviewAction: action, reviewedText }
        });
        return response.data.task;
      }
    },
    media: {
      async resolveTaskAudio(taskId, sourcePath) {
        return bridge.invoke("media:resolve-task-audio", { taskId, sourcePath });
      }
    },
    dialog: {
      async saveText(payload) {
        return bridge.invoke("dialog:save-text", payload);
      }
    },
    settings: {
      async get() {
        return bridge.invoke("settings:get");
      },
      async set(payload) {
        return bridge.invoke("settings:set", payload);
      }
    },
    engine: {
      async health() {
        const response = await bridge.invoke("engine:request", { action: "health", payload: {} });
        return response.data;
      }
    }
  } as DesktopApi;
}
```

- [ ] **Step 8: 跑桌面 API 测试和语法检查**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/desktop-api.test.ts`
Expected: PASS

Run: `node --check app/desktop/main.js`
Expected: no output

- [ ] **Step 9: 提交 Electron 集成与桌面桥接**

```bash
git add app/desktop/main.js app/desktop/preload.js app/desktop/lib/next-server.js app/desktop/scripts/dev-with-next.js app/desktop/web/lib app/desktop/web/tests
git commit -m "接入 Next 渲染层与桌面桥接"
```

## Task 3: 实现共享布局、任务列表页与任务列表状态层

**Files:**
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\providers.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\app-shell.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-panel.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-list-item.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\tasks-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\tasks-store.test.ts`

**Interfaces:**
- Consumes: `DesktopApi.tasks.list()`, `DesktopApi.tasks.importAudio()`, `DesktopApi.tasks.rename()`, `DesktopApi.tasks.delete()`
- Produces: `useTasksStore`, `<TaskListPanel />`, 首页任务列表与路由跳转

- [ ] **Step 1: 写 `tasks-store` 测试，固定列表刷新与本地更新行为**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createTasksStore } from "../stores/tasks-store";

test("refreshTasks stores latest list with newest task first", async () => {
  const api = { tasks: { list: async () => [{ task_id: "b" }, { task_id: "a" }] } } as never;
  const store = createTasksStore(api);
  await store.getState().refreshTasks();
  assert.deepEqual(store.getState().tasks.map((item) => item.task_id), ["b", "a"]);
});
```

- [ ] **Step 2: 运行测试，确认 store 尚不存在**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/tasks-store.test.ts`
Expected: FAIL，报错包含 `Cannot find module`

- [ ] **Step 3: 实现 `tasks-store.ts`，收敛列表刷新、选中、重命名、删除**

```ts
import { create } from "zustand";
import type { DesktopApi, DesktopTask } from "../lib/desktop-types";

export function createTasksStore(api: DesktopApi) {
  return create<{
    tasks: DesktopTask[];
    selectedTaskId: string | null;
    refreshTasks(): Promise<void>;
    selectTask(taskId: string | null): void;
  }>((set) => ({
    tasks: [],
    selectedTaskId: null,
    async refreshTasks() {
      const tasks = await api.tasks.list();
      set((state) => ({
        tasks,
        selectedTaskId: state.selectedTaskId ?? tasks[0]?.task_id ?? null
      }));
    },
    selectTask(taskId) {
      set({ selectedTaskId: taskId });
    }
  }));
}
```

- [ ] **Step 4: 实现首页布局与任务列表组件**

```tsx
// app/desktop/web/app/page.tsx
"use client";

import { useEffect } from "react";
import { useTasksStore } from "../stores/tasks-store";
import { TaskListPanel } from "../components/tasks/task-list-panel";

export default function HomePage() {
  const refreshTasks = useTasksStore((state) => state.refreshTasks);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  return <TaskListPanel />;
}
```

- [ ] **Step 5: 给 `TaskListPanel` 接上“选择音频并创建任务”与导航**

```tsx
const importAudio = async () => {
  const task = await desktopApi.tasks.importAudio();
  if (!task) return;
  selectTask(task.task_id);
  router.push(`/tasks/${task.task_id}`);
};
```

- [ ] **Step 6: 运行列表 store 测试与前端构建**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/tasks-store.test.ts`
Expected: PASS

Run: `npm run build:web`
Expected: 退出码 `0`

- [ ] **Step 7: 提交列表页与状态层**

```bash
git add app/desktop/web/app/page.tsx app/desktop/web/app/providers.tsx app/desktop/web/components/app-shell.tsx app/desktop/web/components/tasks app/desktop/web/stores/tasks-store.ts app/desktop/web/tests/tasks-store.test.ts
git commit -m "实现 Next 任务列表页"
```

## Task 4: 实现任务详情页、播放器与审校/导出状态层

**Files:**
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\tasks\[taskId]\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-summary-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\tasks\task-action-bar.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\player\audio-player-panel.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-toolbar.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-list.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\transcript\transcript-segment-editor.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\export\export-menu.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\task-detail-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\player-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\task-detail-store.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\player-store.test.ts`

**Interfaces:**
- Consumes: `DesktopApi.tasks.get()`, `DesktopApi.tasks.process()`, `DesktopApi.review.update()`, `DesktopApi.media.resolveTaskAudio()`, `DesktopApi.dialog.saveText()`
- Produces: `useTaskDetailStore`, `usePlayerStore`, `<AudioPlayerPanel />`, `<TranscriptSegmentList />`, `/tasks/[taskId]`

- [ ] **Step 1: 写 `task-detail-store` 测试，先固定详情加载和审校回写**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createTaskDetailStore } from "../stores/task-detail-store";

test("loadTask stores fetched task and defaults to clean/all view", async () => {
  const api = { tasks: { get: async () => ({ task_id: "task-1", results: { segments: [] } }) } } as never;
  const store = createTaskDetailStore(api);
  await store.getState().loadTask("task-1");
  assert.equal(store.getState().task?.task_id, "task-1");
  assert.equal(store.getState().textVersion, "clean");
  assert.equal(store.getState().reviewFilter, "all");
});
```

- [ ] **Step 2: 写 `player-store` 测试，固定音频加载与激活片段同步**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { findActiveSegmentIndex } from "../stores/player-store";

test("findActiveSegmentIndex matches segment by current time", () => {
  const index = findActiveSegmentIndex(
    [{ start: 0, end: 1 }, { start: 1, end: 3 }],
    1.2
  );
  assert.equal(index, 1);
});
```

- [ ] **Step 3: 运行测试，确认详情与播放器 store 尚未实现**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/task-detail-store.test.ts app/desktop/web/tests/player-store.test.ts`
Expected: FAIL，报错包含 `Cannot find module`

- [ ] **Step 4: 实现 `task-detail-store.ts`，收敛详情加载、处理动作、审校动作和视图状态**

```ts
export function createTaskDetailStore(api: DesktopApi) {
  return create<TaskDetailStoreState>((set) => ({
    task: null,
    textVersion: "clean",
    reviewFilter: "all",
    isBusy: false,
    async loadTask(taskId) {
      const task = await api.tasks.get(taskId);
      set({ task, textVersion: "clean", reviewFilter: "all" });
    },
    async processTask(taskId) {
      set({ isBusy: true });
      try {
        const task = await api.tasks.process(taskId);
        set({ task });
      } finally {
        set({ isBusy: false });
      }
    }
  }));
}
```

- [ ] **Step 5: 实现 `player-store.ts` 与播放器核心纯函数**

```ts
export function findActiveSegmentIndex(
  segments: Array<{ start: number; end?: number }>,
  currentTime: number
) {
  return segments.findIndex((segment) => {
    const end = Number.isFinite(segment.end) ? Number(segment.end) : Number.POSITIVE_INFINITY;
    return currentTime >= Number(segment.start) && currentTime < end;
  });
}
```

- [ ] **Step 6: 搭建详情页并接入组件**

```tsx
"use client";

import { useEffect } from "react";
import { useTaskDetailStore } from "../../../stores/task-detail-store";
import { AudioPlayerPanel } from "../../../components/player/audio-player-panel";
import { TranscriptSegmentList } from "../../../components/transcript/transcript-segment-list";

export default function TaskDetailPage({ params }: { params: { taskId: string } }) {
  const loadTask = useTaskDetailStore((state) => state.loadTask);

  useEffect(() => {
    void loadTask(params.taskId);
  }, [loadTask, params.taskId]);

  return (
    <div className="grid gap-6">
      <AudioPlayerPanel taskId={params.taskId} />
      <TranscriptSegmentList taskId={params.taskId} />
    </div>
  );
}
```

- [ ] **Step 7: 迁移导出与审校动作，确保调用的仍是现有 Python 主链**

```tsx
await desktopApi.review.update(taskId, sourceIndex, "correct", draftText);

await desktopApi.dialog.saveText({
  title: "保存转写文本",
  defaultFileName: `${task.name || task.task_id}.txt`,
  content: text
});
```

- [ ] **Step 8: 跑详情/播放器测试与前端构建**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/task-detail-store.test.ts app/desktop/web/tests/player-store.test.ts`
Expected: PASS

Run: `npm run build:web`
Expected: 退出码 `0`

- [ ] **Step 9: 提交详情页、播放器与审校迁移**

```bash
git add app/desktop/web/app/tasks app/desktop/web/components/player app/desktop/web/components/transcript app/desktop/web/components/export app/desktop/web/components/tasks/task-summary-card.tsx app/desktop/web/components/tasks/task-action-bar.tsx app/desktop/web/stores/task-detail-store.ts app/desktop/web/stores/player-store.ts app/desktop/web/tests/task-detail-store.test.ts app/desktop/web/tests/player-store.test.ts
git commit -m "迁移任务详情页与审校播放器"
```

## Task 5: 实现设置页、健康检查与设置状态层

**Files:**
- Create: `E:\ai-list\radio-to-text\app\desktop\web\app\settings\page.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\settings\settings-form.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\components\settings\engine-health-card.tsx`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\stores\settings-store.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\web\tests\settings-store.test.ts`
- Create: `E:\ai-list\radio-to-text\app\desktop\lib\settings-store.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\main.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\preload.js`

**Interfaces:**
- Consumes: `DesktopApi.settings.get()`, `DesktopApi.settings.set()`, `DesktopApi.engine.health()`
- Produces: `/settings`, `useSettingsStore`

- [ ] **Step 1: 写 `settings-store` 测试，固定设置加载与健康检查行为**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../stores/settings-store";

test("loadSettings stores settings and engine health together", async () => {
  const api = {
    settings: { get: async () => ({ language: "zh" }) },
    engine: { health: async () => ({ ok: true, runtime_paths: {} }) }
  } as never;
  const store = createSettingsStore(api);
  await store.getState().load();
  assert.equal(store.getState().settings?.language, "zh");
  assert.equal(store.getState().health?.ok, true);
});
```

- [ ] **Step 2: 运行测试，确认设置 store 不存在**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/settings-store.test.ts`
Expected: FAIL，报错包含 `Cannot find module`

- [ ] **Step 3: 新建 Electron 侧 `settings-store.js`，把设置落到用户数据目录的 JSON 文件**

```js
const fs = require("fs/promises");
const path = require("path");

function createSettingsStore(settingsFilePath) {
  const defaults = {
    language: "zh",
    modelName: "small",
    exportFormat: "txt"
  };

  return {
    async get() {
      try {
        const raw = await fs.readFile(settingsFilePath, "utf8");
        return { ...defaults, ...JSON.parse(raw) };
      } catch {
        return defaults;
      }
    },
    async set(input) {
      const nextValue = { ...(await this.get()), ...input };
      await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
      await fs.writeFile(settingsFilePath, JSON.stringify(nextValue, null, 2), "utf8");
      return nextValue;
    }
  };
}

module.exports = { createSettingsStore };
```

- [ ] **Step 4: 在 `main.js` / `preload.js` 补齐 `settings:get`、`settings:set`、`engine:health`**

```js
ipcMain.handle("settings:get", async () => settingsStore.get());
ipcMain.handle("settings:set", async (_event, payload) => settingsStore.set(payload));

contextBridge.exposeInMainWorld("desktopApi", {
  settings: {
    get() {
      return ipcRenderer.invoke("settings:get");
    },
    set(payload) {
      return ipcRenderer.invoke("settings:set", payload);
    }
  },
  engine: {
    health() {
      return ipcRenderer.invoke("engine:request", { action: "health", payload: {} });
    }
  }
});
```

- [ ] **Step 5: 实现 `settings-store.ts` 与设置页组件**

```ts
export function createSettingsStore(api: DesktopApi) {
  return create<SettingsStoreState>((set) => ({
    settings: null,
    health: null,
    async load() {
      const [settings, health] = await Promise.all([
        api.settings.get(),
        api.engine.health()
      ]);
      set({ settings, health });
    },
    async save(input) {
      const settings = await api.settings.set(input);
      set({ settings });
    }
  }));
}
```

```tsx
export default function SettingsPage() {
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid gap-6">
      <EngineHealthCard />
      <SettingsForm />
    </div>
  );
}
```

- [ ] **Step 6: 跑设置 store 测试与引擎健康检查**

Run: `npx --prefix app/desktop/web tsx --test app/desktop/web/tests/settings-store.test.ts`
Expected: PASS

Run: `npm run engine:health`
Expected: 退出码 `0`

- [ ] **Step 7: 提交设置页与健康检查**

```bash
git add app/desktop/web/app/settings app/desktop/web/components/settings app/desktop/web/stores/settings-store.ts app/desktop/web/tests/settings-store.test.ts app/desktop/lib/settings-store.js app/desktop/main.js app/desktop/preload.js
git commit -m "实现设置页与引擎健康检查"
```

- [ ] **Step 8: 删除旧的“Python 侧 settings 动作”设想，保持设置存储留在 Electron**

```md
检查本任务差异，确认没有新增 `get_settings` / `set_settings` 的 Python action，也没有修改 `engine/python` 目录。
```

- [ ] **Step 9: 跑一次差异确认**

Run: `git diff --stat -- app/desktop/main.js app/desktop/preload.js app/desktop/lib/settings-store.js app/desktop/web/app/settings app/desktop/web/components/settings app/desktop/web/stores/settings-store.ts`
Expected: 只包含 Electron 设置存储与设置页相关差异

## Task 6: 接入生产 standalone 打包与桌面冒烟验证

**Files:**
- Modify: `E:\ai-list\radio-to-text\package.json`
- Modify: `E:\ai-list\radio-to-text\app\desktop\main.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\scripts\smoke.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\scripts\verify-engine-build.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\lib\runtime-paths.js`

**Interfaces:**
- Consumes: `.next/standalone`, Electron Builder `extraResources`, `npm run smoke`
- Produces: 生产模式可加载 standalone、冒烟测试可验证新前端

- [ ] **Step 1: 修改 `build:web` 为 standalone 输出，并把产物纳入 Electron 包**

```js
// app/desktop/web/next.config.mjs
const nextConfig = {
  output: "standalone",
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
```

```json
{
  "build": {
      "files": [
        "app/**/*",
        "package.json"
      ],
      "extraResources": [
        { "from": "dist-python/engine", "to": "engine" },
        { "from": "app/desktop/web/.next/standalone", "to": "web" },
        { "from": "app/desktop/web/.next/static", "to": "web/.next/static" },
        { "from": "app/desktop/web/public", "to": "web/public" }
      ]
  }
}
```

- [ ] **Step 2: 扩展冒烟脚本，让它验证 Next 页面与 `desktopApi`**

```js
const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { preload: preloadPath } });
  await loadRenderer(window);
  const hasDesktopApi = await window.webContents.executeJavaScript("Boolean(window.desktopApi)");
  if (!hasDesktopApi) {
    throw new Error("desktopApi bridge not found");
  }
  app.quit();
});
```

- [ ] **Step 3: 先跑前端构建，再跑桌面冒烟**

Run: `npm run build:web`
Expected: 退出码 `0`

Run: `npm run smoke`
Expected: 退出码 `0`

- [ ] **Step 4: 运行样例任务链，确认新前端迁移未破坏引擎主流程**

Run: `npm run sample`
Expected: 退出码 `0`

- [ ] **Step 5: 提交生产打包与冒烟适配**

```bash
git add package.json app/desktop/main.js app/desktop/scripts/smoke.js app/desktop/scripts/verify-engine-build.js app/desktop/lib/runtime-paths.js app/desktop/web/next.config.mjs
git commit -m "接入 standalone 打包与桌面冒烟"
```

## Task 7: 清理旧渲染层入口并补文档

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js`
- Modify: `E:\ai-list\radio-to-text\docs\superpowers\reports\2026-07-02-phase-6-report.md`

**Interfaces:**
- Consumes: 新 Next 前端已完全承接渲染职责
- Produces: 旧静态渲染层只保留迁移说明，不再作为正式入口

- [ ] **Step 1: 把旧 `renderer/index.html` 改成只读迁移说明，避免后续误用**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <body>
    <p>桌面前端已迁移到 Next.js，请通过 Electron 主入口加载 `app/desktop/web`。</p>
  </body>
</html>
```

- [ ] **Step 2: 在旧 `renderer.js` 顶部写明已废弃并移除入口绑定**

```js
throw new Error("Legacy renderer.js is no longer the active desktop entry. Use app/desktop/web instead.");
```

- [ ] **Step 3: 更新实现报告，记录新前端结构、脚本与验证命令**

```md
- 新增 `app/desktop/web/` Next 前端工程
- Electron 开发期改为等待 `127.0.0.1:3000`
- 生产期改为加载 `Next standalone`
- 验证命令：`npm run build:web`、`npm run smoke`、`npm run sample`
```

- [ ] **Step 4: 跑最终验证，确认旧入口被替换后依然可构建**

Run: `npm run build:web`
Expected: 退出码 `0`

Run: `npm run smoke`
Expected: 退出码 `0`

Run: `git diff --stat`
Expected: 只包含 Next 前端迁移、Electron 加载链、测试和文档相关差异

- [ ] **Step 5: 提交入口清理与文档**

```bash
git add app/desktop/renderer/index.html app/desktop/renderer/renderer.js docs/superpowers/reports
git commit -m "清理旧渲染层入口"
```
