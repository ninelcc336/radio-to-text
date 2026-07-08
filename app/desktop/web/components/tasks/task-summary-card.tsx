"use client";

import type { ReactNode } from "react";
import { Activity, CheckCircle2, FileAudio2, MessageSquareQuote, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DesktopTask } from "@/lib/desktop-types";
import { getReviewStats } from "@/stores/task-detail-store";

type TaskSummaryCardProps = {
  task: DesktopTask | null;
  actions?: ReactNode;
};

function formatDuration(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "未记录";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes} 分 ${remainingSeconds} 秒`;
}

function getSourceName(task: DesktopTask | null) {
  if (!task) {
    return "等待加载";
  }

  if (typeof task.metadata?.original_file_name === "string") {
    return task.metadata.original_file_name;
  }

  if (typeof task.source_path === "string") {
    return String(task.source_path).split(/[\\/]/).pop() || task.task_id;
  }

  return task.task_id;
}

export function TaskSummaryCard({ task, actions }: TaskSummaryCardProps) {
  const reviewStats = getReviewStats(task);
  const speakerCount = Array.isArray(task?.results?.speaker_segments)
    ? new Set(
        task.results.speaker_segments
          .map((segment) => String(segment.speaker || "").trim())
          .filter(Boolean)
      ).size
    : 0;
  const exportCount = task?.exports ? Object.keys(task.exports).length : 0;
  const lastLog = task?.logs?.at(-1)?.message || "暂无处理日志";

  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/78">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Task Summary</p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              {task?.name || task?.task_id || "未选择任务"}
            </CardTitle>
          </div>
          <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant="outline">
            {task?.status || task?.stage || "idle"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {actions ? (
          <div className="grid gap-3 rounded-[1.3rem] border border-border/70 bg-background/60 p-4">
            <p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Task Action</p>
            <div className="flex flex-wrap gap-3">{actions}</div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileAudio2 className="h-4 w-4" />
              音频时长
            </div>
            <p className="mt-3 text-lg font-semibold text-foreground">
              {formatDuration(task?.metadata?.duration_seconds)}
            </p>
          </div>

          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" />
              分段数量
            </div>
            <p className="mt-3 text-lg font-semibold text-foreground">{reviewStats.total}</p>
          </div>

          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              待重点审校
            </div>
            <p className="mt-3 text-lg font-semibold text-foreground">{reviewStats.needsReview}</p>
          </div>

          <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <UserRound className="h-4 w-4" />
              说话人数
            </div>
            <p className="mt-3 text-lg font-semibold text-foreground">{speakerCount || "未分人"}</p>
          </div>
        </div>

        <div className="rounded-[1.3rem] border border-border/70 bg-background/60 p-4">
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Source</p>
          <p className="mt-3 text-sm font-medium leading-6 text-foreground">{getSourceName(task)}</p>
        </div>

        <div className="rounded-[1.3rem] border border-border/70 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
            <MessageSquareQuote className="h-4 w-4" />
            最近日志
          </div>
          <p className="mt-3 text-sm leading-6 text-foreground">{lastLog}</p>
          <p className="mt-3 text-xs text-muted-foreground">当前已有导出 {exportCount} 项。</p>
        </div>
      </CardContent>
    </Card>
  );
}
