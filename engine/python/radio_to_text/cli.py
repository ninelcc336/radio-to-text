from __future__ import annotations

import json
import sys
from dataclasses import asdict
from typing import Any

from .config import load_config
from .models import EngineResponse
from .task_store import TaskStore
from .utils import format_timestamp, utc_now


# 所有动作都返回同一种响应结构，方便前端统一处理。
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
    # CLI 入口本身只做动作分发。轻量操作不要提前加载转写/分人依赖。
    config = load_config()
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
                "root_dir": str(config.root_dir),
                "tasks_dir": str(config.tasks_dir),
                "logs_dir": str(config.logs_dir),
                "model_cache_dir": str(config.model_cache_dir),
                "term_replacements_path": str(config.term_replacements_path),
                "audio_enhance_enabled": config.audio_enhance_enabled,
                "loudness_normalization_enabled": config.loudness_normalization_enabled,
                "target_lufs": config.target_lufs,
                "silence_trim_enabled": config.silence_trim_enabled,
                "silence_trim_min_duration": config.silence_trim_min_duration,
                "silence_trim_keep_duration": config.silence_trim_keep_duration,
                "silence_trim_threshold_db": config.silence_trim_threshold_db,
                "model_name": config.model_name,
                "accuracy_profile": config.accuracy_profile,
                "beam_size": config.beam_size,
                "vad_filter": config.vad_filter,
                "language": config.language,
                "initial_prompt": config.initial_prompt,
                "chunk_seconds": config.chunk_seconds,
                "chunk_overlap_seconds": config.chunk_overlap_seconds,
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
        from .pipeline import ProcessingPipeline

        pipeline = ProcessingPipeline(config)
        task = pipeline.import_audio(payload["sourcePath"])
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "process_task":
        from .pipeline import ProcessingPipeline

        pipeline = ProcessingPipeline(config)
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
        from .pipeline import ProcessingPipeline

        pipeline = ProcessingPipeline(config)
        task = pipeline.export_task(payload["taskId"], payload["format"])
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "update_segment_review":
        from .pipeline import ProcessingPipeline

        pipeline = ProcessingPipeline(config)
        task = pipeline.update_segment_review(
            payload["taskId"],
            int(payload["segmentIndex"]),
            payload["reviewAction"],
            reviewed_text=payload.get("reviewedText"),
        )
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "delete_task":
        task_id = payload["taskId"]
        store.delete_task(task_id)
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"taskId": task_id},
        )

    if action == "rename_task":
        task = store.rename_task(payload["taskId"], payload["name"])
        return build_response(
            ok=True,
            status="completed",
            action=action,
            data={"task": task},
        )

    if action == "create_mock_task":
        # mock 任务只用于骨架联调，不走真实音频处理链路。
        task = store.create_task(payload.get("sourceFile", "mock-meeting.m4a"))
        store.append_log(task, "已创建模拟任务。")
        task["status"] = "completed"
        task["stage"] = "skeleton"
        task["results"]["raw_segments"] = [
            {
                "start": 0.0,
                "end": 4.2,
                "text": "这是阶段一生成的模拟会议片段。",
                "confidence": None,
                "avg_logprob": None,
                "no_speech_prob": None,
                "source_chunk_id": None,
                "needs_review": False,
                "review_reasons": [],
                "review_status": "pending",
                "reviewed_text": None,
                "review_updated_at": None,
            },
            {
                "start": 4.2,
                "end": 8.4,
                "text": "当前目标是验证任务目录和协议是否打通。",
                "confidence": None,
                "avg_logprob": None,
                "no_speech_prob": None,
                "source_chunk_id": None,
                "needs_review": False,
                "review_reasons": [],
                "review_status": "pending",
                "reviewed_text": None,
                "review_updated_at": None,
            },
        ]
        task["results"]["segments"] = list(task["results"]["raw_segments"])
        task["results"]["raw_speaker_segments"] = [
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
        task["results"]["speaker_segments"] = list(task["results"]["raw_speaker_segments"])
        task["results"]["plain_text"] = "\n".join(
            [
                "[00:00:00] 这是阶段一生成的模拟会议片段。",
                "[00:00:04] 当前目标是验证任务目录和协议是否打通。",
            ]
        )
        task["results"]["raw_plain_text"] = task["results"]["plain_text"]
        task["results"]["raw_speaker_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] 说话人 {item['speaker']}：{item['text']}"
            for item in task["results"]["raw_speaker_segments"]
        )
        task["results"]["speaker_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] 说话人 {item['speaker']}：{item['text']}"
            for item in task["results"]["speaker_segments"]
        )
        task["results"]["full_text"] = "\n".join(
            [
                "[00:00:00] 这是阶段一生成的模拟会议片段。",
                "[00:00:04] 当前目标是验证任务目录和协议是否打通。",
            ]
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
        # 未捕获异常统一收敛成协议内错误，避免前端拿到半截输出。
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
