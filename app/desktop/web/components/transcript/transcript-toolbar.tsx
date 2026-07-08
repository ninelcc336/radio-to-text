"use client";

import { FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function TranscriptToolbar() {
  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-3">
          <p className="text-[0.72rem] uppercase tracking-[0.3em] text-muted-foreground">Text Source</p>
          <div className="inline-flex items-center rounded-full border border-border/70 bg-background/70 px-4 py-2 text-sm text-foreground">
            <FileText className="mr-2 h-4 w-4 text-primary" />
            净化文本
          </div>
          <div className="rounded-[1.2rem] border border-border/70 bg-background/60 p-4 text-sm leading-6 text-muted-foreground">
            当前详情页只审校净化后的片段文本。原始文本保留为导出内容，不再提供说话人视图切换。
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
