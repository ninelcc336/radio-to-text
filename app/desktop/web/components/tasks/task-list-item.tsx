"use client";

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
import { cn } from "@/components/ui/utils";
import type { DesktopTask } from "@/lib/desktop-types";

type TaskListItemProps = {
  task: DesktopTask;
  isActive: boolean;
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

export function TaskListItem({ task, isActive, onOpen, onRename, onDelete }: TaskListItemProps) {
  const label = getTaskLabel(task);
  const statusLabel = task.status || task.stage || "未处理";
  const detailLine = getDetailLine(task);

  return (
    <article
      className={cn(
        "group rounded-[1.35rem] border p-4 transition-all",
        isActive
          ? "border-primary/50 bg-primary/10 shadow-[0_12px_30px_rgba(146,89,28,0.18)]"
          : "border-border/80 bg-white/65 hover:border-primary/35 hover:bg-white/90"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          className="min-w-0 flex-1 text-left"
          onClick={() => onOpen(task.task_id)}
          type="button"
        >
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
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-9 w-9 rounded-full" size="icon" variant="ghost">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-xl">
            <DropdownMenuItem onClick={() => onRename(task.task_id)}>
              <PencilLine className="mr-2 h-4 w-4" />
              重命名
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task.task_id)}>
              <Trash2 className="mr-2 h-4 w-4" />
              删除任务
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
