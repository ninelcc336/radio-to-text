const statusEl = document.getElementById("status");
const detailEl = document.getElementById("task-detail");
const outputEl = document.getElementById("task-output");
const taskListEl = document.getElementById("task-list");
const selectButton = document.getElementById("select-button");
const processButton = document.getElementById("process-button");
const refreshButton = document.getElementById("refresh-button");

let selectedTaskId = null;
let editingTaskId = null;

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

function setState(message, payload) {
  statusEl.textContent = message;
  statusEl.dataset.lastPayload = JSON.stringify(payload ?? {});
}

// 页面主区域只展示用户真正关心的最终文本和少量任务摘要。
function renderTask(task) {
  if (!task) {
    detailEl.textContent = "尚未选择任务。";
    outputEl.textContent = "尚无转写结果。";
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

  outputEl.textContent = task.results?.full_text || "尚无转写结果。";
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
      await refreshTasks();
      const response = await window.engineApi.request({
        action: "get_task",
        payload: { taskId: task.task_id }
      });
      renderTask(response.data.task);
      setState("已加载任务详情", response);
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
  refreshTasks().catch((error) => {
    setState("进入重命名失败", { ok: false, error: error.message });
  });
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
  setState(pendingMessage, { request });

  try {
    const response = await window.engineApi.request(request);
    setState("请求完成", response);
    if (response.data?.task) {
      selectedTaskId = response.data.task.task_id;
      renderTask(response.data.task);
    }
    await refreshTasks();
  } catch (error) {
    setState("请求失败", {
      ok: false,
      error: error.message
    });
  }
}

async function refreshTasks() {
  // 刷新列表后，如果当前还有选中的任务，就继续保持详情视图同步。
  const response = await window.engineApi.request({
    action: "list_tasks",
    payload: {}
  });
  renderTaskList(response.data.tasks || []);

  if (selectedTaskId) {
    const activeTask = response.data.tasks.find((task) => task.task_id === selectedTaskId);
    if (activeTask) {
      renderTask(activeTask);
    }
  }
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

// 页面启动时先拉一次任务列表，支持恢复之前已经处理过的本地任务。
refreshTasks().catch((error) => {
  setState("初始化失败", { ok: false, error: error.message });
});
