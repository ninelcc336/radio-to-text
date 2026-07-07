# 审核反馈收敛与片段软删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 去掉内容区顶部常驻状态提示，仅保留失败提示；把片段编辑态“保存 / 取消”改成小胶囊；为所有片段增加软删除能力并让删除结果同步到导出产物。

**Architecture:** 后端继续复用 `update_segment_review` 这条审核保存链路，在 `review_status` 上增加 `deleted` 状态并让文本重建逻辑默认过滤已删除片段，避免改动片段索引。前端去掉常驻状态条，把失败提示收敛成按需显示的轻量错误提示；片段渲染和导出都依赖同一套“删除片段不可见”规则，保证界面与导出一致。

**Tech Stack:** Electron, 原生 HTML/CSS, 原生 JavaScript, Python 3.12, Node `node:test`, `unittest`, 现有冒烟脚本

## Global Constraints

- 不引入新的桌面通知依赖或第三方提示组件
- 不做真正的数组物理删除，不改变现有片段索引体系
- 删除动作采用软删除，默认不显示、不导出，但保留底层数据
- 本次不实现已删除片段恢复入口
- 失败提示必须保留，避免用户在请求失败时无感知
- 不能把“删除”实现成“修正为空文本”

---

### Task 1: 为审核链路补齐软删除状态与空导出支持

**Files:**
- Create: `engine/python/tests/test_pipeline_review_actions.py`
- Modify: `engine/python/radio_to_text/pipeline.py`

**Interfaces:**
- Consumes: `ProcessingPipeline.update_segment_review(task_id: str, segment_index: int, review_action: str, reviewed_text: str | None = None) -> dict[str, Any]`
- Produces: `review_action == "delete"` 时将目标片段标记为 `review_status: "deleted"`，并在 `plain_text`、`speaker_text`、`speaker_segments`、导出文件中默认排除

- [ ] **Step 1: 创建后端测试文件，先写“软删除后不再出现在最终文本里”的失败用例**

```python
import tempfile
import unittest
from pathlib import Path

from radio_to_text.config import EngineConfig
from radio_to_text.pipeline import ProcessingPipeline


def build_test_config(root: Path) -> EngineConfig:
    return EngineConfig(
        root_dir=root,
        tasks_dir=root / "tasks",
        logs_dir=root / "logs",
        model_cache_dir=root / "cache" / "models",
        term_replacements_path=root / "tools" / "term-replacements.json",
        audio_enhance_enabled=False,
        loudness_normalization_enabled=True,
        target_lufs=-16.0,
        silence_trim_enabled=False,
        silence_trim_min_duration=0.1,
        silence_trim_keep_duration=0.12,
        silence_trim_threshold_db=-50.0,
        model_name="small",
        accuracy_profile="balanced",
        compute_type="int8",
        device="cpu",
        beam_size=5,
        vad_filter=True,
        language="zh",
        initial_prompt="",
        chunk_seconds=150.0,
        chunk_overlap_seconds=12.0,
        sample_rate=16000,
        max_speakers=4,
    )


class PipelineReviewActionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        tools_dir = self.root / "tools"
        tools_dir.mkdir(parents=True, exist_ok=True)
        (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")
        self.pipeline = ProcessingPipeline(build_test_config(self.root))
        self.task = self.pipeline.store.create_task("mock.wav")
        self.task["results"]["segments"] = [
            {"start": 0.0, "end": 1.0, "text": "第一句", "review_status": "pending"},
            {"start": 1.0, "end": 2.0, "text": "重复句", "review_status": "pending"},
        ]
        self.task["results"]["speaker_segments"] = [
            {"start": 0.0, "end": 1.0, "speaker": "A", "text": "第一句"},
            {"start": 1.0, "end": 2.0, "speaker": "A", "text": "重复句"},
        ]
        self.task["results"]["plain_text"] = "[00:00:00] 第一句\n[00:00:01] 重复句"
        self.task["results"]["speaker_text"] = (
            "[00:00:00] 说话人 A：第一句\n[00:00:01] 说话人 A：重复句"
        )
        self.pipeline.store.save_task(self.task)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_delete_action_hides_segment_from_outputs(self) -> None:
        updated = self.pipeline.update_segment_review(
            self.task["task_id"], 1, "delete"
        )

        statuses = [item["review_status"] for item in updated["results"]["segments"]]
        self.assertEqual(statuses, ["pending", "deleted"])
        self.assertEqual(updated["results"]["plain_text"], "[00:00:00] 第一句")
        self.assertEqual(
            updated["results"]["speaker_text"], "[00:00:00] 说话人 A：第一句"
        )
```

