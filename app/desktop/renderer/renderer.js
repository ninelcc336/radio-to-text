const statusEl = document.getElementById("status");
const detailEl = document.getElementById("task-detail");
const detailShellEl = document.getElementById("detail-shell");
const detailBusyOverlayEl = document.getElementById("detail-busy-overlay");
const detailBusyMessageEl = document.getElementById("detail-busy-message");
const outputEl = document.getElementById("task-output");
const outputToolbarEl = document.getElementById("output-toolbar");
const reviewToolbarEl = document.getElementById("review-toolbar");
const taskListEl = document.getElementById("task-list");
const selectButton = document.getElementById("select-button");
const processButton = document.getElementById("process-button");
const refreshButton = document.getElementById("refresh-button");
const copyOutputButton = document.getElementById("copy-output-button");
const saveOutputButton = document.getElementById("save-output-button");
const saveMdButton = document.getElementById("save-md-button");
const exportMenuButton = document.getElementById("export-menu-button");
const exportDropdownEl = document.getElementById("export-dropdown");
const viewCleanButton = document.getElementById("view-clean-button");
const viewRawButton = document.getElementById("view-raw-button");
const filterAllButton = document.getElementById("filter-all-button");
const filterReviewButton = document.getElementById("filter-review-button");
const filterUnprocessedButton = document.getElementById("filter-unprocessed-button");
const reviewCountEl = document.getElementById("review-count");
const audioStatusEl = document.getElementById("audio-status");
const playToggleButton = document.getElementById("play-toggle-button");
const seekBackwardButton = document.getElementById("seek-backward-button");
const seekForwardButton = document.getElementById("seek-forward-button");
const audioCurrentTimeEl = document.getElementById("audio-current-time");
const audioDurationEl = document.getElementById("audio-duration");
const audioProgressEl = document.getElementById("audio-progress");
const audioEl = document.getElementById("task-audio");

const reviewLogic = globalThis.reviewLogic || {};
const {
  buildSegmentReviewMeta: buildSegmentReviewMetaFromModule,
  getReviewStatus: getReviewStatusFromModule,
  isDeletedReviewSegment: isDeletedReviewSegmentFromModule,
  isPendingReviewSegment: isPendingReviewSegmentFromModule,
  shouldShowConfirmAction: shouldShowConfirmActionFromModule
} = reviewLogic;

let selectedTaskId = null;
let editingTaskId = null;
let tasksCache = [];
let audioLoadToken = 0;

const transcriptViewState = {
  taskId: null,
  textVersion: "clean",
  reviewFilter: "all"
};

const segmentEditorState = {
  taskId: null,
  sourceIndex: -1,
  draftText: ""
};

const exportMenuState = {
  isOpen: false
};

const reviewBusyState = {
  active: false,
  message: "正在确认片段..."
};

const playerState = {
  taskId: null,
  sourcePath: "",
  isAvailable: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  activeSegmentIndex: -1,
  message: "尚未选择任务。"
};

// 页面展示统一用中文状态，不直接暴露后端内部枚举值。
const STATUS_LABELS = {
  created: "已创建",
  ready: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "失败"
};

const STAGE_LABELS = {
  created: "已创建",
  imported: "已导入",
  preprocessing: "预处理中",
  transcribing: "转写中",
  diarizing: "分人中",
  exporting: "导出中",
  completed: "已完成",
  skeleton: "骨架测试"
};

function labelStatus(status) {
  return STATUS_LABELS[status] || status || "-";
}

function labelStage(stage) {
  return STAGE_LABELS[stage] || stage || "-";
}

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

function formatTaskDuration(durationSeconds) {
  if (typeof durationSeconds !== "number") {
    return "-";
  }
  return `${durationSeconds.toFixed(1)} 秒`;
}

function renderTaskDetail(task) {
  const metadata = task.metadata || {};
  const statusText = labelStatus(task.status);
  const stageText = labelStage(task.stage);
  const rows = [
    ["任务名称", task.name || "未命名任务"],
    ["任务 ID", task.task_id || "-"],
    ["阶段", stageText],
    ["源文件", metadata.original_file_name || task.source_path || "-"],
    ["时长", formatTaskDuration(metadata.duration_seconds)],
    ["采样率", metadata.sample_rate || "-"]
  ];

  const detailRowsHtml = rows
    .map(
      ([label, value]) => `
        <div class="task-detail-row">
          <div class="task-detail-label">${escapeHtml(label)}</div>
          <div class="task-detail-value">${escapeHtml(value)}</div>
        </div>
      `
    )
    .join("");

  return `
    <div class="task-status-banner is-${taskStatusTone(task.status)}">
      <div class="task-status-eyebrow">当前状态</div>
      <div class="task-status-value">${escapeHtml(statusText)}</div>
      <div class="task-status-stage">阶段：${escapeHtml(stageText)}</div>
    </div>
    <div class="task-detail-grid">${detailRowsHtml}</div>
  `;
}

