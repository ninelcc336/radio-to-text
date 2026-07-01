from __future__ import annotations

import json
from pathlib import Path

from .models import SpeakerSegment
from .utils import format_timestamp


def export_txt(path: Path, segments: list[SpeakerSegment]) -> None:
    lines = [
        f"[{format_timestamp(segment.start)}] 说话人 {segment.speaker}：{segment.text}"
        for segment in segments
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def export_md(path: Path, segments: list[SpeakerSegment], task_id: str) -> None:
    lines = [f"# 会议转写结果 - {task_id}", ""]
    for segment in segments:
        lines.append(
            f"- `{format_timestamp(segment.start)}` **说话人 {segment.speaker}**：{segment.text}"
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def export_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
