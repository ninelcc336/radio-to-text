"use client";

import type { Route } from "next";
import { startTransition, useDeferredValue, useState } from "react";
import { useRouter } from "next/navigation";
import { AudioLines, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { TaskListItem } from "@/components/tasks/task-list-item";
import type { DesktopTask } from "@/lib/desktop-types";
import { useTasksStore } from "@/stores/tasks-store";

function matchesTask(task: DesktopTask, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  return [task.task_id, task.name, task.status, task.stage]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function TaskListPanel() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const tasks = useTasksStore((state) => state.tasks);
  const selectedTaskId = useTasksStore((state) => state.selectedTaskId);
  const isLoading = useTasksStore((state) => state.isLoading);
  const isImporting = useTasksStore((state) => state.isImporting);
  const error = useTasksStore((state) => state.error);
  const importAudioTask = useTasksStore((state) => state.importAudioTask);
  const renameTask = useTasksStore((state) => state.renameTask);
  const deleteTask = useTasksStore((state) => state.deleteTask);
  const selectTask = useTasksStore((state) => state.selectTask);

  const visibleTasks = tasks.filter((task) => matchesTask(task, deferredQuery));

  async function handleImportAudio() {
    const task = await importAudioTask();
    if (!task) {
      return;
    }

    startTransition(() => {
      router.push(`/tasks/${task.task_id}` as Route);
    });
  }

  function handleOpenTask(taskId: string) {
    selectTask(taskId);
    startTransition(() => {
      router.push(`/tasks/${taskId}` as Route);
    });
  }

  async function handleRenameTask(taskId: string) {
    const currentTask = tasks.find((item) => item.task_id === taskId);
    const nextName = window.prompt("输入新的任务名称", currentTask?.name || currentTask?.task_id || "");
    if (!nextName?.trim()) {
      return;
    }

    await renameTask(taskId, nextName.trim());
  }

  async function handleDeleteTask(taskId: string) {
    const currentTask = tasks.find((item) => item.task_id === taskId);
    const confirmed = window.confirm(`确认删除任务“${currentTask?.name || taskId}”吗？`);
    if (!confirmed) {
      return;
    }

    await deleteTask(taskId);
  }

  return (
    <Card className="flex h-full min-h-[32rem] flex-col rounded-[1.6rem] border-border/70 bg-background/85">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Task Index</p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              当前任务
            </CardTitle>
          </div>
          <Button className="rounded-full px-4" disabled={isImporting} onClick={() => void handleImportAudio()}>
            <Plus className="mr-2 h-4 w-4" />
            导入音频
          </Button>
        </div>

        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-full border-border/70 bg-white/70 pl-10"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="按任务名、状态或 ID 过滤"
            value={query}
          />
        </label>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[1.2rem] border border-border/70 bg-white/80 p-3">
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Total</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{tasks.length}</p>
          </div>
          <div className="rounded-[1.2rem] border border-border/70 bg-white/80 p-3">
            <p className="text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Visible</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{visibleTasks.length}</p>
          </div>
        </div>

        <Separator />

        {error ? (
          <div className="rounded-[1.1rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 pr-1">
          <div className="space-y-3 pr-4">
            {visibleTasks.map((task) => (
              <TaskListItem
                isActive={selectedTaskId === task.task_id}
                key={task.task_id}
                onDelete={(taskId) => void handleDeleteTask(taskId)}
                onOpen={handleOpenTask}
                onRename={(taskId) => void handleRenameTask(taskId)}
                task={task}
              />
            ))}

            {!isLoading && !visibleTasks.length ? (
              <div className="rounded-[1.3rem] border border-dashed border-border/80 bg-white/60 px-5 py-8 text-center">
                <AudioLines className="mx-auto h-8 w-8 text-muted-foreground" />
                <p
                  className="mt-4 text-xl font-semibold text-foreground"
                  style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
                >
                  {tasks.length ? "没有匹配的任务" : "还没有任务"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {tasks.length
                    ? "换个关键词，或者直接从左上角导入新的音频。"
                    : "从这里导入会议音频，下一阶段会在详情页接入播放器和审校界面。"}
                </p>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