function setState(message, payload, options = {}) {
  const isError = options.variant === "error" || payload?.ok === false;
  const errorMessage = payload?.error ? `${message}：${payload.error}` : message;
  statusEl.textContent = isError ? errorMessage : "";
  statusEl.dataset.lastPayload = JSON.stringify(payload ?? {});
  statusEl.classList.toggle("is-visible", isError);
  statusEl.classList.toggle("is-hidden", !isError);
  statusEl.classList.toggle("is-loading", false);
}

function currentTask() {
  if (!selectedTaskId) {
    return null;
  }
  return tasksCache.find((task) => task.task_id === selectedTaskId) || null;
}

function resetTranscriptViewState(taskId = null) {
  transcriptViewState.taskId = taskId;
  transcriptViewState.textVersion = "clean";
  transcriptViewState.reviewFilter = "all";
}

function ensureTranscriptViewState(task) {
  const taskId = task?.task_id || null;
  if (transcriptViewState.taskId !== taskId) {
    resetTranscriptViewState(taskId);
  }
}

function setTranscriptViewState(nextState) {
  Object.assign(transcriptViewState, nextState);
}

function setExportMenuOpen(isOpen) {
  exportMenuState.isOpen = Boolean(isOpen);
  exportDropdownEl.classList.toggle("is-hidden", !exportMenuState.isOpen);
  exportMenuButton.classList.toggle("is-open", exportMenuState.isOpen);
  exportMenuButton.setAttribute("aria-expanded", String(exportMenuState.isOpen));
}

function setReviewBusyState(isActive, message = "正在确认片段...") {
  reviewBusyState.active = Boolean(isActive);
  reviewBusyState.message = message;
  detailShellEl.classList.toggle("is-busy", reviewBusyState.active);
  detailBusyOverlayEl.classList.toggle("is-hidden", !reviewBusyState.active);
  detailBusyOverlayEl.setAttribute("aria-hidden", String(!reviewBusyState.active));
  detailBusyMessageEl.textContent = reviewBusyState.message;
}

function resetSegmentEditorState(taskId = null) {
  segmentEditorState.taskId = taskId;
  segmentEditorState.sourceIndex = -1;
  segmentEditorState.draftText = "";
}

function ensureSegmentEditorState(task) {
  const taskId = task?.task_id || null;
  if (segmentEditorState.taskId !== taskId) {
    resetSegmentEditorState(taskId);
  }
}

async function syncTaskDetailFromCache() {
  if (!selectedTaskId) {
    await syncTaskView(null);
    return;
  }

  const activeTask = tasksCache.find((task) => task.task_id === selectedTaskId) || null;
  await syncTaskView(activeTask);
}

async function syncTaskView(task) {
  renderTask(task);
  await syncTaskAudio(task);
}

// 页面主区域拆成任务信息、播放器和句子列表，方便边听边核对。
function renderTask(task) {
  ensureTranscriptViewState(task);
  ensureSegmentEditorState(task);

  if (!task) {
    detailEl.textContent = "尚未选择任务。";
    reviewToolbarEl.classList.add("is-hidden");
    renderTranscriptEmpty("尚无转写结果。");
    outputToolbarEl.classList.add("is-hidden");
    setExportMenuOpen(false);
    saveMdButton.disabled = true;
    return;
  }

  detailEl.innerHTML = renderTaskDetail(task);

  const activeTranscript = getActiveTranscriptData(task);
  const segments = getRenderableActiveSegments(task);
  const fullText = activeTranscript.plainText;
  const hasAnyOutput = Boolean(segments.length || fullText.trim());
  outputToolbarEl.classList.toggle("is-hidden", !hasAnyOutput);
  if (!hasAnyOutput) {
    setExportMenuOpen(false);
  }
  saveMdButton.disabled = !buildTranscriptLines(task).length;
  renderTranscriptToolbar(task);

  if (segments.length) {
    const visibleSegments = getVisibleTranscriptSegments(task);
    if (!visibleSegments.length && transcriptViewState.reviewFilter !== "all") {
      if (transcriptViewState.reviewFilter === "review-only") {
        renderReviewEmptyState("当前文本版本下没有需要重点核对的片段。");
      } else {
        renderReviewEmptyState("当前文本版本下没有未处理片段。");
      }
      return;
    }
    if (!visibleSegments.length) {
      renderTranscriptEmpty("当前文本版本下暂无可展示片段。");
      return;
    }
    renderTranscriptSegments(visibleSegments);
    return;
  }

  if (fullText.trim()) {
    outputEl.className = "transcript-plain";
    outputEl.textContent = fullText;
    return;
  }

  renderTranscriptEmpty("尚无转写结果。");
}

