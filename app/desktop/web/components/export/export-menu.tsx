"use client";

import { Download, FileDown, FileJson2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { getDesktopApi } from "@/lib/desktop-api";
import type { DesktopTask } from "@/lib/desktop-types";
import { getTaskText, useTaskDetailStore } from "@/stores/task-detail-store";

type ExportMenuProps = {
  task: DesktopTask | null;
};

function getTaskFileStem(task: DesktopTask | null) {
  const base = task?.name || task?.task_id || "transcript";
  return base.replace(/[\\/:*?"<>|]+/g, "-");
}

export function ExportMenu({ task }: ExportMenuProps) {
  const textVersion = useTaskDetailStore((state) => state.textVersion);

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
              getTaskText(task, textVersion),
              `${taskStem}-${textVersion}.txt`,
              [{ name: "Text", extensions: ["txt"] }]
            )
          }
        >
          <FileDown className="mr-2 h-4 w-4" />
          导出当前视图
        </DropdownMenuItem>
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
              getTaskText(task, "speaker"),
              `${taskStem}-speaker.md`,
              [{ name: "Markdown", extensions: ["md"] }]
            )
          }
        >
          <UsersRound className="mr-2 h-4 w-4" />
          导出说话人视图
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
