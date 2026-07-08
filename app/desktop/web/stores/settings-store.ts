"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { getDesktopApi } from "../lib/desktop-api";
import type { DesktopApi, DesktopSettings, EngineHealth } from "../lib/desktop-types";

export type AppSettings = {
  language: string;
  modelName: string;
  exportFormat: string;
};

export type EngineHealthSummary = {
  ok: boolean;
  engine: string;
  version: string;
  pythonVersion: string;
  rootDir: string;
  tasksDir: string;
  logsDir: string;
  cacheRootDir: string;
  modelCacheDir: string;
  huggingfaceHomeDir: string;
  modelName: string;
  accuracyProfile: string;
  language: string;
  chunkSeconds: string;
  timestamp: string;
  audioEnhanceEnabled: boolean;
  loudnessNormalizationEnabled: boolean;
  silenceTrimEnabled: boolean;
};

type SettingsStoreState = {
  settings: AppSettings | null;
  health: EngineHealthSummary | null;
  apiReady: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isRefreshingHealth: boolean;
  error: string | null;
  bindApi(api: DesktopApi): void;
  load(): Promise<void>;
  save(input: Partial<AppSettings>): Promise<AppSettings>;
  refreshHealth(): Promise<EngineHealthSummary>;
};

type SettingsStore = ReturnType<typeof createSettingsStore>;

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

  return "设置操作失败";
}

function readString(record: Record<string, unknown>, key: string, fallback = "") {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
}

function readBoolean(record: Record<string, unknown>, key: string, fallback = false) {
  const value = record[key];
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSettings(input: DesktopSettings | null | undefined): AppSettings {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    language: readString(record, "language", "zh"),
    modelName: readString(record, "modelName", "small"),
    exportFormat: readString(record, "exportFormat", "txt")
  };
}

function normalizeHealth(input: EngineHealth | null | undefined): EngineHealthSummary {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    ok: typeof record.ok === "boolean" ? record.ok : true,
    engine: readString(record, "engine", "python"),
    version: readString(record, "version"),
    pythonVersion: readString(record, "python_version"),
    rootDir: readString(record, "root_dir"),
    tasksDir: readString(record, "tasks_dir"),
    logsDir: readString(record, "logs_dir"),
    cacheRootDir: readString(record, "cache_root_dir"),
    modelCacheDir: readString(record, "model_cache_dir"),
    huggingfaceHomeDir: readString(record, "huggingface_home_dir"),
    modelName: readString(record, "model_name"),
    accuracyProfile: readString(record, "accuracy_profile"),
    language: readString(record, "language"),
    chunkSeconds: String(record.chunk_seconds ?? ""),
    timestamp: readString(record, "timestamp"),
    audioEnhanceEnabled: readBoolean(record, "audio_enhance_enabled"),
    loudnessNormalizationEnabled: readBoolean(record, "loudness_normalization_enabled"),
    silenceTrimEnabled: readBoolean(record, "silence_trim_enabled")
  };
}

export function createSettingsStore(initialApi?: DesktopApi) {
  let desktopApi = initialApi ?? createUnavailableDesktopApi();

  return createStore<SettingsStoreState>()((set) => ({
    settings: null,
    health: null,
    apiReady: Boolean(initialApi),
    isLoading: false,
    isSaving: false,
    isRefreshingHealth: false,
    error: null,
    bindApi(api) {
      desktopApi = api;
      set({ apiReady: true, error: null });
    },
    async load() {
      set({ isLoading: true, error: null });

      try {
        const [settings, health] = await Promise.all([
          desktopApi.settings.get(),
          desktopApi.engine.health()
        ]);
        set({
          settings: normalizeSettings(settings),
          health: normalizeHealth(health)
        });
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },
    async save(input) {
      set({ isSaving: true, error: null });

      try {
        const settings = normalizeSettings(await desktopApi.settings.set(input));
        set({ settings });
        return settings;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isSaving: false });
      }
    },
    async refreshHealth() {
      set({ isRefreshingHealth: true, error: null });

      try {
        const health = normalizeHealth(await desktopApi.engine.health());
        set({ health });
        return health;
      } catch (error) {
        set({ error: formatError(error) });
        throw error;
      } finally {
        set({ isRefreshingHealth: false });
      }
    }
  }));
}

const settingsStore = createSettingsStore();

export function bindSettingsStoreApi(api?: DesktopApi) {
  settingsStore.getState().bindApi(api ?? getDesktopApi());
  return settingsStore;
}

export function useSettingsStore<T>(selector: (state: SettingsStoreState) => T) {
  return useStore(settingsStore, selector);
}

export function getSettingsStore() {
  return settingsStore;
}

export type { SettingsStore, SettingsStoreState };