function renderTranscriptToolbar(task) {
  const activeTranscript = getActiveTranscriptData(task);
  const finalSegments = getFinalTranscriptSegments(task);
  const pendingSegments = finalSegments
    .map((segment) => buildSegmentReviewMeta(segment))
    .filter((reviewMeta) => isPendingReviewMeta(reviewMeta));
  const hasAnyOutput = Boolean(
    activeTranscript.segments.length || activeTranscript.plainText.trim()
  );
  const hasStructuredTranscript = Boolean(
    activeTranscript.segments.length || getAlternateTranscriptSegments(task).length > 0
  );

  reviewToolbarEl.classList.toggle("is-hidden", !hasStructuredTranscript);
  exportMenuButton.disabled = !hasAnyOutput;
  if (!hasAnyOutput) {
    setExportMenuOpen(false);
  }
  if (!hasStructuredTranscript) {
    return;
  }

  viewCleanButton.classList.toggle(
    "is-active",
    transcriptViewState.textVersion === "clean"
  );
  viewRawButton.classList.toggle("is-active", transcriptViewState.textVersion === "raw");
  filterAllButton.classList.toggle(
    "is-active",
    transcriptViewState.reviewFilter === "all"
  );
  filterReviewButton.classList.toggle(
    "is-active",
    transcriptViewState.reviewFilter === "review-only"
  );
  filterUnprocessedButton.classList.toggle(
    "is-active",
    transcriptViewState.reviewFilter === "pending-only"
  );
  reviewCountEl.textContent = `未处理 ${pendingSegments.length}`;
}

function renderTranscriptSegments(entries) {
  outputEl.className = "transcript-list";
  outputEl.innerHTML = "";
  const task = currentTask();
  const isEditableView = transcriptViewState.textVersion === "clean";

  for (const entry of entries) {
    const { segment, sourceIndex, reviewMeta } = entry;
    const card = document.createElement("div");
    card.className = "segment-card";
    card.dataset.sourceIndex = String(sourceIndex);
    if (sourceIndex === playerState.activeSegmentIndex) {
      card.classList.add("is-active");
    }
    if (isPendingReviewMeta(reviewMeta)) {
      card.classList.add("needs-review");
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-button";
    const reviewReasons = reviewMeta.reviewReasons;
    const reviewHtml = renderSegmentReviewBlock(reviewMeta, reviewReasons);
    button.innerHTML = `
      <span class="segment-time">${escapeHtml(formatTimestamp(segment.start))}</span>
      <span class="segment-copy">
        <span class="segment-text">${escapeHtml(segment.text || "")}</span>
        ${reviewHtml}
      </span>
    `;
    button.addEventListener("click", async () => {
      await jumpToSegment(sourceIndex);
    });
    card.appendChild(button);

    if (isEditableView) {
      if (segmentEditorState.sourceIndex === sourceIndex) {
        card.appendChild(buildSegmentEditor(segment, sourceIndex));
      } else {
        const actions = buildSegmentActions(task, reviewMeta, sourceIndex);
        if (actions) {
          card.appendChild(actions);
        }
      }
    }

    outputEl.appendChild(card);
  }
}

function renderSegmentReviewBlock(reviewMeta, reviewReasons) {
  if (reviewMeta.reviewStatus === "corrected") {
    return `
      <span class="segment-review">
        <span class="segment-status-chip is-corrected">已修正</span>
      </span>
    `;
  }

  if (!isPendingReviewMeta(reviewMeta)) {
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

  if (shouldShowConfirmForMeta(reviewMeta)) {
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
  editButton.textContent =
    reviewMeta.reviewStatus === "corrected" ? "再修正" : "修正";
  editButton.title =
    reviewMeta.reviewStatus === "corrected" ? "再次编辑这条片段" : "编辑并修正这条片段";
  editButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    beginSegmentEdit(sourceIndex);
  });
  actions.appendChild(editButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "segment-action-delete";
  deleteButton.textContent = "删除";
  deleteButton.title = "将这条片段从最终文本中隐藏";
  deleteButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const confirmed = window.confirm(
      "确认删除这条片段吗？删除后会从最终文本和导出结果中隐藏。"
    );
    if (!confirmed) {
      return;
    }
    await submitSegmentReview(sourceIndex, "delete");
  });
  actions.appendChild(deleteButton);
  return actions;
}

