from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
import re
from typing import Any

from .audio import AudioProcessor
from .config import EngineConfig
from .diarize import SegmentDiarizer
from .exporters import export_json, export_md, export_txt
from .postprocess import TranscriptPostProcessor
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
        self.postprocessor = TranscriptPostProcessor(config)
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
        normalized_base = self.store.normalized_base_audio_path(task_id)
        self.audio.normalize(
            source_copy,
            normalized,
            base_output_path=normalized_base,
        )
        metadata = self.audio.read_wav_metadata(normalized)
        task["metadata"].update(metadata)
        task["metadata"]["audio_enhance_enabled"] = self.config.audio_enhance_enabled
        task["metadata"]["loudness_normalization_enabled"] = (
            self.config.loudness_normalization_enabled
        )
        task["metadata"]["silence_trim_enabled"] = self.config.silence_trim_enabled
        task["artifacts"]["normalized_audio"] = str(normalized)
        task["artifacts"]["normalized_base_audio"] = str(normalized_base)
        self.store.append_log(task, "音频标准化完成。")

        task["stage"] = "transcribing"
        self.store.save_task(task)
        transcription_result = self.transcriber.transcribe(normalized)
        raw_transcript_segments = transcription_result.segments
        cleaned_transcript_segments = self.postprocessor.process_segments(
            raw_transcript_segments
        )
        reviewed_transcript_segments = [
            self._annotate_segment_for_review(segment)
            for segment in cleaned_transcript_segments
        ]
        transcript_payload = [asdict(segment) for segment in reviewed_transcript_segments]
        raw_transcript_payload = [asdict(segment) for segment in raw_transcript_segments]
        raw_chunk_payload = [asdict(chunk) for chunk in transcription_result.raw_chunks]
        self.store.transcript_raw_chunks_path(task_id).write_text(
            json.dumps(raw_chunk_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.store.transcript_path(task_id).write_text(
            json.dumps(transcript_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        task["results"]["raw_chunks"] = raw_chunk_payload
        task["results"]["raw_segments"] = raw_transcript_payload
        task["results"]["segments"] = transcript_payload
        task["results"]["raw_plain_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] {item['text']}"
            for item in raw_transcript_payload
        )
        task["results"]["plain_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] {item['text']}"
            for item in transcript_payload
        )
        task["results"]["full_text"] = task["results"]["plain_text"]
        self.store.append_log(task, f"转写完成，共生成 {len(transcript_payload)} 段。")

        task["stage"] = "diarizing"
        self.store.save_task(task)
        raw_speaker_segments = self.diarizer.diarize(
            normalized, raw_transcript_segments, speaker_count=speaker_count
        )
        cleaned_speaker_segments = self.postprocessor.process_speaker_segments(
            raw_speaker_segments
        )
        raw_speaker_payload = [asdict(segment) for segment in raw_speaker_segments]
        speaker_payload = [asdict(segment) for segment in cleaned_speaker_segments]
        self.store.diarization_path(task_id).write_text(
            json.dumps(speaker_payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        task["results"]["raw_speaker_segments"] = raw_speaker_payload
        task["results"]["speaker_segments"] = speaker_payload
        task["results"]["raw_speaker_text"] = "\n".join(
            f"[{format_timestamp(item['start'])}] 说话人 {item['speaker']}：{item['text']}"
            for item in raw_speaker_payload
        )
        task["results"]["speaker_text"] = "\n".join(
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

    def _annotate_segment_for_review(self, segment):
        reasons: list[str] = []
        confidence = segment.confidence
        no_speech_prob = segment.no_speech_prob
        text = str(segment.text or "")

        if confidence is not None and confidence < 0.78:
            reasons.append("模型置信度偏低")

        if no_speech_prob is not None and no_speech_prob > 0.35:
            reasons.append("静音概率偏高")

        digit_count = sum(char.isdigit() for char in text)
        if digit_count >= 4:
            reasons.append("包含较多数字信息")

        if self._contains_ascii_token(text):
            reasons.append("包含英文或缩写")

        informative_text = re.sub(r"[，。！？；：、\s]", "", text)
        if len(informative_text) <= 6 and (
            digit_count > 0 or self._contains_ascii_token(text)
        ):
            reasons.append("短句但信息密集")

        segment.needs_review = bool(reasons)
        segment.review_reasons = reasons
        return segment

    def _contains_ascii_token(self, text: str) -> bool:
        return bool(re.search(r"[A-Za-z]{2,}", text))

    def export_task(self, task_id: str, fmt: str) -> dict[str, Any]:
        # 导出始终基于 task.json 当前结果，避免页面状态和文件状态不一致。
        task = self.store.load_task(task_id)
        speaker_segments = task["results"].get("speaker_segments", [])
        if not speaker_segments:
            raise RuntimeError("No speaker segments available for export")

        export_path = self.store.export_path(task_id, fmt)
        if fmt == "txt":
            export_txt(export_path, task["results"].get("plain_text", ""))
        elif fmt == "md":
            export_md(export_path, speaker_segments, task_id)
        elif fmt == "json":
            export_json(export_path, task)
        else:
            raise RuntimeError(f"Unsupported export format: {fmt}")

        task["exports"][fmt] = str(export_path)
        self.store.save_task(task)
        return task
