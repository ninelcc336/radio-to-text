from __future__ import annotations

import json
from pathlib import Path

from .utils import format_timestamp


def export_txt(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def export_md(path: Path, segments: list[dict], task_id: str) -> None:
    lines = [f"# 会议转写结果 - {task_id}", ""]
    for segment in segments:
        lines.append(f"- `{format_timestamp(segment['start'])}` {segment['text']}")
    path.write_text("\n".join(lines), encoding="utf-8")


def export_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
