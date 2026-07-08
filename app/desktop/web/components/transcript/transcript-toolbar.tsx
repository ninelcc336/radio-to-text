"use client";

import { Filter, FileText, MessageSquareMore, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import {
  getReviewStats,
  useTaskDetailStore,
  type ReviewFilter,
  type TaskTextVersion
} from "@/stores/task-detail-store";

const textOptions: Array<{ value: TaskTextVersion; label: string; icon: typeof FileText }> = [
  { value: "clean", label: "净化文本", icon: FileText },
  { value: "raw", label: "原始文本", icon: ScanSearch },
  { value: "speaker", label: "说话人视图", icon: MessageSquareMore }
];

const filterOptions: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "needs-review", label: "待重点审校" },
  { value: "reviewed", label: "已审" },
  { value: "pending", label: "未审" }
];

export function TranscriptToolbar() {
  const task = useTaskDetailStore((state) => state.task);
  const textVersion = useTaskDetailStore((state) => state.textVersion);
  const reviewFilter = useTaskDetailStore((state) => state.reviewFilter);
  const setTextVersion = useTaskDetailStore((state) => state.setTextVersion);
  const setReviewFilter = useTaskDetailStore((state) => state.setReviewFilter);
  const reviewStats = getReviewStats(task);

  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-muted-foreground">Text Source</p>
          <div className="flex flex-wrap gap-2">
            {textOptions.map((option) => {
              const Icon = option.icon;
              const active = textVersion === option.value;

              return (
                <Button
                  className={cn("rounded-full px-4", active && "shadow-[0_10px_25px_rgba(146,89,28,0.18)]")}
                  key={option.value}
                  onClick={() => setTextVersion(option.value)}
                  variant={active ? "default" : "outline"}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[0.72rem] uppercase tracking-[0.3em] text-muted-foreground">Review Filter</p>
            <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-4 w-4" />
              总计 {reviewStats.total} 段
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const active = reviewFilter === option.value;
              return (
                <Button
                  className="rounded-full px-4"
                  key={option.value}
                  onClick={() => setReviewFilter(option.value)}
                  variant={active ? "default" : "outline"}
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
