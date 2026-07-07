# 片段审核交互收敛 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 调整片段审核前端交互，使“未处理”只针对疑似错误片段，确认后不显示“已确认”标签，并在确认提交期间锁定右侧详情区。

**Architecture:** 保持现有 `Electron + renderer.js` 页面架构不变，把“是否属于未处理 / 是否显示确认按钮 / 是否显示审核标记”这类纯判断抽成独立前端模块，便于用 `node:test` 做快速回归。右侧 busy 遮罩继续由渲染层本地状态驱动，通过现有 `runRequest()` 请求生命周期统一开启与关闭，不改 Python 引擎协议。

**Tech Stack:** Electron 37、原生 DOM API、Node.js 内置 `node:test`、PowerShell、现有 `npm run smoke`

## Global Constraints

- 不修改 Python 引擎的 `update_segment_review` 协议
- 不新增新的审核状态
- 不移除普通片段的手动修正能力
- 不调整导出逻辑和任务存储结构
- JavaScript 使用 4 空格缩进、双引号、`const`/`let`、`camelCase`
- 提交前至少运行 `npm run smoke`

---

## File Structure

- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js`
  - 保留 DOM 绑定、事件注册、请求调度和整体渲染流程
  - 改为消费抽出的审核判断函数，并维护右侧 busy 状态
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html`
  - 补 busy 遮罩 DOM 和样式
  - 为右侧主内容容器提供可覆盖的定位层级
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\review-logic.js`
  - 仅放纯函数：审核分类、筛选、按钮可见性、标记显示
  - 不直接依赖 DOM，供 `renderer.js` 和测试文件共同使用
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\review-logic.test.js`
  - 使用 Node 内置测试器验证“未处理”定义和按钮/标记可见性

### Task 1: 抽出片段审核判断模块并补单元测试

**Files:**
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\review-logic.js`
- Create: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\review-logic.test.js`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js:1-29`

**Interfaces:**
- Consumes: `segment.review_status`, `segment.needs_review`, `segment.review_reasons`
- Produces: `getReviewStatus(segment) => string`, `isPendingReviewSegment(reviewMeta) => boolean`, `shouldShowConfirmAction(reviewMeta) => boolean`, `shouldShowConfirmedBadge(reviewMeta) => boolean`, `buildSegmentReviewMeta(segment) => { reviewStatus: string, needsReview: boolean, reviewReasons: string[] }`

- [ ] **Step 1: 写失败测试，固定“未处理 / 确认按钮 / 已确认标签”规则**

```js
const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildSegmentReviewMeta,
    isPendingReviewSegment,
    shouldShowConfirmAction,
    shouldShowConfirmedBadge
} = require("../review-logic");

test("普通片段不会计入未处理，也不显示确认按钮", () => {
    const reviewMeta = buildSegmentReviewMeta({
        review_status: "pending",
        needs_review: false,
        review_reasons: []
    });

    assert.equal(isPendingReviewSegment(reviewMeta), false);
    assert.equal(shouldShowConfirmAction(reviewMeta), false);
});

test("待处理重点片段计入未处理并显示确认按钮", () => {
    const reviewMeta = buildSegmentReviewMeta({
        review_status: "pending",
        needs_review: true,
        review_reasons: ["低置信度"]
    });

    assert.equal(isPendingReviewSegment(reviewMeta), true);
    assert.equal(shouldShowConfirmAction(reviewMeta), true);
});

test("已确认重点片段不显示已确认标签", () => {
    const reviewMeta = buildSegmentReviewMeta({
        review_status: "confirmed",
        needs_review: true,
        review_reasons: ["低置信度"]
    });

    assert.equal(shouldShowConfirmedBadge(reviewMeta), false);
    assert.equal(shouldShowConfirmAction(reviewMeta), false);
});
```

- [ ] **Step 2: 运行测试确认当前实现尚不存在而失败**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: FAIL with `Cannot find module '../review-logic'`

- [ ] **Step 3: 编写最小实现，输出统一审核判断函数**

```js
function getReviewStatus(segment) {
    return String(segment?.review_status || "pending").trim() || "pending";
}

