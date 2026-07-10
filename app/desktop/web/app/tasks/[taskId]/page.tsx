"use client";

import { useEffect } from "react";
import { LoaderCircle, Play, RefreshCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AudioPlayerPanel } from "@/components/player/audio-player-panel";
import { ExportMenu } from "@/components/export/export-menu";
import { TaskListPanel } from "@/components/tasks/task-list-panel";
import { TaskSummaryCard } from "@/components/tasks/task-summary-card";
import { TranscriptSegmentList } from "@/components/transcript/transcript-segment-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { APP_BRAND_NAME } from "@/lib/app-config";
import { isTaskCompleted } from "@/lib/task-status";
import { Providers } from "../../providers";
import { getDesktopApi } from "../../../lib/desktop-api";
import { bindPlayerStoreApi } from "../../../stores/player-store";
import {
  bindTaskDetailStoreApi,
  useTaskDetailStore,
} from "../../../stores/task-detail-store";
import { bindTasksStoreApi, useTasksStore } from "../../../stores/tasks-store";

type TaskDetailPageProps = {
  params: {
    taskId: string;
  };
};

function getProcessButtonLabel(taskStatus: string, isBusy: boolean) {
  if (isBusy) {
    return "处理中";
  }

  if (taskStatus.includes("completed") || taskStatus.includes("done") || taskStatus.includes("success")) {
    return "重新处理";
  }

  return "开始处理";
}

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

  const taskStatus = String(task?.status || task?.stage || "").toLowerCase();
  const hasCompletedOutput = isTaskCompleted(task);

  return (
    <AppShell
      description="音频文件转写为文本，并对转写结果进行审校，全流程本地端处理，数据零外泄风险。"
      eyebrow="Task Detail Deck"
      lockViewport
      sidebar={<TaskListPanel />}
      title={APP_BRAND_NAME}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden">
        {error ? (
          <Card className="shrink-0 rounded-[1.5rem] border-destructive/30 bg-destructive/10">
            <CardContent className="p-5 text-sm text-destructive">
              {error}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-5 overflow-hidden xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-stretch">
          <div className="flex min-h-0 flex-col gap-5 xl:h-full">
            <div className="shrink-0">
              <AudioPlayerPanel taskId={taskId} />
            </div>
            <div className="min-h-0 flex-1">
              <TranscriptSegmentList taskId={taskId} />
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-5 xl:h-full">
            <div className="min-h-0 flex-1">
              <TaskSummaryCard
                actions={
                  <>
                    <Button
                      className="rounded-full px-5"
                      disabled={!task || isBusy}
                      onClick={() => void processTask(taskId)}
                    >
                      {isBusy ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : hasCompletedOutput ? (
                        <RefreshCcw className="mr-2 h-4 w-4" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      {getProcessButtonLabel(taskStatus, isBusy)}
                    </Button>
                    <ExportMenu task={task} />
                  </>
                }
                task={task}
              />
            </div>
            {isLoading && !task ? (
              <Card className="shrink-0 rounded-[1.6rem] border-border/70 bg-white/75">
                <CardContent className="p-5 text-sm text-muted-foreground">
                  正在加载任务详情与可播放资源
                </CardContent>
              </Card>
            ) : null}
          </div>
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
