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

let selectedTaskId = null;
let editingTaskId = null;
let tasksCache = [];

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

function syncTaskDetailFromCache() {
  if (!selectedTaskId) {
    renderTask(null);
    return;
  }

  const activeTask = tasksCache.find((task) => task.task_id === selectedTaskId);
  if (activeTask) {
    renderTask(activeTask);
    return;
  }

  renderTask(null);
}

// 页面主区域只展示用户真正关心的最终文本和少量任务摘要。
function renderTask(task) {
  if (!task) {
    detailEl.textContent = "尚未选择任务。";
    outputEl.textContent = "尚无转写结果。";
    outputToolbarEl.classList.add("is-hidden");
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
    `说话人数：${metadata.speaker_count || "-"}`,
    `采样率：${metadata.sample_rate || "-"}`
  ];

  detailEl.innerHTML = detailLines
    .map((line) => `<div>${line}</div>`)
    .join("");

  const fullText = task.results?.full_text || "";
  outputEl.textContent = fullText || "尚无转写结果。";
  outputToolbarEl.classList.toggle("is-hidden", !fullText.trim());
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
      renderTask(task);
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
        renderTask(null);
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
    syncTaskDetailFromCache();
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
  syncTaskDetailFromCache();
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

selectButton.addEventListener("click", async () => {
  const result = await window.engineApi.selectAudioFile();
  if (result.canceled || !result.filePaths?.length) {
    return;
  }

  // 先导入任务，真正的转写和分人由用户显式点击“处理当前任务”触发。
  runRequest(
    {
      action: "import_audio",
      payload: {
        sourcePath: result.filePaths[0]
      }
    },
    "正在导入音频"
  );
});

processButton.addEventListener("click", () => {
  if (!selectedTaskId) {
    setState("未选择任务", { ok: false, error: "请先选择或创建任务。" });
    return;
  }

  runRequest(
    {
      action: "process_task",
      payload: {
        taskId: selectedTaskId
      }
    },
    "正在处理任务"
  );
});

refreshButton.addEventListener("click", refreshTasks);

copyOutputButton.addEventListener("click", async () => {
  const task = currentTask();
  const text = task?.results?.full_text?.trim();
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
  const text = task?.results?.full_text?.trim();
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
  const markdownPath = task?.exports?.md;
  if (!markdownPath) {
    setState("下载失败", { ok: false, error: "当前没有可导出的 Markdown 内容。" });
    return;
  }

  const mdTask = await window.engineApi.request({
    action: "get_task",
    payload: { taskId: task.task_id }
  });
  const speakerSegments = mdTask.data?.task?.results?.speaker_segments || [];
  if (!speakerSegments.length) {
    setState("下载失败", { ok: false, error: "当前没有可导出的 Markdown 内容。" });
    return;
  }

  const markdown = [
    `# 会议转写结果 - ${task.name || task.task_id}`,
    "",
    ...speakerSegments.map(
      (segment) =>
        `- \`${formatTimestamp(segment.start)}\` **说话人 ${segment.speaker}**：${segment.text}`
    )
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
