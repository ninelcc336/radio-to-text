const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const detailEl = document.getElementById("task-detail");
const taskListEl = document.getElementById("task-list");
const selectButton = document.getElementById("select-button");
const processButton = document.getElementById("process-button");
const refreshButton = document.getElementById("refresh-button");

let selectedTaskId = null;

function setState(message, payload) {
  statusEl.textContent = message;
  outputEl.textContent = JSON.stringify(payload, null, 2);
}

function renderTaskList(tasks) {
  taskListEl.innerHTML = "";
  if (!tasks.length) {
    taskListEl.textContent = "还没有任务。";
    return;
  }

  for (const task of tasks) {
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = `${task.task_id} | ${task.status}`;
    button.addEventListener("click", async () => {
      selectedTaskId = task.task_id;
      const response = await window.engineApi.request({
        action: "get_task",
        payload: { taskId: task.task_id }
      });
      detailEl.textContent = JSON.stringify(response.data.task, null, 2);
      setState("已加载任务详情", response);
    });
    taskListEl.appendChild(button);
  }
}

async function runRequest(request, pendingMessage) {
  setState(pendingMessage, { request });

  try {
    const response = await window.engineApi.request(request);
    setState("请求完成", response);
    if (response.data?.task) {
      detailEl.textContent = JSON.stringify(response.data.task, null, 2);
      selectedTaskId = response.data.task.task_id;
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
  const response = await window.engineApi.request({
    action: "list_tasks",
    payload: {}
  });
  renderTaskList(response.data.tasks || []);
}

selectButton.addEventListener("click", async () => {
  const result = await window.engineApi.selectAudioFile();
  if (result.canceled || !result.filePaths?.length) {
    return;
  }

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

refreshTasks().catch((error) => {
  setState("初始化失败", { ok: false, error: error.message });
});