- [ ] **Step 2: 运行单测，确认它先因为不支持 `delete` 动作而失败**

Run: ``$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_pipeline_review_actions.py -v``

Expected: FAIL，报错包含 `Unsupported review action: delete`

- [ ] **Step 3: 在 `update_segment_review()` 中增加 `delete` 分支，并为删除动作写日志**

```python
if action == "confirm":
    segment["review_status"] = "confirmed"
    segment["review_updated_at"] = updated_at
elif action == "correct":
    next_text = str(reviewed_text or "").strip()
    if not next_text:
        raise ValueError("Reviewed text must not be empty")
    segment["text"] = next_text
    segment["review_status"] = "corrected"
    segment["reviewed_text"] = next_text
    segment["review_updated_at"] = updated_at
elif action == "delete":
    segment["review_status"] = "deleted"
    segment["review_updated_at"] = updated_at
else:
    raise RuntimeError(f"Unsupported review action: {review_action}")
```

- [ ] **Step 4: 在 `_rebuild_transcript_outputs()` 前新增过滤函数，让已删除片段不进入最终文本与说话人文本**

```python
def _is_deleted_segment(self, segment: dict[str, Any]) -> bool:
    return str(segment.get("review_status", "")).strip().lower() == "deleted"


def _visible_segments(self, segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [dict(item) for item in segments if not self._is_deleted_segment(item)]


def _rebuild_transcript_outputs(self, task: dict[str, Any]) -> None:
    segments = [dict(item) for item in task["results"].get("segments", [])]
    speaker_segments = [
        dict(item) for item in task["results"].get("speaker_segments", [])
    ]
    for segment in segments:
        self._ensure_review_defaults(segment)
    visible_segments = self._visible_segments(segments)
    visible_speaker_segments = self._sync_speaker_segment_texts(
        visible_segments, speaker_segments
    )
    task["results"]["segments"] = segments
    task["results"]["speaker_segments"] = visible_speaker_segments
    task["results"]["plain_text"] = self._build_plain_text(visible_segments)
    task["results"]["speaker_text"] = self._build_speaker_text(visible_speaker_segments)
    task["results"]["full_text"] = task["results"]["plain_text"]
```

- [ ] **Step 5: 调整导出逻辑，允许“全部片段已删”时导出空文本或仅标题的 Markdown**

```python
def export_task(self, task_id: str, fmt: str) -> dict[str, Any]:
    task = self.store.load_task(task_id)
    speaker_segments = task["results"].get("speaker_segments", [])

    export_path = self.store.export_path(task_id, fmt)
    if fmt == "txt":
        export_txt(export_path, task["results"].get("plain_text", ""))
    elif fmt == "md":
        export_md(export_path, speaker_segments, task_id)
    elif fmt == "json":
        export_json(export_path, task)
    else:
        raise RuntimeError(f"Unsupported export format: {fmt}")
```

- [ ] **Step 6: 补一个“删光全部片段也能导出”的测试，确保不会因为空 `speaker_segments` 报错**

```python
    def test_delete_all_segments_still_exports_empty_outputs(self) -> None:
        self.pipeline.update_segment_review(self.task["task_id"], 0, "delete")
        updated = self.pipeline.update_segment_review(self.task["task_id"], 1, "delete")

        self.assertEqual(updated["results"]["plain_text"], "")
        self.assertEqual(updated["results"]["speaker_text"], "")
        md_path = self.pipeline.store.export_path(self.task["task_id"], "md")
        self.assertTrue(md_path.exists())
        self.assertIn("# 语音转写结果", md_path.read_text(encoding="utf-8"))
```

- [ ] **Step 7: 再跑一次 Python 单测，确认删除状态与空导出逻辑通过**

Run: ``$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_pipeline_review_actions.py -v``

Expected: PASS，至少包含 `test_delete_action_hides_segment_from_outputs ... ok` 与 `test_delete_all_segments_still_exports_empty_outputs ... ok`

- [ ] **Step 8: Commit**

```bash
git add engine/python/tests/test_pipeline_review_actions.py engine/python/radio_to_text/pipeline.py
git commit -m "增加片段软删除审核动作"
```

### Task 2: 扩展前端审核状态逻辑并过滤已删除片段

