from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path
import re
from typing import TYPE_CHECKING, Any

from .audio import AudioProcessor
from .config import EngineConfig
from .exporters import export_json, export_md, export_txt
from .task_store import TaskStore
from .utils import format_timestamp, utc_now

if TYPE_CHECKING:
    from .diarize import SegmentDiarizer
    from .postprocess import TranscriptPostProcessor
    from .transcribe import Transcriber


class ProcessingPipeline:
    def __init__(self, config: EngineConfig) -> None:
        # pipeline 串起“导入 -> 预处理 -> 转写 -> 分人 -> 导出”整个主链路。
        self.config = config
        self.store = TaskStore(config)
        self.audio = AudioProcessor(config)
        self._transcriber: Transcriber | None = None
        self._postprocessor: TranscriptPostProcessor | None = None
        self._diarizer: SegmentDiarizer | None = None

    @property
    def transcriber(self) -> "Transcriber":
        if self._transcriber is None:
            from .transcribe import Transcriber

            self._transcriber = Transcriber(self.config)
        return self._transcriber

    @property
    def postprocessor(self) -> "TranscriptPostProcessor":
        if self._postprocessor is None:
            from .postprocess import TranscriptPostProcessor

            self._postprocessor = TranscriptPostProcessor(self.config)
        return self._postprocessor

    @property
    def diarizer(self) -> "SegmentDiarizer":
        if self._diarizer is None:
            from .diarize import SegmentDiarizer

            self._diarizer = SegmentDiarizer(self.config)
        return self._diarizer

    def import_audio(
        self,
        source_path: str,
        *,
        original_source_path: str | None = None,
        original_file_name: str | None = None,
    ) -> dict[str, Any]:
        # 导入阶段只做建任务和复制原始文件，不做重计算。
        display_source_path = original_source_path or source_path
        source_name = (original_file_name or "").strip() or Path(display_source_path).name
        source_suffix = Path(source_name).suffix.lower() or Path(source_path).suffix.lower()

        task = self.store.create_task(display_source_path)
        source_copy = self.store.source_copy_path(task["task_id"], source_suffix)
        self.audio.copy_source(source_path, source_copy)
        task["stage"] = "imported"
        task["status"] = "ready"
        task["metadata"]["source_name"] = source_name
        task["metadata"]["source_path"] = display_source_path
        task["metadata"]["original_file_name"] = source_name
        task["metadata"]["original_extension"] = source_suffix
        task["metadata"]["import_source_path"] = source_path
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
        task["results"]["raw_plain_text"] = self._build_plain_text(raw_transcript_payload)
        self._rebuild_transcript_outputs(task)
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
        task["results"]["raw_speaker_text"] = self._build_speaker_text(raw_speaker_payload)
        self._rebuild_transcript_outputs(task)
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

    def update_segment_review(
        self,
        task_id: str,
        segment_index: int,
        review_action: str,
        reviewed_text: str | None = None,
    ) -> dict[str, Any]:
        task = self.store.load_task(task_id)
        segments = [dict(item) for item in task["results"].get("segments", [])]
        current_speaker_segments = [
            dict(item) for item in task["results"].get("speaker_segments", [])
        ]
        raw_speaker_segments = [
            dict(item) for item in task["results"].get("raw_speaker_segments", [])
        ]
        if not segments:
            raise RuntimeError("No transcript segments available for review")
        if segment_index < 0 or segment_index >= len(segments):
            raise IndexError(f"Segment index out of range: {segment_index}")

        for segment in segments:
            self._ensure_review_defaults(segment)

        segment = segments[segment_index]
        action = str(review_action or "").strip().lower()
        updated_at = utc_now()

        if action == "confirm":
            segment["review_status"] = "confirmed"
            segment["review_updated_at"] = updated_at
        elif action == "correct":
            next_text = str(reviewed_text or "").strip()
            if not next_text:
                raise ValueError("Reviewed text must not be empty")
            segment["text"] = next_text
            segment["review_status"] = "corrected"
            segment["reviewed_text"] = next_text
            segment["review_updated_at"] = updated_at
        elif action == "delete":
            segment["review_status"] = "deleted"
            segment["review_updated_at"] = updated_at
        else:
            raise RuntimeError(f"Unsupported review action: {review_action}")

        base_speaker_segments = raw_speaker_segments or current_speaker_segments
        task["results"]["segments"] = segments
        if any(self._is_deleted_segment(item) for item in segments):
            task["results"]["speaker_segments"] = self._build_visible_speaker_segments(
                segments,
                base_speaker_segments,
            )
        else:
            task["results"]["speaker_segments"] = self._sync_speaker_segment_texts(
                segments,
                base_speaker_segments,
            )
        self._rebuild_transcript_outputs(task)
        self._write_working_results(task_id, task)

        segment_start = format_timestamp(segment["start"])
        if action == "confirm":
            self.store.append_log(task, f"已确认片段 {segment_start}。")
        elif action == "delete":
            self.store.append_log(task, f"已删除片段 {segment_start}。")
        else:
            self.store.append_log(task, f"已修正片段 {segment_start}。")

        self.store.save_task(task)
        for fmt in ("txt", "md", "json"):
            self.export_task(task_id, fmt)
        return self.store.load_task(task_id)

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

    def _ensure_review_defaults(self, segment: dict[str, Any]) -> None:
        segment.setdefault("review_status", "pending")
        segment.setdefault("reviewed_text", None)
        segment.setdefault("review_updated_at", None)

    def _is_deleted_segment(self, segment: dict[str, Any]) -> bool:
        return str(segment.get("review_status", "")).strip().lower() == "deleted"

    def _visible_transcript_segments(
        self, segments: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        return [dict(item) for item in segments if not self._is_deleted_segment(item)]

    def _build_plain_text(self, segments: list[dict[str, Any]]) -> str:
        return "\n".join(
            f"[{format_timestamp(item['start'])}] {item['text']}" for item in segments
        )

    def _build_speaker_text(self, speaker_segments: list[dict[str, Any]]) -> str:
        return "\n".join(
            f"[{format_timestamp(item['start'])}] 说话人 {item['speaker']}：{item['text']}"
            for item in speaker_segments
        )

    def _rebuild_transcript_outputs(self, task: dict[str, Any]) -> None:
        segments = [dict(item) for item in task["results"].get("segments", [])]
        speaker_segments = [
            dict(item) for item in task["results"].get("speaker_segments", [])
        ]
        for segment in segments:
            self._ensure_review_defaults(segment)
        visible_segments = self._visible_transcript_segments(segments)
        task["results"]["segments"] = segments
        task["results"]["speaker_segments"] = speaker_segments
        task["results"]["plain_text"] = self._build_plain_text(visible_segments)
        task["results"]["speaker_text"] = self._build_speaker_text(speaker_segments)
        task["results"]["full_text"] = task["results"]["plain_text"]

    def _write_working_results(self, task_id: str, task: dict[str, Any]) -> None:
        self.store.transcript_path(task_id).write_text(
            json.dumps(task["results"].get("segments", []), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        self.store.diarization_path(task_id).write_text(
            json.dumps(
                task["results"].get("speaker_segments", []),
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

    def _sync_speaker_segment_texts(
        self,
        transcript_segments: list[dict[str, Any]],
        speaker_segments: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        synced = [dict(item) for item in speaker_segments]
        used_indexes: set[int] = set()
        for segment_index, transcript_segment in enumerate(transcript_segments):
            match_index = self._match_speaker_segment_index(
                transcript_segment, synced, segment_index, used_indexes
            )
            if match_index is None:
                continue
            synced[match_index]["text"] = transcript_segment["text"]
            used_indexes.add(match_index)
        return synced

    def _build_visible_speaker_segments(
        self,
        transcript_segments: list[dict[str, Any]],
        speaker_segments: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        visible_speaker_segments: list[dict[str, Any]] = []
        used_indexes: set[int] = set()
        for segment_index, transcript_segment in enumerate(transcript_segments):
            match_index = self._match_speaker_segment_index(
                transcript_segment,
                speaker_segments,
                segment_index,
                used_indexes,
            )
            speaker = ""
            if match_index is not None:
                speaker = str(speaker_segments[match_index].get("speaker", "")).strip()
                used_indexes.add(match_index)
            if self._is_deleted_segment(transcript_segment):
                continue
            visible_speaker_segments.append(
                {
                    "start": transcript_segment["start"],
                    "end": transcript_segment["end"],
                    "speaker": speaker,
                    "text": transcript_segment["text"],
                }
            )
        return visible_speaker_segments

    def _match_speaker_segment_index(
        self,
        transcript_segment: dict[str, Any],
        speaker_segments: list[dict[str, Any]],
        preferred_index: int,
        used_indexes: set[int],
    ) -> int | None:
        if preferred_index < len(speaker_segments):
            preferred = speaker_segments[preferred_index]
            if (
                abs(float(preferred.get("start", 0.0)) - float(transcript_segment["start"]))
                < 0.35
                and abs(float(preferred.get("end", 0.0)) - float(transcript_segment["end"]))
                < 0.35
            ):
                return preferred_index

        best_index: int | None = None
        best_score: float | None = None
        for index, speaker_segment in enumerate(speaker_segments):
            if index in used_indexes:
                continue
            score = abs(
                float(speaker_segment.get("start", 0.0))
                - float(transcript_segment["start"])
            ) + abs(
                float(speaker_segment.get("end", 0.0))
                - float(transcript_segment["end"])
            )
            if best_score is None or score < best_score:
                best_score = score
                best_index = index
        return best_index

    def export_task(self, task_id: str, fmt: str) -> dict[str, Any]:
        # 导出始终基于 task.json 当前结果，避免页面状态和文件状态不一致。
        task = self.store.load_task(task_id)
        speaker_segments = task["results"].get("speaker_segments", [])

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