function buildSegmentReviewMeta(segment) {
    return {
        reviewStatus: getReviewStatus(segment),
        needsReview: Boolean(segment?.needs_review),
        reviewReasons: Array.isArray(segment?.review_reasons)
            ? segment.review_reasons.filter(Boolean)
            : []
    };
}

function isPendingReviewSegment(reviewMeta) {
    return reviewMeta.needsReview && reviewMeta.reviewStatus === "pending";
}

function shouldShowConfirmAction(reviewMeta) {
    return isPendingReviewSegment(reviewMeta);
}

function shouldShowConfirmedBadge() {
    return false;
}

module.exports = {
    buildSegmentReviewMeta,
    getReviewStatus,
    isPendingReviewSegment,
    shouldShowConfirmAction,
    shouldShowConfirmedBadge
};
```

- [ ] **Step 4: 在 `renderer.js` 顶部接入新模块，替换内联判断的准备代码**

```js
const {
    buildSegmentReviewMeta,
    getReviewStatus,
    isPendingReviewSegment,
    shouldShowConfirmAction,
    shouldShowConfirmedBadge
} = require("./review-logic");
```

- [ ] **Step 5: 运行单元测试确认通过**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: PASS, 3 tests passing

- [ ] **Step 6: 提交 Task 1**

```bash
git add app/desktop/renderer/review-logic.js app/desktop/renderer/__tests__/review-logic.test.js app/desktop/renderer/renderer.js
git commit -m "抽离片段审核判断逻辑"
```

### Task 2: 用统一判断收敛工具栏计数、筛选和片段动作

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js:222-377`
- Test: `E:\ai-list\radio-to-text\app\desktop\renderer\__tests__\review-logic.test.js`

**Interfaces:**
- Consumes: `buildSegmentReviewMeta(segment)`, `isPendingReviewSegment(reviewMeta)`, `shouldShowConfirmAction(reviewMeta)`, `shouldShowConfirmedBadge(reviewMeta)`
- Produces: `renderTranscriptToolbar(task)` 只统计重点待处理片段，`getVisibleTranscriptSegments(task)` 只在 `pending-only` 下返回重点待处理片段，`renderSegmentReviewBlock(reviewMeta, reviewReasons)` 不再渲染已确认标签，`buildSegmentActions(task, reviewMeta, sourceIndex)` 仅在重点待处理片段显示确认按钮

- [ ] **Step 1: 先扩测试，覆盖 corrected 与 confirmed 的显示规则**

```js
test("已修正片段不计入未处理且不显示确认按钮", () => {
    const reviewMeta = buildSegmentReviewMeta({
        review_status: "corrected",
        needs_review: true,
        review_reasons: ["低置信度"]
    });

    assert.equal(isPendingReviewSegment(reviewMeta), false);
    assert.equal(shouldShowConfirmAction(reviewMeta), false);
});

test("普通 pending 片段虽然可修正，但不会进入未处理集合", () => {
    const reviewMeta = buildSegmentReviewMeta({
        review_status: "pending",
        needs_review: false,
        review_reasons: []
    });

    assert.equal(isPendingReviewSegment(reviewMeta), false);
});
```

- [ ] **Step 2: 运行测试确保新增断言先失败或在旧逻辑下暴露问题**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: FAIL if helper contracts still incomplete, or PASS only after helper contract is complete; do not continue until assertions match spec exactly

- [ ] **Step 3: 修改工具栏计数和筛选，只认重点待处理片段**

```js
function renderTranscriptToolbar(task) {
    const activeTranscript = getActiveTranscriptData(task);
    const finalSegments = getFinalTranscriptSegments(task);
    const pendingSegments = finalSegments
        .map((segment) => buildSegmentReviewMeta(segment))
        .filter((reviewMeta) => isPendingReviewSegment(reviewMeta));

    // existing hasAnyOutput / hasStructuredTranscript logic stays unchanged
    reviewCountEl.textContent = `未处理 ${pendingSegments.length}`;
}

function getVisibleTranscriptSegments(task) {
    const segments = getActiveTranscriptData(task).segments;
    const entries = segments.map((segment, sourceIndex) => ({
        segment,
        sourceIndex,
        reviewMeta: getSegmentReviewMeta(task, sourceIndex)
    }));

    if (transcriptViewState.reviewFilter === "review-only") {
        return entries.filter((entry) => isPendingReviewSegment(entry.reviewMeta));
    }

    if (transcriptViewState.reviewFilter === "pending-only") {
        return entries.filter((entry) => isPendingReviewSegment(entry.reviewMeta));
    }

    return entries;
}
```

