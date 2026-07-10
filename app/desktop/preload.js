const { contextBridge, ipcRenderer } = require("electron");

function invokeEngineAction(action, payload = {}) {
  return ipcRenderer.invoke("engine:request", { action, payload });
}

function unwrapEngineData(response) {
  return response?.data;
}

contextBridge.exposeInMainWorld("engineApi", {
  request(request) {
    return ipcRenderer.invoke("engine:request", request);
  },
  selectAudioFile() {
    return ipcRenderer.invoke("dialog:select-audio");
  },
  saveTextFile(payload) {
    return ipcRenderer.invoke("dialog:save-text", payload);
  },
  resolveTaskAudioSource(payload) {
    return ipcRenderer.invoke("media:resolve-task-audio", payload);
  }
});

contextBridge.exposeInMainWorld("desktopApi", {
  tasks: {
    async list() {
      const response = await invokeEngineAction("list_tasks");
      return unwrapEngineData(response)?.tasks || [];
    },
    async get(taskId) {
      const response = await invokeEngineAction("get_task", { taskId });
      return unwrapEngineData(response)?.task || null;
    },
    async importAudio() {
      return ipcRenderer.invoke("tasks:import-audio");
    },
    async process(taskId) {
      const response = await invokeEngineAction("process_task", { taskId });
      return unwrapEngineData(response)?.task || null;
    },
    async rename(taskId, name) {
      const response = await invokeEngineAction("rename_task", { taskId, name });
      return unwrapEngineData(response)?.task || null;
    },
    async delete(taskId) {
      const response = await invokeEngineAction("delete_task", { taskId });
      return unwrapEngineData(response) || { taskId };
    }
  },
  review: {
    async update(taskId, segmentIndex, action, reviewedText) {
      const response = await invokeEngineAction("update_segment_review", {
        taskId,
        segmentIndex,
        reviewAction: action,
        reviewedText
      });
      return unwrapEngineData(response)?.task || null;
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
  settings: {
    get() {
      return ipcRenderer.invoke("settings:get");
    },
    set(payload) {
      return ipcRenderer.invoke("settings:set", payload);
    }
  },
  engine: {
    async health() {
      const response = await invokeEngineAction("health");
      return unwrapEngineData(response) || {};
    }
  }
});
