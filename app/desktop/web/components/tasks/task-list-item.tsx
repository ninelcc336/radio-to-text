"use client";

import type { KeyboardEvent } from "react";
import { MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { getTaskStatusLabel } from "@/lib/task-status";
import { cn } from "@/components/ui/utils";
import type { DesktopTask } from "@/lib/desktop-types";

type TaskListItemProps = {
  task: DesktopTask;
  isActive: boolean;
  isMutating?: boolean;
  onOpen(taskId: string): void;
  onRename(taskId: string): void;
  onDelete(taskId: string): void;
};

function getTaskLabel(task: DesktopTask) {
  return task.name || task.task_id;
}

function getStatusTone(task: DesktopTask) {
  const status = String(task.status || task.stage || "").toLowerCase();

  if (status.includes("error") || status.includes("fail")) {
    return "destructive" as const;
  }

  if (status.includes("done") || status.includes("complete") || status.includes("success")) {
    return "secondary" as const;
  }

  return "outline" as const;
}

function getDetailLine(task: DesktopTask) {
  const sourceName =
    typeof task.metadata?.source_name === "string"
      ? task.metadata.source_name
      : typeof task.metadata?.source_path === "string"
        ? String(task.metadata.source_path).split(/[\\/]/).pop()
        : null;
  const segmentCount = Array.isArray(task.results?.segments) ? task.results?.segments.length : 0;

  return [sourceName, segmentCount ? `${segmentCount} 段` : null].filter(Boolean).join(" · ");
}

export function TaskListItem({
  task,
  isActive,
  isMutating = false,
  onOpen,
  onRename,
  onDelete
}: TaskListItemProps) {
  const label = getTaskLabel(task);
  const statusLabel = getTaskStatusLabel(task);
  const detailLine = getDetailLine(task);
  const isDisabled = isMutating;

  function handleOpen() {
    if (isDisabled) {
      return;
    }

    onOpen(task.task_id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (isDisabled) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(task.task_id);
    }
  }

  return (
    <article
      aria-disabled={isDisabled}
      className={cn(
        "group rounded-[1.35rem] border p-4 transition-all",
        isDisabled ? "cursor-progress opacity-80" : "cursor-pointer",
        isActive
          ? "border-primary/50 bg-primary/10 shadow-[0_12px_30px_rgba(146,89,28,0.18)]"
          : "border-border/80 bg-white/65 hover:border-primary/35 hover:bg-white/90"
      )}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <p
              className="truncate text-lg font-semibold text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              {label}
            </p>
            {isActive ? (
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_5px_rgba(146,89,28,0.14)]" />
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{detailLine || "准备进入处理链路"}</p>
        </div>

        <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-9 w-9 rounded-full" disabled={isMutating} size="icon" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-xl">
              <DropdownMenuItem disabled={isMutating} onClick={() => onRename(task.task_id)}>
                <PencilLine className="mr-2 h-4 w-4" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" disabled={isMutating} onClick={() => onDelete(task.task_id)}>
                <Trash2 className="mr-2 h-4 w-4" />
                删除任务
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant={getStatusTone(task)}>
          {statusLabel}
        </Badge>
        <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant="outline">
          {task.task_id}
        </Badge>
      </div>
    </article>
  );
}
