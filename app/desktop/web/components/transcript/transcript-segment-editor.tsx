"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type TranscriptSegmentEditorProps = {
  value: string;
  isSaving: boolean;
  onChange(value: string): void;
  onCancel(): void;
  onSave(): void;
};

export function TranscriptSegmentEditor({
  value,
  isSaving,
  onChange,
  onCancel,
  onSave
}: TranscriptSegmentEditorProps) {
  return (
    <div className="rounded-[1.2rem] border border-border/70 bg-white/70 p-4">
      <Textarea
        className="min-h-28 rounded-[1rem] border-border/70 bg-background/80"
        onChange={(event) => onChange(event.target.value)}
        placeholder="输入修正后的转写文本"
        value={value}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="rounded-full px-4" disabled={isSaving || !value.trim()} onClick={onSave}>
          {isSaving ? "保存中" : "保存修正"}
        </Button>
        <Button className="rounded-full px-4" disabled={isSaving} onClick={onCancel} variant="outline">
          取消
        </Button>
      </div>
    </div>
  );
}