function buildSegmentEditor(segment, sourceIndex) {
  const editor = document.createElement("div");
  editor.className = "segment-editor";

  const textarea = document.createElement("textarea");
  textarea.value = segmentEditorState.draftText;
  textarea.placeholder = "输入修正后的文本";
  textarea.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  textarea.addEventListener("input", (event) => {
    segmentEditorState.draftText = event.target.value;
  });
  editor.appendChild(textarea);

  const actions = document.createElement("div");
  actions.className = "segment-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "segment-action-save";
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await submitSegmentReview(
      sourceIndex,
      "correct",
      segmentEditorState.draftText.trim()
    );
  });
  actions.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "segment-action-edit";
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetSegmentEditorState(currentTask()?.task_id || null);
    rerenderTranscriptView();
  });
  actions.appendChild(cancelButton);

  editor.appendChild(actions);
  queueMicrotask(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
  return editor;
}

function renderReviewEmptyState(message) {
  outputEl.className = "empty-state";
  outputEl.textContent = message;
}

function renderTranscriptEmpty(message) {
  outputEl.className = "empty-state";
  outputEl.textContent = message;
}

function updateTranscriptHighlight() {
  const segmentCards = outputEl.querySelectorAll(".segment-card");
  for (const card of segmentCards) {
    const isActive = Number(card.dataset.sourceIndex) === playerState.activeSegmentIndex;
    card.classList.toggle("is-active", isActive);
  }
}

function renderTaskList(tasks) {
  taskListEl.innerHTML = "";
  if (!tasks.length) {
    taskListEl.textContent = "还没有任务。";
    return;
  }

  for (const task of tasks) {
    const row = document.createElement("div");
    row.className = "task-row";

    const button = document.createElement("button");
    button.className = "secondary task-item-button";
    if (selectedTaskId === task.task_id) {
      button.classList.add("is-active");
    }
    if (editingTaskId === task.task_id) {
      button.innerHTML = `
        <input class="task-name-edit" value="${escapeHtml(task.name || "未命名任务")}" />
        <span class="task-subtitle">${labelStatus(task.status)}</span>
      `;
    } else {
      button.innerHTML = `
        <span class="task-name" title="双击重命名">${escapeHtml(task.name || "未命名任务")}</span>
        <span class="task-subtitle">${labelStatus(task.status)}</span>
      `;
    }
    button.addEventListener("click", async () => {
      if (editingTaskId === task.task_id) {
        return;
      }
      selectedTaskId = task.task_id;
      renderTaskList(tasksCache);
      await syncTaskView(task);
      setState("已加载任务详情", { taskId: task.task_id });
    });
    button.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginInlineRename(task.task_id);
    });

    const renameButton = document.createElement("button");
    renameButton.className = "task-rename-button";
    renameButton.textContent = "✎";
    renameButton.title = "重命名任务";
    renameButton.setAttribute("aria-label", "重命名任务");
    renameButton.addEventListener("click", (event) => {
      event.stopPropagation();
      beginInlineRename(task.task_id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger task-delete-button";
    deleteButton.textContent = "X";
    deleteButton.title = "删除任务";
    deleteButton.setAttribute("aria-label", "删除任务");
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      // 删除是破坏性操作，先做一次明确确认。
      const confirmed = window.confirm(
        `确定删除任务 ${task.task_id} 吗？\n这会同时删除该任务的本地结果文件。`
      );
      if (!confirmed) {
        return;
      }

      await runRequest(
        {
          action: "delete_task",
          payload: {
            taskId: task.task_id
          }
        },
        "正在删除任务"
      );

      if (selectedTaskId === task.task_id) {
        selectedTaskId = null;
        await syncTaskView(null);
      }
    });

    row.appendChild(button);
    row.appendChild(renameButton);
    row.appendChild(deleteButton);
    taskListEl.appendChild(row);

    if (editingTaskId === task.task_id) {
      const input = button.querySelector(".task-name-edit");
      queueMicrotask(() => {
        input.focus();
        input.select();
      });

      let finished = false;
      const finish = async (shouldSave) => {
        if (finished) {
          return;
        }
        finished = true;

        const nextName = input.value.trim();
        if (!shouldSave) {
          editingTaskId = null;
          await refreshTasks();
          return;
        }

        if (!nextName) {
          setState("重命名失败", { ok: false, error: "任务名称不能为空。" });
          input.focus();
          input.select();
          finished = false;
          return;
        }

        editingTaskId = null;
        await runRequest(
          {
            action: "rename_task",
            payload: {
              taskId: task.task_id,
              name: nextName
            }
          },
          "正在重命名任务"
        );
      };

      input.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      input.addEventListener("keydown", async (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          await finish(true);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          await finish(false);
        }
      });
      input.addEventListener("blur", async () => {
        await finish(true);
      });
    }
  }
}