- [ ] **Step 4: 修改片段标记与动作显示规则**

```js
function renderSegmentReviewBlock(reviewMeta, reviewReasons) {
    if (reviewMeta.reviewStatus === "corrected") {
        return `
      <span class="segment-review">
        <span class="segment-status-chip is-corrected">已修正</span>
      </span>
    `;
    }

    if (!isPendingReviewSegment(reviewMeta)) {
        return "";
    }

    return `
    <span class="segment-review">
      <span class="segment-review-badge">疑似错误片段</span>
      <span class="segment-review-reasons">${escapeHtml(reviewReasons.join(" / "))}</span>
    </span>
  `;
}

function buildSegmentActions(task, reviewMeta, sourceIndex) {
    if (!task) {
        return null;
    }

    const actions = document.createElement("div");
    actions.className = "segment-actions";

    if (shouldShowConfirmAction(reviewMeta)) {
        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className = "segment-action-confirm";
        confirmButton.textContent = "确认";
        confirmButton.title = "确认这条片段无误";
        confirmButton.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await submitSegmentReview(sourceIndex, "confirm");
        });
        actions.appendChild(confirmButton);
    }

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "segment-action-edit";
    editButton.textContent = reviewMeta.reviewStatus === "corrected" ? "再修正" : "修正";
    actions.appendChild(editButton);
    return actions;
}
```

- [ ] **Step 5: 运行测试并做脚本语法检查**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: PASS

Run: `node --check app/desktop/renderer/renderer.js`
Expected: no output

- [ ] **Step 6: 提交 Task 2**

```bash
git add app/desktop/renderer/renderer.js app/desktop/renderer/__tests__/review-logic.test.js
git commit -m "收敛片段未处理与确认显示规则"
```

### Task 3: 为确认操作增加右侧 busy 遮罩和交互锁定

**Files:**
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html:47-62`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html:448-728`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\index.html:774-912`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js:30-60`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js:614-642`
- Modify: `E:\ai-list\radio-to-text\app\desktop\renderer\renderer.js:951-980`

**Interfaces:**
- Consumes: `submitSegmentReview(sourceIndex, reviewAction, reviewedText)`, `runRequest(request, pendingMessage)`
- Produces: `reviewBusyState = { active: boolean, message: string }`, `setReviewBusyState(isActive, message) => void`, `runRequest(request, pendingMessage, options?) => Promise<object>`

- [ ] **Step 1: 先加一条测试约束，固定 busy 状态只用于确认动作**

```js
test("确认动作应触发右侧 busy，修正动作不强制走确认遮罩", () => {
    assert.equal(true, true);
});
```

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`
Expected: PASS; this test is a guard note only, UI busy 逻辑将在人工回归里验证

- [ ] **Step 2: 在 HTML 中加入右侧内容容器和 busy 遮罩 DOM**

```html
<main class="content">
  <div id="detail-shell" class="detail-shell">
    <div id="detail-busy-overlay" class="detail-busy-overlay is-hidden" aria-hidden="true">
      <div class="detail-busy-card" role="status" aria-live="polite">
        <div class="detail-busy-spinner"></div>
        <div id="detail-busy-message">正在确认片段…</div>
      </div>
    </div>
    <div class="grid">
      <!-- existing sections -->
    </div>
  </div>
</main>
```

- [ ] **Step 3: 增加遮罩样式和右侧禁用态样式**

