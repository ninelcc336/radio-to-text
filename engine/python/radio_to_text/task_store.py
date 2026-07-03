from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Any

from .config import EngineConfig
from .utils import utc_now


class TaskStore:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self.config.tasks_dir.mkdir(parents=True, exist_ok=True)

    def create_task(self, source_path: str) -> dict[str, Any]:
        # 每个任务都独立占一个目录，原始文件、中间文件和导出文件分开存放。
        task_id = self._make_task_id()
        task_dir = self.task_dir(task_id)
        for relative in ("source", "working", "output"):
            (task_dir / relative).mkdir(parents=True, exist_ok=True)

        task = {
            "task_id": task_id,
            "name": default_task_name(),
            "source_path": source_path,
            "status": "created",
            "stage": "created",
            "created_at": utc_now(),
            "updated_at": utc_now(),
            "artifacts": {
                "source_dir": str(task_dir / "source"),
                "working_dir": str(task_dir / "working"),
                "output_dir": str(task_dir / "output"),
            },
            "metadata": {},
            "results": {
                "segments": [],
                "speaker_segments": [],
                "plain_text": "",
                "speaker_text": "",
                "full_text": "",
            },
            "exports": {},
            "logs": [],
        }
        self.save_task(task)
        return task

    def save_task(self, task: dict[str, Any]) -> None:
        # task.json 是整个任务的单一事实来源，页面和导出都依赖它。
        task["name"] = normalize_task_name(task)
        task["updated_at"] = utc_now()
        self.task_file(task["task_id"]).write_text(
            json.dumps(task, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def load_task(self, task_id: str) -> dict[str, Any]:
        task_file = self.task_file(task_id)
        if not task_file.exists():
            raise FileNotFoundError(f"Task not found: {task_id}")
        task = json.loads(task_file.read_text(encoding="utf-8"))
        task["name"] = normalize_task_name(task)
        return task

    def list_tasks(self) -> list[dict[str, Any]]:
        tasks = []
        # 新任务排前面，桌面端刷新后可以直接看到最近处理结果。
        for task_file in sorted(self.config.tasks_dir.glob("*/task.json"), reverse=True):
            task = json.loads(task_file.read_text(encoding="utf-8"))
            task["name"] = normalize_task_name(task)
            tasks.append(task)
        return tasks

    def delete_task(self, task_id: str) -> None:
        task_dir = self.task_dir(task_id)
        if not task_dir.exists():
            raise FileNotFoundError(f"Task not found: {task_id}")
        shutil.rmtree(task_dir)

    def rename_task(self, task_id: str, name: str) -> dict[str, Any]:
        task = self.load_task(task_id)
        task["name"] = name.strip()
        self.save_task(task)
        return task

    def append_log(self, task: dict[str, Any], message: str) -> None:
        task.setdefault("logs", []).append({"timestamp": utc_now(), "message": message})

    def task_dir(self, task_id: str) -> Path:
        return self.config.tasks_dir / task_id

    def task_file(self, task_id: str) -> Path:
        return self.task_dir(task_id) / "task.json"

    def source_copy_path(self, task_id: str, suffix: str) -> Path:
        return self.task_dir(task_id) / "source" / f"original{suffix}"

    def normalized_audio_path(self, task_id: str) -> Path:
        return self.task_dir(task_id) / "working" / "normalized.wav"

    def transcript_path(self, task_id: str) -> Path:
        return self.task_dir(task_id) / "working" / "transcript.json"

    def diarization_path(self, task_id: str) -> Path:
        return self.task_dir(task_id) / "working" / "speaker_segments.json"

    def export_path(self, task_id: str, fmt: str) -> Path:
        return self.task_dir(task_id) / "output" / f"transcript.{fmt}"

    def _make_task_id(self) -> str:
        return datetime_id() + "-" + uuid.uuid4().hex[:8]


def datetime_id() -> str:
    # 时间戳放在前面，目录天然按时间有序，查问题时更直观。
    from datetime import datetime

    return datetime.now().strftime("%Y%m%d-%H%M%S")


def default_task_name() -> str:
    from datetime import datetime

    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def normalize_task_name(task: dict[str, Any]) -> str:
    name = str(task.get("name", "")).strip()
    if name:
        return name
    return task.get("task_id", "未命名任务")
