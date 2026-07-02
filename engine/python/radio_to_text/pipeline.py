from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
from typing import Any

from .audio import AudioProcessor
from .config import EngineConfig
from .diarize import SegmentDiarizer
from .exporters import export_json, export_md, export_txt
from .task_store import TaskStore
from .transcribe import Transcriber
from .utils import format_timestamp


class ProcessingPipeline:
    def __init__(self, config: EngineConfig) -> None:
        # pipeline 串起“导入 -> 预处理 -> 转写 -> 分人 -> 导出”整个主链路。
        self.config = config
        self.store = TaskStore(config)
        self.audio = AudioProcessor(config)
        self.transcriber = Transcriber(config)
        self.diarizer = SegmentDiarizer(config)

    def import_audio(self, source_path: str) -> dict[str, Any]:
        # 导入阶段只做建任务和复制原始文件，不做重计算。
        task = self.store.create_task(source_path)
        source = Path(source_path)
        source_copy = self.store.source_copy_path(task["task_id"], source.suffix.lower())
        self.audio.copy_source(source_path, source_copy)
        task["stage"] = "imported"
        task["status"] = "ready"
        task["metadata"]["original_file_name"] = source.name
        task["metadata"]["original_extension"] = source.suffix.lower()
        task["artifacts"]["source_copy"] = str(source_copy)
        self.store.append_log(task, "音频文件已导入任务目录。")
        self.store.save_task(task)
        return task

    def process_task(
        self, task_id: str, speaker_count: int | None = None
    ) -> dict[str, Any]:
        # 从这里开始才进入真实处理流程，状态会持续写回 task.json。
        task = self.store.load_task(task_id)
        task["status"] = "processing"
        task["stage"] = "preprocessing"
        self.store.append_log(task, "开始标准化音频。")
        self.store.save_task(task)

        source_copy = Path(task["artifacts"]["source_copy"])
        normalized = self.store.normalized_audio_path(task_id)
        self.audio.normalize(source_copy, normalized)
        metadata = self.audio.read_wav_metadata(normalized)
        task["metadata"].update(metadata)
        task["artifacts"]["normalized_audio"] = str(normalized)
        self.store.append_log(task, "音频标准化完成。")

        task["stage"] = "transcribing"
        self.store.save_task(task)
        transcript_segments = self.transcriber.transcribe(normalized)
        transcript_payload = [asdict(segment) for segment in transcript_segments]
        self.store.transcript_path(task_id).write_text(
            json.dumps(transcript_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        task["results"]["segments"] = transcript_payload
        self.store.append_log(task, f"转写完成，共生成 {len(transcript_payload)} 段。")

        task["stage"] = "diarizing"
        self.store.save_task(task)
        speaker_segments = self.diarizer.diarize(
            normalized, transcript_segments, speaker_count=speaker_count
        )
        speaker_payload = [asdict(segment) for segment in speaker_segments]
        self.store.diarization_path(task_id).write_text(
            json.dumps(speaker_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        task["results"]["speaker_segments"] = speaker_payload
        task["results"]["full_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] 说话人 {item['speaker']}：{item['text']}"
            for item in speaker_payload
        )
        task["metadata"]["speaker_count"] = len(
            sorted({item["speaker"] for item in speaker_payload})
        )
        self.store.append_log(task, "说话人分段完成。")

        task["stage"] = "exporting"
        self.store.save_task(task)
        self.export_task(task_id, "txt")
        self.export_task(task_id, "md")
        self.export_task(task_id, "json")

        task = self.store.load_task(task_id)
        task["status"] = "completed"
        task["stage"] = "completed"
        self.store.append_log(task, "任务处理完成。")
        self.store.save_task(task)
        return task

    def export_task(self, task_id: str, fmt: str) -> dict[str, Any]:
        # 导出始终基于 task.json 当前结果，避免页面状态和文件状态不一致。
        task = self.store.load_task(task_id)
        speaker_segments = task["results"].get("speaker_segments", [])
        if not speaker_segments:
            raise RuntimeError("No speaker segments available for export")

        export_path = self.store.export_path(task_id, fmt)
        if fmt == "txt":
            export_txt(export_path, self._speaker_segments(speaker_segments))
        elif fmt == "md":
            export_md(export_path, self._speaker_segments(speaker_segments), task_id)
        elif fmt == "json":
            export_json(export_path, task)
        else:
            raise RuntimeError(f"Unsupported export format: {fmt}")

        task["exports"][fmt] = str(export_path)
        self.store.save_task(task)
        return task

    def _speaker_segments(self, payload: list[dict[str, Any]]):
        from .models import SpeakerSegment

        return [SpeakerSegment(**item) for item in payload]