**Files:**
- Modify: `app/desktop/renderer/review-logic.js`
- Modify: `app/desktop/renderer/__tests__/review-logic.test.js`
- Modify: `app/desktop/renderer/renderer.js`

**Interfaces:**
- Consumes: `buildSegmentReviewMeta(segment)`, `getReviewStatus(segment)`, `getActiveTranscriptData(task)`, `submitSegmentReview(sourceIndex, reviewAction, reviewedText?)`
- Produces: 删除状态不再被当作待处理片段；片段列表默认不渲染 `review_status === "deleted"` 的结果

- [ ] **Step 1: 先给前端审核逻辑增加失败用例，要求模块显式导出删除态辅助函数**

```js
test("exports delete-state helper in Node", () => {
    assert.equal(typeof reviewLogic.isDeletedReviewSegment, "function");
});

test("deleted segments do not count as pending or show confirmation UI", () => {
    const reviewMeta = reviewLogic.buildSegmentReviewMeta({
        needs_review: true,
        review_status: "deleted"
    });

    assert.equal(reviewLogic.isDeletedReviewSegment({ review_status: "deleted" }), true);
    assert.equal(reviewLogic.isPendingReviewSegment(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmAction(reviewMeta), false);
    assert.equal(reviewLogic.shouldShowConfirmedBadge(reviewMeta), false);
});
```

- [ ] **Step 2: 运行前端单测，确认新断言先因为缺少 `isDeletedReviewSegment` 而失败**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`

Expected: FAIL，报错包含 `isDeletedReviewSegment`

- [ ] **Step 3: 在 `review-logic.js` 中显式补充删除状态判断，方便渲染层复用**

```js
function isDeletedReviewSegment(segment) {
    return getReviewStatus(segment) === "deleted";
}

return {
    buildSegmentReviewMeta,
    getReviewStatus,
    isPendingReviewSegment,
    shouldShowConfirmAction,
    shouldShowConfirmedBadge,
    isDeletedReviewSegment
};
```

- [ ] **Step 4: 在 `renderer.js` 中增加可见片段过滤函数，并统一给列表、导出按钮统计、播放器定位使用**

```js
function isDeletedSegment(segment) {
  return getReviewStatus(segment) === "deleted";
}

function getVisibleTranscriptEntries(task) {
  const segments = getActiveTranscriptData(task).segments || [];
  return segments
    .map((segment, sourceIndex) => ({ segment, sourceIndex }))
    .filter((entry) => !isDeletedSegment(entry.segment));
}
```

- [ ] **Step 5: 把 `renderTask()`、`getVisibleTranscriptSegments()`、`buildTranscriptLines()` 等基于 `segments` 直接遍历的位置切到统一过滤结果**

```js
const visibleEntries = getVisibleTranscriptEntries(task);
const hasAnyOutput = Boolean(visibleEntries.length || fullText.trim());

if (visibleEntries.length) {
  const filteredEntries = applyTranscriptReviewFilter(task, visibleEntries);
  renderTranscriptSegments(filteredEntries);
  return;
}
```

- [ ] **Step 6: 再跑一次前端单测，确认删除态逻辑与现有待审逻辑兼容**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`

Expected: PASS，包含 `deleted segments do not count as pending or show confirmation UI`

- [ ] **Step 7: Commit**

```bash
git add app/desktop/renderer/review-logic.js app/desktop/renderer/__tests__/review-logic.test.js app/desktop/renderer/renderer.js
git commit -m "过滤已删除片段的前端审核状态"
```

### Task 3: 收敛失败提示并统一片段操作按钮样式

**Files:**
- Modify: `app/desktop/renderer/index.html`
- Modify: `app/desktop/renderer/renderer.js`

**Interfaces:**
- Consumes: `setState(message, payload, options = {})`, 片段操作区 `buildSegmentActions(task, reviewMeta, sourceIndex)`, 编辑区 `buildSegmentEditor(segment, sourceIndex)`
- Produces: 成功/处理中不再显示常驻顶部状态条；失败时按需显示错误提示；编辑态按钮与常规片段按钮统一为小胶囊

- [ ] **Step 1: 删除顶部常驻状态条 DOM，占位改成按需显示的错误提示容器**

```html
<main class="content">
  <div id="status" class="status is-hidden" role="alert" aria-live="assertive"></div>
  <div id="detail-shell" class="detail-shell">
```

