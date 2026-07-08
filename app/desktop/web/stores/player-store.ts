"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { getDesktopApi } from "../lib/desktop-api";
import type {
  DesktopApi,
  DesktopTaskSegment,
  ResolvedTaskAudio
} from "../lib/desktop-types";

export type TimelineSegment = Pick<DesktopTaskSegment, "start" | "end">;

type PlayerStoreState = {
  audio: ResolvedTaskAudio | null;
  apiReady: boolean;
  isLoading: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  activeSegmentIndex: number;
  error: string | null;
  bindApi(api: DesktopApi): void;
  loadAudio(taskId: string, sourcePath?: string): Promise<ResolvedTaskAudio>;
  syncPlayback(currentTime: number, segments: TimelineSegment[]): void;
  setDuration(duration: number): void;
  setPlaying(isPlaying: boolean): void;
  reset(): void;
};

type PlayerStore = ReturnType<typeof createPlayerStore>;

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

function normalizeTime(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "播放器加载失败";
}

export function findActiveSegmentIndex(
  segments: TimelineSegment[],
  currentTime: number
) {
  const safeTime = normalizeTime(currentTime);

  return segments.findIndex((segment) => {
    const start = normalizeTime(Number(segment.start));
    const end = Number.isFinite(Number(segment.end))
      ? normalizeTime(Number(segment.end))
      : Number.POSITIVE_INFINITY;

    return safeTime >= start && safeTime < end;
  });
}

export function createPlayerStore(initialApi?: DesktopApi) {
  let desktopApi = initialApi ?? createUnavailableDesktopApi();

  return createStore<PlayerStoreState>()((set) => ({
    audio: null,
    apiReady: Boolean(initialApi),
    isLoading: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    activeSegmentIndex: -1,
    error: null,
    bindApi(api) {
      desktopApi = api;
      set({ apiReady: true, error: null });
    },
    async loadAudio(taskId, sourcePath) {
      set({
        isLoading: true,
        error: null,
        audio: null,
        currentTime: 0,
        duration: 0,
        activeSegmentIndex: -1,
        isPlaying: false
      });

      try {
        const audio = await desktopApi.media.resolveTaskAudio(taskId, sourcePath);
        set({
          audio,
          error: audio.available ? null : audio.reason || "当前任务没有可播放音频。"
        });
        return audio;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },
    syncPlayback(currentTime, segments) {
      const safeTime = normalizeTime(currentTime);
      set({
        currentTime: safeTime,
        activeSegmentIndex: findActiveSegmentIndex(segments, safeTime)
      });
    },
    setDuration(duration) {
      set({ duration: normalizeTime(duration) });
    },
    setPlaying(isPlaying) {
      set({ isPlaying });
    },
    reset() {
      set({
        audio: null,
        isLoading: false,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        activeSegmentIndex: -1,
        error: null
      });
    }
  }));
}

const playerStore = createPlayerStore();

export function bindPlayerStoreApi(api?: DesktopApi) {
  playerStore.getState().bindApi(api ?? getDesktopApi());
  return playerStore;
}

export function usePlayerStore<T>(selector: (state: PlayerStoreState) => T) {
  return useStore(playerStore, selector);
}

export function getPlayerStore() {
  return playerStore;
}

export type { PlayerStore, PlayerStoreState };
