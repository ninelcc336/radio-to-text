# 任务选中与处理入口交互调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让新建任务自动成为当前任务，把处理入口迁到右侧任务状态区域，并在处理中为右侧详情区提供遮罩式 loading。

**Architecture:** 保持现有 `Electron + renderer.js` 页面结构不变，主要在渲染层收敛状态切换。把“待处理任务是否显示转录按钮”“处理中遮罩文案”抽成纯前端逻辑模块做 `node:test` 回归，`renderer.js` 继续负责 DOM 渲染、选中态同步和请求生命周期。

**Tech Stack:** Electron 37、原生 DOM API、Node.js 内置 `node:test`、PowerShell、现有 `npm run smoke`

## Global Constraints

- 创建任务成功后，自动选中新任务，并立即在右侧展示该任务详情
- 把左侧 `处理当前任务` 按钮移除
- 把右侧待处理状态下的主操作按钮改成 `转录文本`，并放入“当前状态”区域
- 当任务处于处理中时，为右侧详情区添加遮罩式 loading 效果
- 保持现有 `process_task` 请求协议和任务状态字段不变
- 本次不改 Python 引擎协议
- 本次不对左侧任务列表增加自动滚动行为

---

## File Structure

- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html`
  - 移除左侧处理按钮
  - 为右侧状态卡补充动作区样式与处理中动画样式
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js`
  - 保持任务选中、详情渲染、请求调度和 loading 生命周期
  - 接入纯逻辑模块，渲染右侧 `转录文本` 按钮并统一 detail busy 来源
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\task-processing-logic.js`
  - 仅放纯函数：待处理按钮显示规则、处理中遮罩文案
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\task-processing-logic.test.js`
  - 使用 `node:test` 验证按钮显示条件和阶段文案映射

### Task 1: 抽出任务处理 UI 纯逻辑并补单元测试

**Files:**
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\task-processing-logic.js`
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\task-processing-logic.test.js`

**Interfaces:**
- Consumes: `task.status`, `task.stage`
- Produces: `shouldShowProcessAction(task) => boolean`, `buildProcessingOverlayMessage(task) => string`

- [ ] **Step 1: 写失败测试，固定待处理按钮与处理中提示文案规则**

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const taskProcessingLogic = require("../task-processing-logic.js");

test("shows process action for created and ready tasks only", () => {
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "created" }), true);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "ready" }), true);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "processing" }), false);
    assert.equal(taskProcessingLogic.shouldShowProcessAction({ status: "completed" }), false);
});

test("maps processing stages to user-facing overlay messages", () => {
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({ status: "processing", stage: "preprocessing" }),
        "正在预处理音频..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({ status: "processing", stage: "transcribing" }),
        "正在转写文本..."
    );
    assert.equal(
        taskProcessingLogic.buildProcessingOverlayMessage({ status: "processing", stage: "diarizing" }),
        "正在识别说话人..."
    );
});
```

- [ ] **Step 2: 运行测试，确认当前实现不存在而失败**

Run: `node --test app/desktop/renderer/__tests__/task-processing-logic.test.js`
Expected: FAIL，报错包含 `Cannot find module`

- [ ] **Step 3: 编写最小实现，导出纯前端判断函数**

```js
"use strict";

(function initTaskProcessingLogicModule(root, factory) {
    const api = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = api;
        return;
    }

    if (root && typeof root === "object") {
        root.taskProcessingLogic = api;
    }
})(
    typeof globalThis !== "undefined" ? globalThis : this,
    function createTaskProcessingLogic() {
        function shouldShowProcessAction(task) {
            const status = String(task?.status || "").trim();
            return status === "created" || status === "ready";
        }

        function buildProcessingOverlayMessage(task) {
            const stage = String(task?.stage || "").trim();
            if (stage === "preprocessing") {
                return "正在预处理音频...";
            }
            if (stage === "transcribing") {
                return "正在转写文本...";
            }
            if (stage === "diarizing") {
                return "正在识别说话人...";
            }
            if (stage === "exporting") {
                return "正在整理导出结果...";
            }
            return "正在处理任务...";
        }

        return {
            buildProcessingOverlayMessage,
            shouldShowProcessAction
        };
    }
);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test app/desktop/renderer/__tests__/task-processing-logic.test.js`
Expected: PASS

### Task 2: 调整页面结构与样式，迁移处理入口到右侧状态卡

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html`

**Interfaces:**
- Consumes: `task-detail` 区域现有状态 banner
- Produces: 左侧只保留“选择音频并创建任务 / 刷新任务列表”，右侧状态卡支持渲染 `转录文本` 按钮和处理中 loading 动画

- [ ] **Step 1: 移除左侧固定处理按钮**

```html
<div class="card stack actions">
  <button id="select-button">选择音频并创建任务</button>
  <button id="refresh-button" class="secondary">刷新任务列表</button>
</div>
```

- [ ] **Step 2: 为状态卡补按钮区和处理中 pulse 动画样式**

```css
.task-status-banner {
  position: relative;
}

.task-status-actions {
  display: flex;
  justify-content: flex-start;
  margin-top: 6px;
}

.task-status-actions button {
  width: auto;
  min-height: 36px;
  padding: 9px 14px;
  border-radius: 999px;
}

.task-status-banner.is-processing::after {
  content: "";
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  border: 1px solid rgba(239, 183, 119, 0.55);
  animation: processingPulse 1.4s ease-in-out infinite;
  pointer-events: none;
}

@keyframes processingPulse {
  0% { opacity: 0.35; }
  50% { opacity: 1; }
  100% { opacity: 0.35; }
}
```

- [ ] **Step 3: 做一次 HTML/CSS 语法检查**