- [ ] **Step 2: 把 `.status` 样式改成只服务失败提示的小型错误条，默认隐藏**

```css
.status {
  display: none;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid #efb1b1;
  background: #fdecec;
  color: #982d2d;
  font-size: 13px;
  font-weight: 600;
}

.status.is-visible {
  display: flex;
}

.status.is-hidden {
  display: none;
}
```

- [ ] **Step 3: 调整 `setState()`，只在失败时展示提示，其余状态清空并隐藏**

```js
function setState(message, payload, options = {}) {
  const isError = options.variant === "error" || payload?.ok === false;
  statusEl.textContent = isError ? message : "";
  statusEl.dataset.lastPayload = JSON.stringify(payload ?? {});
  statusEl.classList.toggle("is-visible", isError);
  statusEl.classList.toggle("is-hidden", !isError);
}
```

- [ ] **Step 4: 在 `runRequest()` 和其他失败分支里，确保失败调用明确传入错误态；成功态只负责更新数据，不再展示常驻提示**

```js
setState("请求失败", {
  ok: false,
  error: error.message
}, { variant: "error" });
```

- [ ] **Step 5: 统一片段编辑态按钮样式，并新增删除按钮**

```css
.segment-actions button,
.segment-editor-actions button {
  width: auto;
  min-height: 32px;
  padding: 7px 11px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1;
}

.segment-action-delete {
  background: #f8dddd;
  color: #972f2f;
}
```

- [ ] **Step 6: 在 `buildSegmentActions()` 中为所有片段追加删除按钮；在 `buildSegmentEditor()` 中让“保存 / 取消”复用小胶囊类名**

```js
const deleteButton = document.createElement("button");
deleteButton.type = "button";
deleteButton.className = "segment-action-delete";
deleteButton.textContent = "删除";
deleteButton.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  await submitSegmentReview(sourceIndex, "delete");
});
actions.appendChild(deleteButton);

saveButton.className = "segment-action-save";
cancelButton.className = "segment-action-edit";
```

- [ ] **Step 7: 为删除动作补充用户可感知的失败提示校验，确保空修正、删除失败、播放失败都能落到错误提示容器**

Run: `rg -n "setState\\(\".*失败|ok: false|variant: \"error\"" app/desktop/renderer/renderer.js`

Expected: 错误分支保留，成功分支不再依赖顶部常驻提示

- [ ] **Step 8: Commit**

```bash
git add app/desktop/renderer/index.html app/desktop/renderer/renderer.js
git commit -m "收敛审核反馈并调整片段按钮样式"
```

### Task 4: 端到端验证与回归检查

**Files:**
- Verify: `app/desktop/renderer/index.html`
- Verify: `app/desktop/renderer/renderer.js`
- Verify: `engine/python/radio_to_text/pipeline.py`
- Verify: `engine/python/tests/test_pipeline_review_actions.py`

**Interfaces:**
- Consumes: `npm run smoke`, `node --test app/desktop/renderer/__tests__/review-logic.test.js`, `python -m unittest ...`
- Produces: 确认软删除、失败提示、编辑态按钮样式与现有主流程兼容

- [ ] **Step 1: 跑前端审核逻辑测试**

Run: `node --test app/desktop/renderer/__tests__/review-logic.test.js`

Expected: PASS

- [ ] **Step 2: 跑 Python 审核动作测试**

Run: ``$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_pipeline_review_actions.py -v``

Expected: PASS

- [ ] **Step 3: 跑桌面冒烟脚本**

Run: `npm run smoke`

Expected: 退出码 `0`，输出包含健康检查通过和模拟任务完成

- [ ] **Step 4: 查看最终差异，确认仅包含计划范围内文件**

Run: `git diff --stat -- app/desktop/renderer/index.html app/desktop/renderer/renderer.js app/desktop/renderer/review-logic.js app/desktop/renderer/__tests__/review-logic.test.js engine/python/radio_to_text/pipeline.py engine/python/tests/test_pipeline_review_actions.py`

Expected: 仅包含失败提示、按钮样式、删除动作、测试文件相关差异

- [ ] **Step 5: Commit**

```bash
git add app/desktop/renderer/index.html app/desktop/renderer/renderer.js app/desktop/renderer/review-logic.js app/desktop/renderer/__tests__/review-logic.test.js engine/python/radio_to_text/pipeline.py engine/python/tests/test_pipeline_review_actions.py
git commit -m "完成审核反馈与软删除交互"
```