function beginInlineRename(taskId) {
  editingTaskId = taskId;
  renderTaskList(tasksCache);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function runRequest(request, pendingMessage) {
  // 所有按钮行为最终都收敛到这个函数，便于统一处理状态和刷新列表。
  setExportMenuOpen(false);
  setState(pendingMessage, { request }, { loading: true });
  const shouldLockDetailPane = Boolean(request?.__lockDetailPane);
  const detailBusyMessage = request?.__detailBusyMessage || "正在确认片段...";
  if (shouldLockDetailPane) {
    setReviewBusyState(true, detailBusyMessage);
  }

  try {
    const safeRequest = { ...request };
    delete safeRequest.__lockDetailPane;
    delete safeRequest.__detailBusyMessage;

    const response = await window.engineApi.request(safeRequest);
    setState("请求完成", response);
    if (response.data?.task) {
      selectedTaskId = response.data.task.task_id;
      upsertTask(response.data.task);
    }
    if (response.action === "delete_task" && response.data?.taskId) {
      removeTask(response.data.taskId);
      if (selectedTaskId === response.data.taskId) {
        selectedTaskId = null;
      }
    }
    renderTaskList(tasksCache);
    await syncTaskDetailFromCache();
    return response;
  } catch (error) {
    setState("请求失败", {
      ok: false,
      error: error.message
    });
    throw error;
  } finally {
    if (shouldLockDetailPane) {
      setReviewBusyState(false);
    }
  }
}

async function refreshTasks() {
  // 刷新列表后，如果当前还有选中的任务，就继续保持详情视图同步。
  const response = await window.engineApi.request({
    action: "list_tasks",
    payload: {}
  });
  tasksCache = response.data.tasks || [];
  renderTaskList(tasksCache);
  await syncTaskDetailFromCache();
}

function upsertTask(task) {
  const index = tasksCache.findIndex((item) => item.task_id === task.task_id);
  if (index >= 0) {
    tasksCache[index] = task;
    return;
  }
  tasksCache.unshift(task);
}

function removeTask(taskId) {
  tasksCache = tasksCache.filter((task) => task.task_id !== taskId);
}

function cleanTranscriptLine(line) {
  return String(line || "")
    .replace(/^\s*\[\d{2}:\d{2}:\d{2}\]\s*/u, "")
    .replace(/^说话人\s+\S+\s*[：:]\s*/u, "")
    .trim();
}

function buildTranscriptLines(task) {
  const activeTranscript = getActiveTranscriptData(task);
  const segments = getRenderableActiveSegments(task);
  if (segments.length) {
    return segments.map((segment) => cleanTranscriptLine(segment.text)).filter(Boolean);
  }

  return String(activeTranscript.plainText || "")
    .split(/\r?\n/u)
    .map((line) => cleanTranscriptLine(line))
    .filter(Boolean);
}

function buildTranscriptText(task) {
  return buildTranscriptLines(task).join("\n");
}

function resetAudioElement() {
  audioEl.pause();
  audioEl.removeAttribute("src");
  audioEl.load();
}

function setPlayerUnavailable(message) {
  resetAudioElement();
  playerState.taskId = currentTask()?.task_id || null;
  playerState.sourcePath = "";
  playerState.isAvailable = false;
  playerState.isPlaying = false;
  playerState.currentTime = 0;
  playerState.duration = 0;
  playerState.activeSegmentIndex = -1;
  playerState.message = message;
  updatePlayerUI();
  updateTranscriptHighlight();
}

function updatePlayerUI() {
  audioStatusEl.textContent = playerState.message;
  playToggleButton.textContent = playerState.isPlaying ? "暂停" : "播放";
  playToggleButton.disabled = !playerState.isAvailable;
  seekBackwardButton.disabled = !playerState.isAvailable;
  seekForwardButton.disabled = !playerState.isAvailable;
  audioProgressEl.disabled = !playerState.isAvailable;
  audioProgressEl.max = String(playerState.duration || 0);
  audioProgressEl.value = String(
    Math.min(playerState.currentTime || 0, playerState.duration || 0)
  );
  audioCurrentTimeEl.textContent = formatTimestamp(playerState.currentTime);
  audioDurationEl.textContent = formatTimestamp(playerState.duration);
}

async function syncTaskAudio(task) {
  const sourcePath = task?.artifacts?.source_copy || "";

  if (!task) {
    audioLoadToken += 1;
    setPlayerUnavailable("尚未选择任务。");
    return;
  }

  if (
    playerState.taskId === task.task_id &&
    playerState.sourcePath === sourcePath &&
    (playerState.isAvailable || playerState.message === "当前任务没有可播放音频。")
  ) {
    syncActiveSegmentWithTime();
    updatePlayerUI();
    return;
  }

  const currentToken = ++audioLoadToken;
  resetAudioElement();
  playerState.taskId = task.task_id;
  playerState.sourcePath = sourcePath;
  playerState.isAvailable = false;
  playerState.isPlaying = false;
  playerState.currentTime = 0;
  playerState.duration = 0;
  playerState.activeSegmentIndex = -1;
  playerState.message = "正在加载任务音频…";
  updateTranscriptHighlight();
  updatePlayerUI();

  try {
    const resolved = await window.engineApi.resolveTaskAudioSource({
      taskId: task.task_id,
      sourcePath
    });

    if (currentToken !== audioLoadToken) {
      return;
    }

    if (!resolved?.available || !resolved?.url) {
      setPlayerUnavailable(resolved?.reason || "当前任务没有可播放音频。");
      return;
    }

    playerState.isAvailable = true;
    playerState.message = `已加载 ${resolved.fileName || "任务音频"}。`;
    audioEl.src = resolved.url;
    audioEl.load();
    updatePlayerUI();
  } catch (error) {
    if (currentToken !== audioLoadToken) {
      return;
    }
    setPlayerUnavailable(`音频加载失败：${error.message}`);
  }
}

function clampTime(seconds) {
  const duration = playerState.duration || 0;
  const nextTime = Math.max(Number(seconds) || 0, 0);
  if (!duration) {
    return nextTime;
  }
  return Math.min(nextTime, duration);
}

async function togglePlayback() {
  if (!playerState.isAvailable) {
    return;
  }

  if (audioEl.paused) {
    try {
      await audioEl.play();
    } catch (error) {
      setState("播放失败", { ok: false, error: error.message });
    }
    return;
  }

  audioEl.pause();
}

async function seekTo(seconds, options = {}) {
  if (!playerState.isAvailable) {
    return;
  }

  const nextTime = clampTime(seconds);
  audioEl.currentTime = nextTime;
  playerState.currentTime = nextTime;
  syncActiveSegmentWithTime();
  updatePlayerUI();

  if (options.play) {
    try {
      await audioEl.play();
    } catch (error) {
      setState("播放失败", { ok: false, error: error.message });
    }
  }
}

function findActiveSegmentIndex(segments, currentTime) {
  if (!segments.length) {
    return -1;
  }

  for (const [index, segment] of segments.entries()) {
    const start = Number(segment.start) || 0;
    const end = Number(segment.end);
    if (currentTime >= start && (Number.isNaN(end) || currentTime < end)) {
      return index;
    }
  }

  return -1;
}

function syncActiveSegmentWithTime() {
  const task = currentTask();
  const segments = getActiveTranscriptData(task).segments;
  playerState.activeSegmentIndex = findActiveSegmentIndex(segments, playerState.currentTime);
  updateTranscriptHighlight();
}

function getFinalTranscriptSegments(task) {
  return task?.results?.segments || [];
}

function getActiveTranscriptData(task) {
  const results = task?.results || {};
  if (transcriptViewState.textVersion === "raw") {
    return {
      segments: results.raw_segments || [],
      plainText: results.raw_plain_text || results.plain_text || results.full_text || ""
    };
  }
  return {
    segments: results.segments || [],
    plainText: results.plain_text || results.full_text || ""
  };
}

function getAlternateTranscriptSegments(task) {
  const results = task?.results || {};
  if (transcriptViewState.textVersion === "raw") {
    return results.segments || [];
  }
  return results.raw_segments || [];
}

function getReviewStatus(segment) {
  if (typeof getReviewStatusFromModule === "function") {
    return getReviewStatusFromModule(segment);
  }
  return String(segment?.review_status || "pending").trim() || "pending";
}

function isDeletedSegment(segment) {
  if (typeof isDeletedReviewSegmentFromModule === "function") {
    return isDeletedReviewSegmentFromModule(segment);
  }
  return getReviewStatus(segment) === "deleted";
}

function isPendingReview(segment) {
  return Boolean(segment?.needs_review) && getReviewStatus(segment) === "pending";
}

function buildSegmentReviewMeta(segment) {
  if (typeof buildSegmentReviewMetaFromModule === "function") {
    return buildSegmentReviewMetaFromModule(segment);
  }
  return {
    reviewStatus: getReviewStatus(segment),
    needsReview: Boolean(segment?.needs_review),
    reviewReasons: Array.isArray(segment?.review_reasons)
      ? segment.review_reasons.filter(Boolean)
      : []
  };
}

function isPendingReviewMeta(reviewMeta) {
  if (typeof isPendingReviewSegmentFromModule === "function") {
    return isPendingReviewSegmentFromModule(reviewMeta);
  }
  return Boolean(reviewMeta?.needsReview) && reviewMeta?.reviewStatus === "pending";
}

function shouldShowConfirmForMeta(reviewMeta) {
  if (typeof shouldShowConfirmActionFromModule === "function") {
    return shouldShowConfirmActionFromModule(reviewMeta);
  }
  return isPendingReviewMeta(reviewMeta);
}

function getSegmentReviewMeta(task, sourceIndex) {
  const finalSegment = getFinalTranscriptSegments(task)[sourceIndex] || {};
  return buildSegmentReviewMeta(finalSegment);
}

function getRenderableActiveSegments(task) {
  const segments = getActiveTranscriptData(task).segments || [];
  return segments.filter((segment) => !isDeletedSegment(segment));
}

function getVisibleTranscriptSegments(task) {
  const segments = getActiveTranscriptData(task).segments || [];
  const entries = segments
    .map((segment, sourceIndex) => ({
      segment,
      sourceIndex,
      reviewMeta: getSegmentReviewMeta(task, sourceIndex)
    }))
    .filter((entry) => !isDeletedSegment(entry.segment));
  if (transcriptViewState.reviewFilter === "review-only") {
    return entries.filter((entry) => isPendingReviewMeta(entry.reviewMeta));
  }
  if (transcriptViewState.reviewFilter === "pending-only") {
    return entries.filter((entry) => isPendingReviewMeta(entry.reviewMeta));
  }
  return entries;
}

function focusTranscriptSegment(sourceIndex) {
  const button = outputEl.querySelector(`[data-source-index="${sourceIndex}"]`);
  if (!button) {
    return;
  }
  button.scrollIntoView({
    block: "nearest",
    behavior: "smooth"
  });
}

async function jumpToSegment(sourceIndex) {
  const task = currentTask();
  const segments = getActiveTranscriptData(task).segments;
  const segment = segments[sourceIndex];

  if (!segment) {
    return;
  }

  if (!playerState.isAvailable) {
    setState("音频不可用", { ok: false, error: "当前任务没有可播放音频。" });
    return;
  }

  await seekTo(segment.start, { play: true });
}

function beginSegmentEdit(sourceIndex) {
  const task = currentTask();
  const segment = getFinalTranscriptSegments(task)[sourceIndex];
  if (!segment) {
    return;
  }
  segmentEditorState.taskId = task?.task_id || null;
  segmentEditorState.sourceIndex = sourceIndex;
  segmentEditorState.draftText = String(segment.text || "");
  rerenderTranscriptView();
}

async function submitSegmentReview(sourceIndex, reviewAction, reviewedText = "") {
  const task = currentTask();
  if (!task) {
    return;
  }

  if (reviewAction === "correct" && !String(reviewedText || "").trim()) {
    setState("保存失败", { ok: false, error: "修正文本不能为空。" }, { variant: "error" });
    return;
  }

  const pendingMessageMap = {
    confirm: "正在保存确认结果",
    correct: "正在保存修正结果",
    delete: "正在删除片段"
  };
  const busyMessageMap = {
    confirm: "正在确认片段...",
    correct: "正在保存修正片段...",
    delete: "正在删除片段..."
  };

  await runRequest(
    {
      action: "update_segment_review",
      payload: {
        taskId: task.task_id,
        segmentIndex: sourceIndex,
        reviewAction,
        reviewedText: reviewedText || undefined
      },
      __lockDetailPane: ["confirm", "correct", "delete"].includes(reviewAction),
      __detailBusyMessage: busyMessageMap[reviewAction] || "正在保存片段..."
    },
    pendingMessageMap[reviewAction] || "正在保存片段结果"
  );
  resetSegmentEditorState(task.task_id);
  rerenderTranscriptView();
}

function rerenderTranscriptView() {
  setExportMenuOpen(false);
  const task = currentTask();
  renderTask(task);
  syncActiveSegmentWithTime();
  updatePlayerUI();
}

playToggleButton.addEventListener("click", async () => {
  await togglePlayback();
});

seekBackwardButton.addEventListener("click", async () => {
  await seekTo((audioEl.currentTime || 0) - 10);
});

seekForwardButton.addEventListener("click", async () => {
  await seekTo((audioEl.currentTime || 0) + 10);
});

audioProgressEl.addEventListener("input", async (event) => {
  await seekTo(event.target.value);
});

audioEl.addEventListener("loadedmetadata", () => {
  playerState.duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
  playerState.currentTime = audioEl.currentTime || 0;
  syncActiveSegmentWithTime();
  updatePlayerUI();
});

audioEl.addEventListener("timeupdate", () => {
  playerState.currentTime = audioEl.currentTime || 0;
  syncActiveSegmentWithTime();
  updatePlayerUI();
});

audioEl.addEventListener("play", () => {
  playerState.isPlaying = true;
  updatePlayerUI();
});

audioEl.addEventListener("pause", () => {
  playerState.isPlaying = false;
  updatePlayerUI();
});

audioEl.addEventListener("ended", () => {
  playerState.isPlaying = false;
  updatePlayerUI();
});

audioEl.addEventListener("error", () => {
  setPlayerUnavailable("音频加载失败，无法播放当前任务文件。");
});

selectButton.addEventListener("click", async () => {
  const result = await window.engineApi.selectAudioFile();
  if (result.canceled || !result.filePaths?.length) {
    return;
  }

  // 先导入任务，真正的转写和分人由用户显式点击“处理当前任务”触发。
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

processButton.addEventListener("click", async () => {
  if (!selectedTaskId) {
    setState("未选择任务", { ok: false, error: "请先选择或创建任务。" });
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
});

refreshButton.addEventListener("click", async () => {
  await refreshTasks();
});

copyOutputButton.addEventListener("click", async () => {
  setExportMenuOpen(false);
  const task = currentTask();
  const text = buildTranscriptText(task);
  if (!text) {
    setState("复制失败", { ok: false, error: "当前没有可复制的转写内容。" });
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setState("已复制转写文本", { taskId: task.task_id });
  } catch (error) {
    setState("复制失败", { ok: false, error: error.message });
  }
});

saveOutputButton.addEventListener("click", async () => {
  setExportMenuOpen(false);
  const task = currentTask();
  const text = buildTranscriptText(task);
  if (!text) {
    setState("下载失败", { ok: false, error: "当前没有可导出的转写内容。" });
    return;
  }

  const defaultFileName = `${task.name || task.task_id}.txt`;
  const result = await window.engineApi.saveTextFile({
    title: "保存转写文本",
    defaultFileName,
    content: text,
    filters: [
      {
        name: "Text",
        extensions: ["txt"]
      }
    ]
  });

  if (!result?.canceled) {
    setState("已保存转写文本", { filePath: result.filePath });
  }
});

saveMdButton.addEventListener("click", async () => {
  setExportMenuOpen(false);
  const task = currentTask();
  const lines = buildTranscriptLines(task);
  if (!lines.length) {
    setState("下载失败", { ok: false, error: "当前没有可导出的 Markdown 内容。" });
    return;
  }

  const markdown = [
    `# 语音转写结果 - ${task.name || task.task_id}`,
    "",
    ...lines.map((line) => `- ${line}`)
  ].join("\n");

  const result = await window.engineApi.saveTextFile({
    title: "保存 Markdown",
    defaultFileName: `${task.name || task.task_id}.md`,
    content: markdown,
    filters: [
      {
        name: "Markdown",
        extensions: ["md"]
      }
    ]
  });

  if (!result?.canceled) {
    setState("已保存 Markdown", { filePath: result.filePath });
  }
});

exportMenuButton.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (exportMenuButton.disabled) {
    return;
  }
  setExportMenuOpen(!exportMenuState.isOpen);
});

exportDropdownEl.addEventListener("click", (event) => {
  event.stopPropagation();
});

viewCleanButton.addEventListener("click", () => {
  setTranscriptViewState({
    textVersion: "clean"
  });
  resetSegmentEditorState(currentTask()?.task_id || null);
  rerenderTranscriptView();
});

viewRawButton.addEventListener("click", () => {
  setTranscriptViewState({
    textVersion: "raw"
  });
  resetSegmentEditorState(currentTask()?.task_id || null);
  rerenderTranscriptView();
});

filterAllButton.addEventListener("click", () => {
  setTranscriptViewState({
    reviewFilter: "all"
  });
  resetSegmentEditorState(currentTask()?.task_id || null);
  rerenderTranscriptView();
});

filterReviewButton.addEventListener("click", () => {
  setTranscriptViewState({
    reviewFilter: "review-only"
  });
  resetSegmentEditorState(currentTask()?.task_id || null);
  rerenderTranscriptView();
});

filterUnprocessedButton.addEventListener("click", () => {
  setTranscriptViewState({
    reviewFilter: "pending-only"
  });
  resetSegmentEditorState(currentTask()?.task_id || null);
  rerenderTranscriptView();
});

document.addEventListener("click", () => {
  if (exportMenuState.isOpen) {
    setExportMenuOpen(false);
  }
});

function formatTimestamp(seconds) {
  const whole = Math.max(Math.floor(Number(seconds) || 0), 0);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// 页面启动时先拉一次任务列表，支持恢复之前已经处理过的本地任务。
refreshTasks().catch((error) => {
  setState("初始化失败", { ok: false, error: error.message });
});
