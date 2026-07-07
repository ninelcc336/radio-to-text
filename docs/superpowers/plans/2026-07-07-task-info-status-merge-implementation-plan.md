# 任务信息合并运行状态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将右侧独立“运行状态”卡片合并进“任务信息”卡片，并用语义化颜色突出当前任务状态。

**Architecture:** 保持现有 Electron 渲染层数据流不变，只修改 `app/desktop/renderer/index.html` 的右侧详情布局和样式定义，再修改 `app/desktop/renderer/renderer.js` 的任务信息渲染逻辑，把原来的纯文本列表替换为包含状态条和字段网格的结构化 HTML。全局顶部临时提示 `#status` 继续保留，但不再单独承载任务主状态。

**Tech Stack:** Electron, 原生 HTML/CSS, 原生 JavaScript, Node 冒烟脚本

## Global Constraints

- 只修改渲染层文件 `app/desktop/renderer/index.html` 和 `app/desktop/renderer/renderer.js`
- 不修改任务状态枚举或后端任务流转逻辑
- 不新增依赖
- 保持中文文案风格与现有界面一致
- 必须保留 HTML 转义，避免把任务名或源文件名直接注入 DOM

---

### Task 1: 调整右侧任务信息卡片结构与样式

**Files:**
- Modify: `app/desktop/renderer/index.html`

**Interfaces:**
- Consumes: `renderer.js` 继续向 `#task-detail` 写入 HTML 片段
- Produces: 右侧详情区只保留一个“任务信息”卡片，并提供状态条、字段组所需的 CSS 类

- [ ] **Step 1: 先定位现有右侧详情区和状态样式**

```html
<section class="card panel">
  <div class="panel-header">
    <h2>任务信息</h2>
  </div>
  <div id="task-detail" class="summary">尚未选择任务。</div>
</section>
<section class="card panel">
  <div class="panel-header">
    <h2>运行状态</h2>
  </div>
  <div id="status" class="status">等待操作</div>
</section>
```

- [ ] **Step 2: 删除独立“运行状态”卡片，保留任务信息卡片承载详情**

```html
<section class="card panel">
  <div class="panel-header">
    <h2>任务信息</h2>
  </div>
  <div id="task-detail" class="summary">尚未选择任务。</div>
</section>
```

- [ ] **Step 3: 把旧的 `.status` 视觉语义收窄为顶部提示条，给任务详情新增状态条和字段样式**

```css
.summary {
  display: grid;
  gap: 14px;
}

.task-status-banner {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid transparent;
}

.task-status-banner.is-processing {
  background: #fff1df;
  border-color: #f0c48a;
  color: #9a4d00;
}

.task-detail-grid {
  display: grid;
  gap: 10px;
}

.task-detail-row {
  display: grid;
  gap: 2px;
}
```

- [ ] **Step 4: 为全部任务状态补齐语义色类，未知状态回退到中性色**

```css
.task-status-banner.is-ready,
.task-status-banner.is-created,
.task-status-banner.is-unknown {
  background: #f7f1e5;
  border-color: #ead9b8;
  color: #7b5a2c;
}

.task-status-banner.is-completed {
  background: #e8f6eb;
  border-color: #9fd0aa;
  color: #1f6a35;
}

.task-status-banner.is-failed {
  background: #fdeaea;
  border-color: #f1b1b1;
  color: #9f2f2f;
}
```

- [ ] **Step 5: 保存后手动检查 `index.html` 不再包含“运行状态”标题**

Run: `rg -n "运行状态" app/desktop/renderer/index.html`

Expected: 无匹配

- [ ] **Step 6: Commit**

```bash
git add app/desktop/renderer/index.html
git commit -m "调整任务信息卡片布局"
```

### Task 2: 把任务信息渲染改为结构化状态条 + 字段列表

**Files:**
- Modify: `app/desktop/renderer/renderer.js`
- Verify: `app/desktop/renderer/index.html`

**Interfaces:**
- Consumes: `task.status`, `task.stage`, `task.metadata`, `labelStatus(status)`, `labelStage(stage)`, `escapeHtml(value)`
- Produces: `renderTask(task)` 输出结构化的任务信息 HTML，未选择任务时仍输出空态文本

- [ ] **Step 1: 新增任务状态样式映射函数，隔离 DOM 类名拼接**

```js
function taskStatusTone(status) {
  const toneMap = {
    created: "created",
    ready: "ready",
    processing: "processing",
    completed: "completed",
    failed: "failed"
  };
  return toneMap[status] || "unknown";
}
```

- [ ] **Step 2: 新增任务详情 HTML 组装函数，统一处理转义和字段结构**

```js
function renderTaskDetail(task) {
  const metadata = task.metadata || {};
  const statusText = labelStatus(task.status);
  const stageText = labelStage(task.stage);
  const tone = taskStatusTone(task.status);

  const rows = [
    ["任务名称", task.name || "未命名任务"],
    ["任务 ID", task.task_id],
    ["阶段", stageText],
    ["源文件", metadata.original_file_name || task.source_path || "-"],
    ["时长", typeof metadata.duration_seconds === "number" ? `${metadata.duration_seconds.toFixed(1)} 秒` : "-"],
    ["采样率", metadata.sample_rate || "-"]
  ];

  return `
    <div class="task-status-banner is-${escapeHtml(tone)}">
      <div class="task-status-eyebrow">当前状态</div>
      <div class="task-status-value">${escapeHtml(statusText)}</div>
      <div class="task-status-stage">阶段：${escapeHtml(stageText)}</div>
    </div>
    <div class="task-detail-grid">
      ${rows
        .map(([label, value]) => `
          <div class="task-detail-row">
            <div class="task-detail-label">${escapeHtml(label)}</div>
            <div class="task-detail-value">${escapeHtml(value)}</div>
          </div>
        `)
        .join("")}
    </div>
  `;
}
```

- [ ] **Step 3: 在 `renderTask(task)` 中用新函数替换旧的 `detailLines` 拼接**

```js
if (!task) {
  detailEl.textContent = "尚未选择任务。";
  return;
}

detailEl.innerHTML = renderTaskDetail(task);
```

- [ ] **Step 4: 保留其余转写、导出、播放器逻辑不动，只检查任务详情改动没有破坏空态**

Run: `rg -n "detailLines|状态：" app/desktop/renderer/renderer.js`

Expected: `detailLines` 不再存在，任务详情区域不再输出重复的“状态：”文本行

- [ ] **Step 5: 运行桌面冒烟脚本验证主流程仍可启动**

Run: `npm run smoke`

Expected: 退出码为 `0`，输出包含健康检查通过与模拟任务完成

- [ ] **Step 6: 查看工作区差异，只包含计划内两个渲染文件**

Run: `git diff -- app/desktop/renderer/index.html app/desktop/renderer/renderer.js`

Expected: 差异仅包括状态卡片移除、样式新增、任务详情 HTML 渲染替换

- [ ] **Step 7: Commit**

```bash
git add app/desktop/renderer/index.html app/desktop/renderer/renderer.js
git commit -m "合并任务信息与运行状态展示"
```
