import type { DesktopTask } from "./desktop-types";

const STATUS_LABELS: Record<string, string> = {
  created: "新建",
  imported: "已导入",
  ready: "待处理",
  idle: "空闲",
  processing: "处理中",
  preprocessing: "预处理中",
  transcribing: "转写中",
  diarizing: "分人处理中",
  exporting: "导出中",
  completed: "已完成",
  done: "已完成",
  success: "已完成",
  failed: "处理失败",
  error: "处理失败"
};

export function getTaskStatusCode(task: DesktopTask | null | undefined) {
  return String(task?.status || task?.stage || "idle").trim().toLowerCase();
}

export function isTaskCompleted(task: DesktopTask | null | undefined) {
  const status = getTaskStatusCode(task);
  return status.includes("done") || status.includes("complete") || status.includes("success");
}

export function getTaskStatusLabel(task: DesktopTask | null | undefined) {
  const status = String(task?.status || "").trim().toLowerCase();
  const stage = String(task?.stage || "").trim().toLowerCase();

  if (status === "processing" && stage && STATUS_LABELS[stage]) {
    return STATUS_LABELS[stage];
  }

  if (status && STATUS_LABELS[status]) {
    return STATUS_LABELS[status];
  }

  if (stage && STATUS_LABELS[stage]) {
    return STATUS_LABELS[stage];
  }

  return String(task?.status || task?.stage || "未处理");
}
