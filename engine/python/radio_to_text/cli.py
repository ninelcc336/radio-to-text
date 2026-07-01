from __future__ import annotations

import json
import sys
from dataclasses import asdict
from typing import Any

from .config import load_config
from .models import EngineResponse
from .pipeline import ProcessingPipeline
from .task_store import TaskStore
from .utils import utc_now


def build_response(
    *,
    ok: bool,
    status: str,
    action: str,
    data: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> EngineResponse:
    return EngineResponse(
        ok=ok,
        status=status,
        action=action,
        data=data or {},
        error=error,
    )


def read_request() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {"action": "health", "payload": {}}
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ValueError("Request must be a JSON object")
    return request


def handle_request(request: dict[str, Any]) -> EngineResponse:
    config = load_config()
    pipeline = ProcessingPipeline(config)
    store = TaskStore(config)

    action = request.get("action", "health")
    payload = request.get("payload", {})

    if action == "health":
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={
                "engine": "python",
                "version": "0.2.0",
                "python_version": sys.version.split()[0],
                "tasks_dir": str(config.tasks_dir),
                "model_name": config.model_name,
                "sample_rate": config.sample_rate,
                "timestamp": utc_now(),
            },
        )

    if action == "list_tasks":
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"tasks": store.list_tasks()},
        )

    if action == "get_task":
        task_id = payload["taskId"]
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": store.load_task(task_id)},
        )

    if action == "import_audio":
        task = pipeline.import_audio(payload["sourcePath"])
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "process_task":
        task = pipeline.process_task(
            payload["taskId"], speaker_count=payload.get("speakerCount")
        )
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "export_task":
        task = pipeline.export_task(payload["taskId"], payload["format"])
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "create_mock_task":
        task = store.create_task(payload.get("sourceFile", "mock-meeting.m4a"))
        store.append_log(task, "已创建模拟任务。")
        task["status"] = "completed"
        task["stage"] = "skeleton"
        task["results"]["speaker_segments"] = [
            {
                "start": 0.0,
                "end": 4.2,
                "speaker": "A",
                "text": "这是阶段一生成的模拟会议片段。",
            },
            {
                "start": 4.2,
                "end": 8.4,
                "speaker": "B",
                "text": "当前目标是验证任务目录和协议是否打通。",
            },
        ]
        task["results"]["full_text"] = "\n".join(
            f"[{item['start']:.2f}] 说话人 {item['speaker']}：{item['text']}"
            for item in task["results"]["speaker_segments"]
        )
        store.save_task(task)
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    return build_response(
        ok=False,
        status="failed",
        action=action,
        error={
            "code": "UNSUPPORTED_ACTION",
            "message": f"Unsupported action: {action}",
        },
    )


def main() -> int:
    try:
        request = read_request()
        response = handle_request(request)
    except Exception as exc:
        response = build_response(
            ok=False,
            status="failed",
            action="unknown",
            error={
                "code": "ENGINE_ERROR",
                "message": str(exc),
            },
        )

    sys.stdout.write(json.dumps(asdict(response), ensure_ascii=False))
    return 0 if response.ok else 1
