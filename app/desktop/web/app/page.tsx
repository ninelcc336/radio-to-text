"use client";

import type { Route } from "next";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Clock3, FolderKanban, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TaskListPanel } from "@/components/tasks/task-list-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Providers } from "./providers";
import { useTasksStore } from "../stores/tasks-store";

function HomePageContent() {
  const router = useRouter();
  const apiReady = useTasksStore((state) => state.apiReady);
  const tasks = useTasksStore((state) => state.tasks);
  const selectedTaskId = useTasksStore((state) => state.selectedTaskId);
  const refreshTasks = useTasksStore((state) => state.refreshTasks);

  useEffect(() => {
    if (!apiReady) {
      return;
    }

    void refreshTasks();
  }, [apiReady, refreshTasks]);

  const selectedTask = tasks.find((task) => task.task_id === selectedTaskId) || null;
  const completedCount = tasks.filter((task) => {
    const status = String(task.status || task.stage || "").toLowerCase();
    return status.includes("done") || status.includes("complete") || status.includes("success");
  }).length;
  const reviewCount = tasks.filter((task) =>
    Array.isArray(task.results?.segments)
      ? task.results.segments.some((segment) => Boolean(segment.needs_review))
      : false
  ).length;

  return (
    <AppShell
      description="任务列表、筛选和基础运维动作已经迁到 Next；详情页、播放器和审校面板将在后续任务接上。"
      eyebrow="Local-first Transcript Desk"
      sidebar={<TaskListPanel />}
      title="任务工作台"
    >
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.26em]" variant="outline">
                Backlog
              </Badge>
              <FolderKanban className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-5 text-4xl font-semibold text-foreground">{tasks.length}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">当前任务总数，作为后续详情路由的入口池。</p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.26em]" variant="secondary">
                Complete
              </Badge>
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-5 text-4xl font-semibold text-foreground">{completedCount}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">已经完成主链处理的任务数量，后续会在详情页接导出操作。</p>
          </CardContent>
        </Card>

        <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Badge className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.26em]" variant="outline">
                Review
              </Badge>
              <Clock3 className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-5 text-4xl font-semibold text-foreground">{reviewCount}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">含待审片段的任务数，用于预估 Task 4 里的审校负载。</p>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-[1.8rem] border-border/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.86),rgba(242,232,214,0.82))]">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
          <div>
            <p className="text-[0.74rem] uppercase tracking-[0.34em] text-muted-foreground">Current Focus</p>
            <h2
              className="mt-3 text-3xl leading-tight text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              {selectedTask ? (selectedTask.name || selectedTask.task_id) : "先从左侧选择一个任务"}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              {selectedTask
                ? "当前首页只负责列表与跳转，进入详情页后再接处理按钮、播放器与审校编辑器。"
                : "当前阶段已经具备列表加载、导入、重命名和删除，本页不提前渲染详情内容。"}
            </p>
          </div>

          <div className="grid gap-3 rounded-[1.4rem] border border-border/70 bg-white/75 p-4">
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.28em] text-muted-foreground">Next Route</p>
              <p className="mt-2 text-sm font-medium text-foreground">
                {selectedTask ? `/tasks/${selectedTask.task_id}` : "/tasks/[taskId]"}
              </p>
            </div>
            <Button
              className="rounded-full"
              disabled={!selectedTask}
              onClick={() => {
                if (!selectedTask) {
                  return;
                }
                router.push(`/tasks/${selectedTask.task_id}` as Route);
              }}
              variant="outline"
            >
              {selectedTask ? "预览详情路由" : "等待选择任务"}
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default function HomePage() {
  return (
    <Providers>
      <HomePageContent />
    </Providers>
  );
}