Run: `node --check app/desktop/renderer/renderer.js`
Expected: no output

### Task 3: 修改渲染层逻辑，实现自动选中、右侧处理按钮和处理中遮罩

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js`

**Interfaces:**
- Consumes: `runRequest(request, pendingMessage)`, `selectedTaskId`, `renderTaskDetail(task)`, `setReviewBusyState(isActive, message)`
- Produces: `runCurrentTaskProcessing() => Promise<void>`, `syncDetailBusyState(task) => void`, 右侧状态卡动作与 loading 生命周期

- [ ] **Step 1: 在 `renderer.js` 顶部接入 `task-processing-logic.js`**

```js
const taskProcessingLogic = globalThis.taskProcessingLogic || {};
const {
  buildProcessingOverlayMessage: buildProcessingOverlayMessageFromModule,
  shouldShowProcessAction: shouldShowProcessActionFromModule
} = taskProcessingLogic;
```

- [ ] **Step 2: 增加纯逻辑 fallback 和 detail busy 同步函数**

```js
function shouldShowProcessAction(task) {
  if (typeof shouldShowProcessActionFromModule === "function") {
    return shouldShowProcessActionFromModule(task);
  }
  return ["created", "ready"].includes(String(task?.status || "").trim());
}

function buildProcessingOverlayMessage(task) {
  if (typeof buildProcessingOverlayMessageFromModule === "function") {
    return buildProcessingOverlayMessageFromModule(task);
  }
  return "正在处理任务...";
}

function syncDetailBusyState(task = currentTask()) {
  if (reviewBusyState.active) {
    setReviewBusyState(true, reviewBusyState.message);
    return;
  }
  if (task?.status === "processing") {
    setReviewBusyState(true, buildProcessingOverlayMessage(task));
    return;
  }
  setReviewBusyState(false);
}
```

- [ ] **Step 3: 改 `renderTaskDetail(task)`，在待处理任务下把 `转录文本` 按钮嵌进状态卡**

```js
  const actionHtml = shouldShowProcessAction(task)
    ? `
      <div class="task-status-actions">
        <button id="detail-process-button" type="button">转录文本</button>
      </div>
    `
    : "";

  return `
    <div class="task-status-banner is-${taskStatusTone(task.status)}">
      <div class="task-status-eyebrow">当前状态</div>
      <div class="task-status-value">${escapeHtml(statusText)}</div>
      <div class="task-status-stage">阶段：${escapeHtml(stageText)}</div>
      ${actionHtml}
    </div>
    <div class="task-detail-grid">${detailRowsHtml}</div>
  `;
```

- [ ] **Step 4: 改 `renderTask(task)`，在写入详情 HTML 后绑定右侧按钮事件并同步 detail busy**

```js
  detailEl.innerHTML = renderTaskDetail(task);
  const detailProcessButton = document.getElementById("detail-process-button");
  if (detailProcessButton) {
    detailProcessButton.addEventListener("click", async () => {
      await runCurrentTaskProcessing();
    });
  }
  syncDetailBusyState(task);
```

- [ ] **Step 5: 抽出统一处理入口，替代左侧旧按钮逻辑**

```js
async function runCurrentTaskProcessing() {
  if (!selectedTaskId) {
    setState("未选择任务", { ok: false, error: "请先选择或创建任务。" }, { variant: "error" });
    return;
  }

  await runRequest(
    {
      action: "process_task",
      payload: {
        taskId: selectedTaskId
      }
    },
    "正在处理任务"
  );
}
```

- [ ] **Step 6: 在任务切换和请求完成后都同步右侧遮罩状态**

```js
async function syncTaskView(task) {
  renderTask(task);
  syncDetailBusyState(task);
  await syncTaskAudio(task);
}

if (response.data?.task) {
  selectedTaskId = response.data.task.task_id;
  upsertTask(response.data.task);
}
renderTaskList(tasksCache);
await syncTaskDetailFromCache();
```

- [ ] **Step 7: 删除左侧旧 `processButton` 绑定，保持创建任务后自动选中新任务**

```js
selectButton.addEventListener("click", async () => {
  const result = await window.engineApi.selectAudioFile();
  if (result.canceled || !result.filePaths?.length) {
    return;
  }

  await runRequest(
    {
      action: "import_audio",
      payload: {
        sourcePath: result.filePaths[0]
      }
    },
    "正在导入音频"
  );
});
```

- [ ] **Step 8: 运行语法检查**

Run: `node --check app/desktop/renderer/renderer.js`
Expected: no output

### Task 4: 运行前端测试与冒烟验证

**Files:**
- Verify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html`
- Verify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js`
- Verify: `E:\ai-list\radio-to-text\app\desktop\renderer\task-processing-logic.js`
- Verify: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\task-processing-logic.test.js`

**Interfaces:**
- Consumes: `node --test ...`, `npm run smoke`
- Produces: 创建任务选中、右侧处理入口和处理中遮罩行为可回归验证

- [ ] **Step 1: 跑任务处理 UI 纯逻辑测试**

Run: `node --test app/desktop/renderer/__tests__/task-processing-logic.test.js`
Expected: PASS

- [ ] **Step 2: 跑现有审核逻辑测试，确认未破坏前端其他纯逻辑**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: PASS

- [ ] **Step 3: 跑桌面冒烟脚本**

Run: `npm run smoke`
Expected: 退出码 `0`

- [ ] **Step 4: 查看最终差异范围**

Run: `git diff --stat -- app/desktop/renderer/index.html app/desktop/renderer/renderer.js app/desktop/renderer/task-processing-logic.js app/desktop/renderer/__tests__/task-processing-logic.test.js`
Expected: 仅包含本轮 UI 调整相关差异
