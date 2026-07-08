"use client";

import { useState } from "react";
import { Check, PencilLine, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import type { DesktopTaskSegment } from "@/lib/desktop-types";
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

function getStatusLabel(segment: DesktopTaskSegment) {
  const status = String(segment.review_status || "").toLowerCase();
  if (status === "confirmed") {
    return "已确认";
  }
  if (status === "corrected") {
    return "已修正";
  }
  if (status === "deleted") {
    return "已删除";
  }
  return segment.needs_review ? "待重点审校" : "待审";
}

export function TranscriptSegmentCard({
  taskId,
  sourceIndex,
  segment,
  isActive
}: TranscriptSegmentCardProps) {
  const isSavingReview = useTaskDetailStore((state) => state.isSavingReview);
  const updateReview = useTaskDetailStore((state) => state.updateReview);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(String(segment.text || ""));

  async function handleConfirm() {
    await updateReview(taskId, sourceIndex, "confirm");
  }

  async function handleDelete() {
    await updateReview(taskId, sourceIndex, "delete");
  }

  async function handleSave() {
    await updateReview(taskId, sourceIndex, "correct", draftText.trim());
    setIsEditing(false);
  }

  return (
    <Card
      className={cn(
        "rounded-[1.35rem] border transition-all",
        isActive
          ? "border-primary/45 bg-primary/10 shadow-[0_14px_30px_rgba(146,89,28,0.16)]"
          : "border-border/70 bg-background/70"
      )}
    >
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full px-3 py-1 text-[0.72rem] tracking-[0.18em]" variant={segment.needs_review ? "destructive" : "outline"}>
              {getStatusLabel(segment)}
            </Badge>
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
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full px-4" disabled={isSavingReview} onClick={() => void handleConfirm()} variant="outline">
            <Check className="mr-2 h-4 w-4" />
            确认
          </Button>
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
            <Trash2 className="mr-2 h-4 w-4" />
            删除片段
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