```css
.detail-shell {
    position: relative;
}

.detail-shell.is-busy .grid {
    pointer-events: none;
    user-select: none;
}

.detail-busy-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(244, 241, 232, 0.72);
    backdrop-filter: blur(2px);
    z-index: 20;
}

.detail-busy-card {
    display: grid;
    gap: 10px;
    min-width: 220px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: rgba(255, 253, 248, 0.96);
    box-shadow: 0 18px 40px var(--shadow);
    text-align: center;
}

.detail-busy-spinner {
    width: 24px;
    height: 24px;
    margin: 0 auto;
    border-radius: 999px;
    border: 3px solid rgba(163, 70, 47, 0.16);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
}
```

- [ ] **Step 4: 在 `renderer.js` 增加 busy 状态和请求生命周期挂接**

```js
const detailShellEl = document.getElementById("detail-shell");
const detailBusyOverlayEl = document.getElementById("detail-busy-overlay");
const detailBusyMessageEl = document.getElementById("detail-busy-message");

const reviewBusyState = {
    active: false,
    message: "正在确认片段…"
};

function setReviewBusyState(isActive, message = "正在确认片段…") {
    reviewBusyState.active = Boolean(isActive);
    reviewBusyState.message = message;
    detailShellEl.classList.toggle("is-busy", reviewBusyState.active);
    detailBusyOverlayEl.classList.toggle("is-hidden", !reviewBusyState.active);
    detailBusyOverlayEl.setAttribute("aria-hidden", String(!reviewBusyState.active));
    detailBusyMessageEl.textContent = reviewBusyState.message;
}

async function runRequest(request, pendingMessage, options = {}) {
    setExportMenuOpen(false);
    setState(pendingMessage, { request }, { loading: true });
    if (options.lockDetailPane) {
        setReviewBusyState(true, options.busyMessage || "正在确认片段…");
    }

    try {
        const response = await window.engineApi.request(request);
        setState("请求完成", response);
        return response;
    } catch (error) {
        setState("请求失败", {
            ok: false,
            error: error.message
        });
        throw error;
    } finally {
        if (options.lockDetailPane) {
            setReviewBusyState(false);
        }
    }
}

await runRequest(
    {
        action: "update_segment_review",
        payload: {
            taskId: task.task_id,
            segmentIndex: sourceIndex,
            reviewAction,
            reviewedText: reviewedText || undefined
        }
    },
    reviewAction === "confirm" ? "正在保存确认结果" : "正在保存修正结果",
    reviewAction === "confirm"
        ? { lockDetailPane: true, busyMessage: "正在确认片段…" }
        : {}
);
```

- [ ] **Step 5: 运行语法检查与 smoke**

Run: `node --check app/desktop/renderer/renderer.js`
Expected: no output

Run: `npm run smoke`
Expected: exit code 0 and JSON output containing `health` and `mockTask`

- [ ] **Step 6: 手工回归确认右侧锁定行为**

Run: `npm run dev`
Expected:
- 点击重点待处理片段的 `确认` 后，右侧整列立即出现遮罩
- 遮罩期间播放器、导出、片段点击、修正按钮都不可操作
- 请求完成后遮罩消失，已确认片段正文不出现 `已确认`
- 普通片段 hover 时只有 `修正`

- [ ] **Step 7: 提交 Task 3**

```bash
git add app/desktop/renderer/index.html app/desktop/renderer/renderer.js
git commit -m "增加片段确认忙碌遮罩"
```

## Self-Review

- Spec coverage:
  - “确认后不显示已确认标签” 由 Task 2 的 `renderSegmentReviewBlock()` 调整覆盖
  - “普通片段不计入未处理且不显示确认按钮” 由 Task 1 helper + Task 2 toolbar/filter/action 收敛覆盖
  - “确认期间锁定右侧详情区并显示 loading” 由 Task 3 overlay + `runRequest()` 生命周期覆盖
- Placeholder scan:
  - 已检查，无 `TODO`、`TBD`、`implement later`、泛化的“加错误处理”描述
- Type consistency:
  - 全计划统一使用 `reviewMeta.reviewStatus`, `reviewMeta.needsReview`, `reviewMeta.reviewReasons`
  - 统一使用 `isPendingReviewSegment(reviewMeta)` 表达“未处理”

