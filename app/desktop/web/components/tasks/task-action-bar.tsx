"use client";

import { Play, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DesktopTask } from "@/lib/desktop-types";

type TaskActionBarProps = {
  task: DesktopTask | null;
  isBusy: boolean;
  onProcess(): Promise<DesktopTask | null> | DesktopTask | null;
};

function getButtonLabel(task: DesktopTask | null) {
  const status = String(task?.status || task?.stage || "").toLowerCase();
  if (status.includes("processing")) {
    return "处理中";
  }

  if (status.includes("completed") || status.includes("done") || status.includes("success")) {
    return "重新处理";
  }

  return "开始处理";
}

export function TaskActionBar({ task, isBusy, onProcess }: TaskActionBarProps) {
  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">Pipeline Action</p>
          <p className="mt-2 text-sm leading-6 text-foreground">
            处理动作仍然直接走原来的 Python 管线，详情页只负责发起和回显状态。
          </p>
        </div>

        <Button
          className="rounded-full px-5"
          disabled={!task || isBusy}
          onClick={() => void onProcess()}
        >
          {String(task?.status || task?.stage || "").toLowerCase().includes("completed") ? (
            <RefreshCcw className="mr-2 h-4 w-4" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isBusy ? "处理中" : getButtonLabel(task)}
        </Button>
      </CardContent>
    </Card>
  );
}
