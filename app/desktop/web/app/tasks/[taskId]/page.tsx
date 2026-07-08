"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AudioPlayerPanel } from "@/components/player/audio-player-panel";
import { ExportMenu } from "@/components/export/export-menu";
import { TaskActionBar } from "@/components/tasks/task-action-bar";
import { TaskListPanel } from "@/components/tasks/task-list-panel";
import { TaskSummaryCard } from "@/components/tasks/task-summary-card";
import { TranscriptSegmentList } from "@/components/transcript/transcript-segment-list";
import { TranscriptToolbar } from "@/components/transcript/transcript-toolbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Providers } from "../../providers";
import { getDesktopApi } from "../../../lib/desktop-api";
import { bindPlayerStoreApi } from "../../../stores/player-store";
import {
  bindTaskDetailStoreApi,
  useTaskDetailStore
} from "../../../stores/task-detail-store";
import { bindTasksStoreApi, useTasksStore } from "../../../stores/tasks-store";

type TaskDetailPageProps = {
  params: {
    taskId: string;
  };
};

function TaskDetailPageContent({ taskId }: { taskId: string }) {
  const apiReady = useTaskDetailStore((state) => state.apiReady);
  const task = useTaskDetailStore((state) => state.task);
  const error = useTaskDetailStore((state) => state.error);
  const isLoading = useTaskDetailStore((state) => state.isLoading);
  const isBusy = useTaskDetailStore((state) => state.isBusy);
  const loadTask = useTaskDetailStore((state) => state.loadTask);
  const processTask = useTaskDetailStore((state) => state.processTask);

  const tasksApiReady = useTasksStore((state) => state.apiReady);
  const refreshTasks = useTasksStore((state) => state.refreshTasks);
  const selectTask = useTasksStore((state) => state.selectTask);

  useEffect(() => {
    const desktopApi = getDesktopApi();
    bindTasksStoreApi(desktopApi);
    bindTaskDetailStoreApi(desktopApi);
    bindPlayerStoreApi(desktopApi);
  }, []);

  useEffect(() => {
    if (!tasksApiReady) {
      return;
    }

    selectTask(taskId);
    void refreshTasks();
  }, [refreshTasks, selectTask, taskId, tasksApiReady]);

  useEffect(() => {
    if (!apiReady) {
      return;
    }

    void loadTask(taskId);
  }, [apiReady, loadTask, taskId]);

  useEffect(() => {
    if (!tasksApiReady || !task) {
      return;
    }

    void refreshTasks();
  }, [refreshTasks, task, tasksApiReady]);

  return (
    <AppShell
      description="任务详情已经迁到 Next：在这里处理转写、播放源和逐段审校，仍然复用原有 Python 主链。"
      eyebrow="Task Detail Deck"
      sidebar={<TaskListPanel />}
      title="任务详情"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild className="rounded-full" variant="outline">
          <Link href={"/" as Route}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回任务列表
          </Link>
        </Button>
        <ExportMenu task={task} />
      </div>

      {error ? (
        <Card className="rounded-[1.5rem] border-destructive/30 bg-destructive/10">
          <CardContent className="p-5 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <TaskActionBar
            isBusy={isBusy}
            onProcess={() => processTask(taskId)}
            task={task}
          />
          <AudioPlayerPanel taskId={taskId} />
          <TranscriptToolbar />
          <TranscriptSegmentList taskId={taskId} />
        </div>

        <div className="space-y-5">
          <TaskSummaryCard task={task} />
          {isLoading && !task ? (
            <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
              <CardContent className="p-5 text-sm text-muted-foreground">
                正在加载任务详情与可播放资源。
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  return (
    <Providers>
      <TaskDetailPageContent taskId={params.taskId} />
    </Providers>
  );
}
