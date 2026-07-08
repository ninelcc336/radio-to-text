"use client";

import { Filter, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlayerStore } from "@/stores/player-store";
import {
  getReviewStats,
  getVisibleSegments,
  useTaskDetailStore,
  type ReviewFilter
} from "@/stores/task-detail-store";
import { TranscriptSegmentCard } from "./transcript-segment-card";

type TranscriptSegmentListProps = {
  taskId: string;
};

const filterOptions: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "全部片段" },
  { value: "needs-review", label: "待重点审校" }
];

export function TranscriptSegmentList({ taskId }: TranscriptSegmentListProps) {
  const task = useTaskDetailStore((state) => state.task);
  const reviewFilter = useTaskDetailStore((state) => state.reviewFilter);
  const setReviewFilter = useTaskDetailStore((state) => state.setReviewFilter);
  const activeSegmentIndex = usePlayerStore((state) => state.activeSegmentIndex);
  const visibleSegments = getVisibleSegments(task, reviewFilter);
  const reviewStats = getReviewStats(task);

  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Review Queue</p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              逐段审校
            </CardTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <Button
                  className="rounded-full px-4"
                  key={option.value}
                  onClick={() => setReviewFilter(option.value)}
                  variant={reviewFilter === option.value ? "default" : "outline"}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs tracking-[0.18em] text-muted-foreground">
            {reviewFilter === "needs-review" ? <Filter className="h-4 w-4" /> : <ListTree className="h-4 w-4" />}
            {reviewFilter === "needs-review" ? `待重点审校 ${reviewStats.needsReview} 段` : `当前 ${visibleSegments.length} 段`}
          </div>
        </div>
      </CardHeader>

      <CardContent className="min-h-0">
        <ScrollArea className="h-[34rem] pr-3">
          <div className="space-y-3">
            {visibleSegments.map(({ sourceIndex, segment }) => (
              <TranscriptSegmentCard
                isActive={sourceIndex === activeSegmentIndex}
                key={`${taskId}-${sourceIndex}`}
                segment={segment}
                sourceIndex={sourceIndex}
                taskId={taskId}
              />
            ))}

            {!visibleSegments.length ? (
              <div className="rounded-[1.3rem] border border-dashed border-border/80 bg-background/60 px-5 py-8 text-center text-sm leading-6 text-muted-foreground">
                当前筛选条件下没有可显示片段。可以切回“全部”或先运行一次处理链。
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
