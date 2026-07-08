export type ReviewAction = "confirm" | "correct" | "delete";

export type DesktopTaskSegment = {
  start: number;
  end?: number;
  text?: string;
  speaker?: string | null;
  needs_review?: boolean;
  review_reasons?: string[];
  review_status?: string;
  reviewed_text?: string | null;
  [key: string]: unknown;
};

export type DesktopTaskResults = {
  segments?: DesktopTaskSegment[];
  raw_segments?: DesktopTaskSegment[];
  speaker_segments?: DesktopTaskSegment[];
  raw_speaker_segments?: DesktopTaskSegment[];
  plain_text?: string;
  raw_plain_text?: string;
  speaker_text?: string;
  raw_speaker_text?: string;
  full_text?: string;
  [key: string]: unknown;
};

export type DesktopTask = {
  task_id: string;
  name?: string;
  status?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
  results?: DesktopTaskResults;
  artifacts?: Record<string, string>;
  exports?: Record<string, string>;
  logs?: Array<{ timestamp?: string; message?: string }>;
  [key: string]: unknown;
};

export type ResolvedTaskAudio = {
  available: boolean;
  reason?: string;
  path?: string;
  url?: string;
  extension?: string;
  fileName?: string;
};

export type SaveTextPayload = {
  title?: string;
  defaultFileName?: string;
  content: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
};

export type OpenDialogResult = {
  canceled: boolean;
  filePaths?: string[];
};

export type SaveDialogResult = {
  canceled: boolean;
  filePath?: string;
};

export type DesktopSettings = Record<string, unknown>;
export type DesktopSettingsInput = Record<string, unknown>;
export type EngineHealth = Record<string, unknown>;

export type EngineError = {
  code?: string;
  message?: string;
};

export type EngineResponse<TData> = {
  ok: boolean;
  status?: string;
  action?: string;
  data?: TData;
  error?: EngineError;
};

export type DesktopBridge = {
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>;
};

export type LegacyEngineApi = {
  request<T = unknown>(request: {
    action: string;
    payload?: Record<string, unknown>;
  }): Promise<EngineResponse<T>>;
  selectAudioFile(): Promise<OpenDialogResult>;
  saveTextFile(payload: SaveTextPayload): Promise<SaveDialogResult>;
  resolveTaskAudioSource(payload: {
    taskId: string;
    sourcePath?: string;
  }): Promise<ResolvedTaskAudio>;
};

export type DesktopApi = {
  tasks: {
    list(): Promise<DesktopTask[]>;
    get(taskId: string): Promise<DesktopTask | null>;
    importAudio(): Promise<DesktopTask | null>;
    process(taskId: string): Promise<DesktopTask | null>;
    rename(taskId: string, name: string): Promise<DesktopTask | null>;
    delete(taskId: string): Promise<{ taskId: string }>;
  };
  review: {
    update(
      taskId: string,
      segmentIndex: number,
      action: ReviewAction,
      reviewedText?: string
    ): Promise<DesktopTask | null>;
  };
  media: {
    resolveTaskAudio(taskId: string, sourcePath?: string): Promise<ResolvedTaskAudio>;
  };
  dialog: {
    selectAudio(): Promise<OpenDialogResult>;
    saveText(payload: SaveTextPayload): Promise<SaveDialogResult>;
  };
  settings: {
    get(): Promise<DesktopSettings>;
    set(payload: DesktopSettingsInput): Promise<DesktopSettings>;
  };
  engine: {
    health(): Promise<EngineHealth>;
  };
};

declare global {
  interface Window {
    desktopApi?: DesktopApi;
    engineApi?: LegacyEngineApi;
  }
}
