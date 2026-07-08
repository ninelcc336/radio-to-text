"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { getDesktopApi } from "../lib/desktop-api";
import type {
  DesktopApi,
  DesktopTask,
  DesktopTaskSegment,
  ReviewAction
} from "../lib/desktop-types";

export type TaskTextVersion = "clean" | "raw";
export type ReviewFilter = "all" | "needs-review";

export type TaskSegmentView = {
  sourceIndex: number;
  segment: DesktopTaskSegment;
};

type TaskDetailStoreState = {
  task: DesktopTask | null;
  apiReady: boolean;
  isLoading: boolean;
  isBusy: boolean;
  isSavingReview: boolean;
  error: string | null;
  reviewFilter: ReviewFilter;
  bindApi(api: DesktopApi): void;
  loadTask(taskId: string): Promise<DesktopTask | null>;
  processTask(taskId: string): Promise<DesktopTask | null>;
  updateReview(
    taskId: string,
    segmentIndex: number,
    action: ReviewAction,
    reviewedText?: string
  ): Promise<DesktopTask | null>;
  setReviewFilter(reviewFilter: ReviewFilter): void;
};

type TaskDetailStore = ReturnType<typeof createTaskDetailStore>;

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

function formatError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "任务详情操作失败";
}

function getSegments(task: DesktopTask | null) {
  if (!Array.isArray(task?.results?.segments)) {
    return [];
  }

  return task.results.segments;
}

function isResolvedSegment(segment: DesktopTaskSegment) {
  const status = String(segment.review_status || "").toLowerCase();
  return status === "confirmed" || status === "corrected";
}

function isDeletedSegment(segment: DesktopTaskSegment) {
  return String(segment.review_status || "").toLowerCase() === "deleted";
}

function needsFocusedReview(segment: DesktopTaskSegment) {
  return Boolean(segment.needs_review) && !isResolvedSegment(segment) && !isDeletedSegment(segment);
}

export function getTaskText(task: DesktopTask | null, textVersion: TaskTextVersion) {
  if (!task?.results) {
    return "";
  }

  if (textVersion === "raw") {
    return String(task.results.raw_plain_text || "");
  }

  return String(task.results.plain_text || "");
}

export function getVisibleSegments(task: DesktopTask | null, reviewFilter: ReviewFilter) {
  return getSegments(task)
    .map((segment, sourceIndex) => ({
      sourceIndex,
      segment
    }))
    .filter(({ segment }) => {
      if (isDeletedSegment(segment)) {
        return false;
      }

      if (reviewFilter === "needs-review") {
        return needsFocusedReview(segment);
      }

      return true;
    });
}

export function getReviewStats(task: DesktopTask | null) {
  const segments = getSegments(task).filter((segment) => !isDeletedSegment(segment));
  const needsReview = segments.filter((segment) => needsFocusedReview(segment)).length;

  return {
    total: segments.length,
    needsReview
  };
}

export function createTaskDetailStore(initialApi?: DesktopApi) {
  let desktopApi = initialApi ?? createUnavailableDesktopApi();

  return createStore<TaskDetailStoreState>()((set) => ({
    task: null,
    apiReady: Boolean(initialApi),
    isLoading: false,
    isBusy: false,
    isSavingReview: false,
    error: null,
    reviewFilter: "all",
    bindApi(api) {
      desktopApi = api;
      set({ apiReady: true, error: null });
    },
    async loadTask(taskId) {
      set({ isLoading: true, error: null });

      try {
        const task = await desktopApi.tasks.get(taskId);
        set({
          task,
          reviewFilter: "all"
        });
        return task;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },
    async processTask(taskId) {
      set({ isBusy: true, error: null });

      try {
        const task = await desktopApi.tasks.process(taskId);
        set({ task });
        return task;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isBusy: false });
      }
    },
    async updateReview(taskId, segmentIndex, action, reviewedText) {
      set({ isSavingReview: true, error: null });

      try {
        const task = await desktopApi.review.update(taskId, segmentIndex, action, reviewedText);
        set({ task });
        return task;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isSavingReview: false });
      }
    },
    setReviewFilter(reviewFilter) {
      set({ reviewFilter });
    }
  }));
}

const taskDetailStore = createTaskDetailStore();

export function bindTaskDetailStoreApi(api?: DesktopApi) {
  taskDetailStore.getState().bindApi(api ?? getDesktopApi());
  return taskDetailStore;
}

export function useTaskDetailStore<T>(selector: (state: TaskDetailStoreState) => T) {
  return useStore(taskDetailStore, selector);
}

export function getTaskDetailStore() {
  return taskDetailStore;
}

export type { TaskDetailStore, TaskDetailStoreState };
