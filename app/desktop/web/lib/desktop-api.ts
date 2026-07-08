import type {
  DesktopApi,
  DesktopBridge,
  DesktopSettings,
  DesktopSettingsInput,
  DesktopTask,
  EngineHealth,
  EngineResponse,
  LegacyEngineApi,
  OpenDialogResult,
  ResolvedTaskAudio,
  ReviewAction,
  SaveDialogResult,
  SaveTextPayload
} from "./desktop-types";

function unwrapEngineResponse<T>(response: EngineResponse<T>, fallbackMessage: string): T {
  if (!response?.ok) {
    throw new Error(response?.error?.message || fallbackMessage);
  }

  return response.data as T;
}

function createLegacyBridge(engineApi: LegacyEngineApi): DesktopApi {
  return {
    tasks: {
      async list() {
        const response = await engineApi.request<{ tasks: DesktopTask[] }>({
          action: "list_tasks",
          payload: {}
        });
        return unwrapEngineResponse(response, "无法加载任务列表").tasks || [];
      },
      async get(taskId) {
        const response = await engineApi.request<{ task: DesktopTask | null }>({
          action: "get_task",
          payload: { taskId }
        });
        return unwrapEngineResponse(response, "无法加载任务详情").task || null;
      },
      async importAudio() {
        const selection = await engineApi.selectAudioFile();
        if (selection.canceled || !selection.filePaths?.length) {
          return null;
        }

        const response = await engineApi.request<{ task: DesktopTask | null }>({
          action: "import_audio",
          payload: { sourcePath: selection.filePaths[0] }
        });
        return unwrapEngineResponse(response, "无法导入音频").task || null;
      },
      async process(taskId) {
        const response = await engineApi.request<{ task: DesktopTask | null }>({
          action: "process_task",
          payload: { taskId }
        });
        return unwrapEngineResponse(response, "无法处理任务").task || null;
      },
      async rename(taskId, name) {
        const response = await engineApi.request<{ task: DesktopTask | null }>({
          action: "rename_task",
          payload: { taskId, name }
        });
        return unwrapEngineResponse(response, "无法重命名任务").task || null;
      },
      async delete(taskId) {
        const response = await engineApi.request<{ taskId: string }>({
          action: "delete_task",
          payload: { taskId }
        });
        return unwrapEngineResponse(response, "无法删除任务");
      }
    },
    review: {
      async update(taskId, segmentIndex, action, reviewedText) {
        const response = await engineApi.request<{ task: DesktopTask | null }>({
          action: "update_segment_review",
          payload: { taskId, segmentIndex, reviewAction: action, reviewedText }
        });
        return unwrapEngineResponse(response, "无法保存审校结果").task || null;
      }
    },
    media: {
      resolveTaskAudio(taskId, sourcePath) {
        return engineApi.resolveTaskAudioSource({ taskId, sourcePath });
      }
    },
    dialog: {
      selectAudio() {
        return engineApi.selectAudioFile();
      },
      saveText(payload) {
        return engineApi.saveTextFile(payload);
      }
    },
    settings: {
      async get() {
        throw new Error("settings bridge is not available");
      },
      async set(_payload) {
        throw new Error("settings bridge is not available");
      }
    },
    engine: {
      async health() {
        const response = await engineApi.request<EngineHealth>({
          action: "health",
          payload: {}
        });
        return unwrapEngineResponse(response, "无法检查引擎状态");
      }
    }
  };
}

export function createDesktopApi(bridge: DesktopBridge): DesktopApi {
  return {
    tasks: {
      async list() {
        const response = await bridge.invoke<EngineResponse<{ tasks: DesktopTask[] }>>(
          "engine:request",
          { action: "list_tasks", payload: {} }
        );
        return unwrapEngineResponse(response, "无法加载任务列表").tasks || [];
      },
      async get(taskId) {
        const response = await bridge.invoke<EngineResponse<{ task: DesktopTask | null }>>(
          "engine:request",
          { action: "get_task", payload: { taskId } }
        );
        return unwrapEngineResponse(response, "无法加载任务详情").task || null;
      },
      async importAudio() {
        const selected = await bridge.invoke<OpenDialogResult>("dialog:select-audio");
        if (selected.canceled || !selected.filePaths?.length) {
          return null;
        }

        const response = await bridge.invoke<EngineResponse<{ task: DesktopTask | null }>>(
          "engine:request",
          {
            action: "import_audio",
            payload: { sourcePath: selected.filePaths[0] }
          }
        );
        return unwrapEngineResponse(response, "无法导入音频").task || null;
      },
      async process(taskId) {
        const response = await bridge.invoke<EngineResponse<{ task: DesktopTask | null }>>(
          "engine:request",
          { action: "process_task", payload: { taskId } }
        );
        return unwrapEngineResponse(response, "无法处理任务").task || null;
      },
      async rename(taskId, name) {
        const response = await bridge.invoke<EngineResponse<{ task: DesktopTask | null }>>(
          "engine:request",
          { action: "rename_task", payload: { taskId, name } }
        );
        return unwrapEngineResponse(response, "无法重命名任务").task || null;
      },
      async delete(taskId) {
        const response = await bridge.invoke<EngineResponse<{ taskId: string }>>(
          "engine:request",
          { action: "delete_task", payload: { taskId } }
        );
        return unwrapEngineResponse(response, "无法删除任务");
      }
    },
    review: {
      async update(taskId, segmentIndex, action: ReviewAction, reviewedText) {
        const response = await bridge.invoke<EngineResponse<{ task: DesktopTask | null }>>(
          "engine:request",
          {
            action: "update_segment_review",
            payload: { taskId, segmentIndex, reviewAction: action, reviewedText }
          }
        );
        return unwrapEngineResponse(response, "无法保存审校结果").task || null;
      }
    },
    media: {
      resolveTaskAudio(taskId, sourcePath) {
        return bridge.invoke<ResolvedTaskAudio>("media:resolve-task-audio", {
          taskId,
          sourcePath
        });
      }
    },
    dialog: {
      selectAudio() {
        return bridge.invoke<OpenDialogResult>("dialog:select-audio");
      },
      saveText(payload: SaveTextPayload) {
        return bridge.invoke<SaveDialogResult>("dialog:save-text", payload);
      }
    },
    settings: {
      get() {
        return bridge.invoke<DesktopSettings>("settings:get");
      },
      set(payload: DesktopSettingsInput) {
        return bridge.invoke<DesktopSettings>("settings:set", payload);
      }
    },
    engine: {
      async health() {
        const response = await bridge.invoke<EngineResponse<EngineHealth>>("engine:request", {
          action: "health",
          payload: {}
        });
        return unwrapEngineResponse(response, "无法检查引擎状态");
      }
    }
  };
}

export function getDesktopApi(): DesktopApi {
  if (typeof window === "undefined") {
    throw new Error("desktopApi is only available in the browser");
  }

  if (window.desktopApi) {
    return window.desktopApi;
  }

  if (window.engineApi) {
    return createLegacyBridge(window.engineApi);
  }

  throw new Error("desktopApi bridge not found");
}
