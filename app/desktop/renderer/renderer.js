const statusEl = document.getElementById("status");
const detailEl = document.getElementById("task-detail");
const outputEl = document.getElementById("task-output");
const outputToolbarEl = document.getElementById("output-toolbar");
const taskListEl = document.getElementById("task-list");
const selectButton = document.getElementById("select-button");
const processButton = document.getElementById("process-button");
const refreshButton = document.getElementById("refresh-button");
const copyOutputButton = document.getElementById("copy-output-button");
const saveOutputButton = document.getElementById("save-output-button");
const saveMdButton = document.getElementById("save-md-button");
const audioStatusEl = document.getElementById("audio-status");
const playToggleButton = document.getElementById("play-toggle-button");
const seekBackwardButton = document.getElementById("seek-backward-button");
const seekForwardButton = document.getElementById("seek-forward-button");
const audioCurrentTimeEl = document.getElementById("audio-current-time");
const audioDurationEl = document.getElementById("audio-duration");
const audioProgressEl = document.getElementById("audio-progress");
const audioEl = document.getElementById("task-audio");

let selectedTaskId = null;
let editingTaskId = null;
let tasksCache = [];
let audioLoadToken = 0;

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

function setState(message, payload, options = {}) {
  statusEl.textContent = message;
  statusEl.dataset.lastPayload = JSON.stringify(payload ?? {});
  statusEl.classList.toggle("is-loading", Boolean(options.loading));
}

function currentTask() {
  if (!selectedTaskId) {
    return null;
  }
  return tasksCache.find((task) => task.task_id === selectedTaskId) || null;
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
  if (!task) {
    detailEl.textContent = "尚未选择任务。";
    renderTranscriptEmpty("尚无转写结果。");
    outputToolbarEl.classList.add("is-hidden");
    saveMdButton.disabled = true;
    return;
  }

  const metadata = task.metadata || {};
  const detailLines = [
    `任务名称：${task.name || "未命名任务"}`,
    `任务 ID：${task.task_id}`,
    `状态：${labelStatus(task.status)}`,
    `阶段：${labelStage(task.stage)}`,
    `源文件：${metadata.original_file_name || task.source_path || "-"}`,
    `时长：${
      typeof metadata.duration_seconds === "number"
        ? `${metadata.duration_seconds.toFixed(1)} 秒`
        : "-"
    }`,
    `采样率：${metadata.sample_rate || "-"}`,
    `说话人数：${metadata.speaker_count || "-"}`
  ];

  detailEl.innerHTML = detailLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("");

  const segments = task.results?.segments || [];
  const fullText = task.results?.plain_text || task.results?.full_text || "";
  const hasAnyOutput = Boolean(segments.length || fullText.trim());
  outputToolbarEl.classList.toggle("is-hidden", !hasAnyOutput);
  saveMdButton.disabled = !segments.length;

  if (segments.length) {
    renderTranscriptSegments(segments);
    return;
  }

  if (fullText.trim()) {
    outputEl.className = "transcript-plain";
    outputEl.textContent = fullText;
    return;
  }

  renderTranscriptEmpty("尚无转写结果。");
}

function renderTranscriptSegments(segments) {
  outputEl.className = "transcript-list";
  outputEl.innerHTML = "";

  for (const [index, segment] of segments.entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment-button";
    if (index === playerState.activeSegmentIndex) {
      button.classList.add("is-active");
    }
    button.dataset.segmentIndex = String(index);
    button.innerHTML = `
      <span class="segment-time">${escapeHtml(formatTimestamp(segment.start))}</span>
      <span class="segment-text">${escapeHtml(segment.text || "")}</span>
    `;
    button.addEventListener("click", async () => {
      await jumpToSegment(index);
    });
    outputEl.appendChild(button);
  }
}

function renderTranscriptEmpty(message) {
  outputEl.className = "empty-state";
  outputEl.textContent = message;
}

function updateTranscriptHighlight() {
  const segmentButtons = outputEl.querySelectorAll(".segment-button");
  for (const button of segmentButtons) {
    const isActive = Number(button.dataset.segmentIndex) === playerState.activeSegmentIndex;
    button.classList.toggle("is-active", isActive);
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
  setState(pendingMessage, { request }, { loading: true });

  try {
    const response = await window.engineApi.request(request);
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
  const segments = task?.results?.segments || [];
  if (segments.length) {
    return segments.map((segment) => cleanTranscriptLine(segment.text)).filter(Boolean);
  }

  const rawText = task?.results?.plain_text || task?.results?.full_text || "";
  return rawText
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
  const segments = task?.results?.segments || [];
  playerState.activeSegmentIndex = findActiveSegmentIndex(segments, playerState.currentTime);
  updateTranscriptHighlight();
}

async function jumpToSegment(index) {
  const task = currentTask();
  const segments = task?.results?.segments || [];
  const segment = segments[index];

  if (!segment) {
    return;
  }

  if (!playerState.isAvailable) {
    setState("音频不可用", { ok: false, error: "当前任务没有可播放音频。" });
    return;
  }

  await seekTo(segment.start, { play: true });
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
