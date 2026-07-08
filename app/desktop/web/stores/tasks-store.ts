"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { getDesktopApi } from "../lib/desktop-api";
import type { DesktopApi, DesktopTask } from "../lib/desktop-types";

type TasksStoreState = {
  tasks: DesktopTask[];
  selectedTaskId: string | null;
  apiReady: boolean;
  isLoading: boolean;
  isImporting: boolean;
  error: string | null;
  bindApi(api: DesktopApi): void;
  refreshTasks(): Promise<void>;
  importAudioTask(): Promise<DesktopTask | null>;
  renameTask(taskId: string, name: string): Promise<DesktopTask | null>;
  deleteTask(taskId: string): Promise<{ taskId: string } | null>;
  selectTask(taskId: string | null): void;
};

type TasksStore = ReturnType<typeof createTasksStore>;

function createUnavailableDesktopApi(): DesktopApi {
  const unavailable = async () => {
    throw new Error("desktopApi bridge not found");
  };

  return {
    tasks: {
      list: unavailable,
      get: unavailable,
      importAudio: unavailable,
      process: unavailable,
      rename: unavailable,
      delete: unavailable
    },
    review: {
      update: unavailable
    },
    media: {
      resolveTaskAudio: unavailable
    },
    dialog: {
      selectAudio: unavailable,
      saveText: unavailable
    },
    settings: {
      get: unavailable,
      set: unavailable
    },
    engine: {
      health: unavailable
    }
  } as DesktopApi;
}

function getTaskName(task: DesktopTask) {
  return task.name || task.task_id;
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "任务列表操作失败";
}

function mergeTask(tasks: DesktopTask[], nextTask: DesktopTask) {
  const rest = tasks.filter((task) => task.task_id !== nextTask.task_id);
  return [nextTask, ...rest];
}

function selectFallbackTaskId(tasks: DesktopTask[], selectedTaskId: string | null) {
  if (!tasks.length) {
    return null;
  }

  if (selectedTaskId && tasks.some((task) => task.task_id === selectedTaskId)) {
    return selectedTaskId;
  }

  return tasks[0]?.task_id ?? null;
}

export function createTasksStore(initialApi?: DesktopApi) {
  let desktopApi = initialApi ?? createUnavailableDesktopApi();

  return createStore<TasksStoreState>()((set, get) => ({
    tasks: [],
    selectedTaskId: null,
    apiReady: Boolean(initialApi),
    isLoading: false,
    isImporting: false,
    error: null,
    bindApi(api) {
      desktopApi = api;
      set({ apiReady: true, error: null });
    },
    async refreshTasks() {
      set({ isLoading: true, error: null });

      try {
        const tasks = await desktopApi.tasks.list();
        set((state) => ({
          tasks: [...tasks],
          selectedTaskId: selectFallbackTaskId(tasks, state.selectedTaskId)
        }));
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },
    async importAudioTask() {
      set({ isImporting: true, error: null });

      try {
        const task = await desktopApi.tasks.importAudio();
        if (!task) {
          return null;
        }

        set((state) => ({
          tasks: mergeTask(state.tasks, task),
          selectedTaskId: task.task_id
        }));
        return task;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isImporting: false });
      }
    },
    async renameTask(taskId, name) {
      set({ error: null });

      try {
        const task = await desktopApi.tasks.rename(taskId, name);
        if (!task) {
          return null;
        }

        set((state) => ({
          tasks: state.tasks.map((item) =>
            item.task_id === taskId
              ? {
                  ...item,
                  ...task,
                  name: task.name || getTaskName(task)
                }
              : item
          )
        }));
        return task;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      }
    },
    async deleteTask(taskId) {
      set({ error: null });

      try {
        const result = await desktopApi.tasks.delete(taskId);
        set((state) => {
          const tasks = state.tasks.filter((task) => task.task_id !== taskId);
          return {
            tasks,
            selectedTaskId: selectFallbackTaskId(tasks, state.selectedTaskId === taskId ? null : state.selectedTaskId)
          };
        });
        return result;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      }
    },
    selectTask(taskId) {
      set({ selectedTaskId: taskId });
    }
  }));
}

const tasksStore = createTasksStore();

export function bindTasksStoreApi(api?: DesktopApi) {
  tasksStore.getState().bindApi(api ?? getDesktopApi());
  return tasksStore;
}

export function useTasksStore<T>(selector: (state: TasksStoreState) => T) {
  return useStore(tasksStore, selector);
}

export function getTasksStore() {
  return tasksStore;
}

export type { TasksStore, TasksStoreState };
