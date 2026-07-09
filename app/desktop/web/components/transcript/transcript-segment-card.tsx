"use client";

import { type MouseEvent, useEffect, useState } from "react";
import { Check, LoaderCircle, PencilLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import type { DesktopTaskSegment } from "@/lib/desktop-types";
import { getDialogStore } from "@/stores/dialog-store";
import { usePlayerStore } from "@/stores/player-store";
import { useTaskDetailStore } from "@/stores/task-detail-store";
import { TranscriptSegmentEditor } from "./transcript-segment-editor";

type TranscriptSegmentCardProps = {
  taskId: string;
  sourceIndex: number;
  segment: DesktopTaskSegment;
  isActive: boolean;
};

function formatClock(seconds: unknown) {
  const safeSeconds = Number(seconds);
  if (!Number.isFinite(safeSeconds) || safeSeconds < 0) {
    return "00:00";
  }

  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function shouldHighlightNeedsReview(segment: DesktopTaskSegment) {
  return (
    Boolean(segment.needs_review) &&
    !["confirmed", "corrected", "deleted"].includes(String(segment.review_status || "").toLowerCase())
  );
}

export function TranscriptSegmentCard({
  taskId,
  sourceIndex,
  segment,
  isActive
}: TranscriptSegmentCardProps) {
  const isSavingReview = useTaskDetailStore((state) => state.isSavingReview);
  const updateReview = useTaskDetailStore((state) => state.updateReview);
  const requestSeek = usePlayerStore((state) => state.requestSeek);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(String(segment.text || ""));
  const [pendingAction, setPendingAction] = useState<"confirm" | "correct" | "delete" | null>(null);
  const showNeedsReviewBadge = shouldHighlightNeedsReview(segment);
  const segmentStart = Number(segment.start);
  const segmentEnd = Number(segment.end);

  useEffect(() => {
    setDraftText(String(segment.text || ""));
  }, [segment.text]);

  async function handleConfirm() {
    if (!showNeedsReviewBadge) {
      return;
    }

    setPendingAction("confirm");
    try {
      await updateReview(taskId, sourceIndex, "confirm");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete() {
    const confirmed = await getDialogStore().getState().openConfirm({
      title: "删除片段",
      description: "确认删除这个片段吗？删除后会从当前审校列表和导出文本中移除。",
      confirmLabel: "确认删除",
      tone: "destructive"
    });
    if (!confirmed) {
      return;
    }

    setPendingAction("delete");
    try {
      await updateReview(taskId, sourceIndex, "delete");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSave() {
    setPendingAction("correct");
    try {
      await updateReview(taskId, sourceIndex, "correct", draftText.trim());
      setIsEditing(false);
    } finally {
      setPendingAction(null);
    }
  }

  function handleSeek() {
    requestSeek(segmentStart, sourceIndex);
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("[data-prevent-seek]")) {
      return;
    }

    handleSeek();
  }

  return (
    <Card
      data-segment-index={sourceIndex}
      onClick={handleCardClick}
      className={cn(
        "cursor-pointer rounded-[1.35rem] border transition-all",
        isActive
          ? "border-primary/45 bg-primary/10 shadow-[0_14px_30px_rgba(146,89,28,0.16)]"
          : "border-border/70 bg-background/70"
      )}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {showNeedsReviewBadge ? (
              <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant="destructive">
                待重点审校
              </Badge>
            ) : null}
            <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant="outline">
              {formatClock(segment.start)} - {formatClock(segment.end)}
            </Badge>
            {segment.speaker ? (
              <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant="secondary">
                说话人 {segment.speaker}
              </Badge>
            ) : null}
          </div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground">片段 #{sourceIndex + 1}</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm leading-7 text-foreground">{segment.text || "当前片段没有文本。"}</p>
          {Array.isArray(segment.review_reasons) && segment.review_reasons.length ? (
            <div className="flex flex-wrap gap-2">
              {segment.review_reasons.map((reason) => (
                <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.16em]" key={reason} variant="outline">
                  {reason}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        {isEditing ? (
          <div data-prevent-seek>
            <TranscriptSegmentEditor
              isSaving={isSavingReview}
              onCancel={() => {
                setDraftText(String(segment.text || ""));
                setIsEditing(false);
              }}
              onChange={setDraftText}
              onSave={() => void handleSave()}
              value={draftText}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2" data-prevent-seek>
          {showNeedsReviewBadge ? (
            <Button className="rounded-full px-4" disabled={isSavingReview} onClick={() => void handleConfirm()} variant="outline">
              {pendingAction === "confirm" ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {pendingAction === "confirm" ? "确认中" : "确认"}
            </Button>
          ) : null}
          <Button
            className="rounded-full px-4"
            disabled={isSavingReview}
            onClick={() => setIsEditing((value) => !value)}
            variant="outline"
          >
            <PencilLine className="mr-2 h-4 w-4" />
            {isEditing ? "收起编辑" : "修正文案"}
          </Button>
          <Button className="rounded-full px-4" disabled={isSavingReview} onClick={() => void handleDelete()} variant="destructive">
            {pendingAction === "delete" ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-2 h-4 w-4" />
            )}
            {pendingAction === "delete" ? "删除中" : "删除片段"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
