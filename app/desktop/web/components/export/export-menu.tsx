"use client";

import { Download, FileDown, FileJson2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { getDesktopApi } from "@/lib/desktop-api";
import type { DesktopTask } from "@/lib/desktop-types";
import { getTaskText } from "@/stores/task-detail-store";

type ExportMenuProps = {
  task: DesktopTask | null;
};

function getTaskFileStem(task: DesktopTask | null) {
  const base = task?.name || task?.task_id || "transcript";
  return base.replace(/[\\/:*?"<>|]+/g, "-");
}

export function ExportMenu({ task }: ExportMenuProps) {
  async function saveText(
    content: string,
    defaultFileName: string,
    filters: Array<{ name: string; extensions: string[] }>
  ) {
    if (!content.trim()) {
      return;
    }

    await getDesktopApi().dialog.saveText({
      title: "保存转写文本",
      defaultFileName,
      content,
      filters
    });
  }

  const taskStem = getTaskFileStem(task);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="rounded-full px-5" disabled={!task} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          导出文本
        </Button>
      </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 rounded-xl">
          <DropdownMenuItem
            disabled={!task}
            onClick={() =>
              void saveText(
                getTaskText(task, "clean"),
                `${taskStem}-clean.txt`,
                [{ name: "Text", extensions: ["txt"] }]
            )
          }
        >
          <FileJson2 className="mr-2 h-4 w-4" />
          导出净化文本
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!task}
          onClick={() =>
            void saveText(
              getTaskText(task, "raw"),
              `${taskStem}-raw.txt`,
              [{ name: "Text", extensions: ["txt"] }]
            )
          }
        >
          <FileDown className="mr-2 h-4 w-4" />
          导出原始文本
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
