from __future__ import annotations

import math
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import numpy as np
import soundfile as sf

from faster_whisper import WhisperModel

from .config import EngineConfig
from .models import TranscriptChunk, TranscriptSegment, TranscriptionResult


class Transcriber:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self._model: WhisperModel | None = None

    @property
    def model(self) -> WhisperModel:
        if self._model is None:
            # 模型懒加载，避免仅查看任务列表时也触发大模型初始化。
            model_path = self._resolve_model_path()
            self._model = WhisperModel(
                str(model_path),
                device=self.config.device,
                compute_type=self.config.compute_type,
            )
        return self._model

    def _resolve_model_path(self) -> Path:
        configured = Path(self.config.model_name).expanduser()
        if configured.exists():
            return self._validate_model_dir(configured)

        repo_id = self._repo_id_for_model(self.config.model_name)
        snapshot_dir = self._try_resolve_snapshot_dir(repo_id)
        if snapshot_dir is not None:
            return snapshot_dir

        managed_dir = (
            self.config.model_cache_dir
            / "managed"
            / repo_id.replace("/", "--")
        )
        self._ensure_model_files(repo_id, managed_dir)
        return self._validate_model_dir(managed_dir)

    def _try_resolve_snapshot_dir(self, repo_id: str) -> Path | None:
        repo_cache_dir = self.config.model_cache_dir / f"models--{repo_id.replace('/', '--')}"
        snapshots_dir = repo_cache_dir / "snapshots"
        if not snapshots_dir.exists():
            return None

        for snapshot_dir in sorted(snapshots_dir.iterdir(), reverse=True):
            if not snapshot_dir.is_dir():
                continue
            if (snapshot_dir / "model.bin").exists():
                return self._validate_model_dir(snapshot_dir)
        return None

    def _ensure_model_files(self, repo_id: str, model_dir: Path) -> None:
        model_dir.mkdir(parents=True, exist_ok=True)
        required_files = [
            "config.json",
            "tokenizer.json",
            "vocabulary.txt",
            "model.bin",
        ]
        for filename in required_files:
            target_path = model_dir / filename
            if target_path.exists():
                continue
            self._download_repo_file(repo_id, filename, target_path)

    def _download_repo_file(self, repo_id: str, filename: str, target_path: Path) -> None:
        url = f"https://huggingface.co/{repo_id}/resolve/main/{filename}"
        temp_path = target_path.with_suffix(target_path.suffix + ".partial")
        temp_path.unlink(missing_ok=True)
        try:
            if sys.platform.startswith("win") and filename == "model.bin":
                self._download_with_powershell(url, temp_path)
            else:
                self._download_with_urllib(url, temp_path)
        except RuntimeError:
            temp_path.unlink(missing_ok=True)
            raise
        temp_path.replace(target_path)

    def _download_with_urllib(self, url: str, temp_path: Path) -> None:
        request = Request(
            url,
            headers={
                "User-Agent": "radio-to-text/0.1.0",
            },
        )
        try:
            with urlopen(request, timeout=60) as response, temp_path.open("wb") as output:
                shutil.copyfileobj(response, output, length=1024 * 1024)
        except (HTTPError, URLError, TimeoutError) as error:
            raise RuntimeError(f"Failed to download {url}: {error}") from error

    def _download_with_powershell(self, url: str, temp_path: Path) -> None:
        command = [
            "powershell",
            "-NoProfile",
            "-Command",
            "Invoke-WebRequest -UseBasicParsing -Uri $args[0] -OutFile $args[1]",
            url,
            str(temp_path),
        ]
        completed = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="ignore",
            check=False,
        )
        if completed.returncode != 0:
            message = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
            raise RuntimeError(f"Failed to download {url}: {message}")

    def _validate_model_dir(self, model_dir: Path) -> Path:
        required_files = ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"]
        missing_files = [name for name in required_files if not (model_dir / name).exists()]
        if missing_files:
            joined = ", ".join(missing_files)
            raise RuntimeError(f"Model directory missing required files: {joined}")
        return model_dir

    def _repo_id_for_model(self, model_name: str) -> str:
        normalized = model_name.strip()
        if "/" in normalized:
            return normalized
        return f"Systran/faster-whisper-{normalized}"

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        # 长音频先切成重叠窗口分别转写，再做统一拼接，避免一次性整段推理不稳定。
        audio, sample_rate = sf.read(str(audio_path), dtype="float32", always_2d=False)
        if isinstance(audio, np.ndarray) and audio.ndim > 1:
            audio = audio.mean(axis=1)
        audio = np.asarray(audio, dtype=np.float32)
        if audio.size == 0:
            raise RuntimeError("Normalized audio is empty")

        raw_chunks: list[TranscriptChunk] = []
        all_segments: list[TranscriptSegment] = []
        with TemporaryDirectory(prefix="rtt-transcribe-") as temp_dir:
            chunk_ranges = self._build_chunk_ranges(len(audio), sample_rate)
            for index, (start_frame, end_frame) in enumerate(chunk_ranges):
                chunk_audio = audio[start_frame:end_frame]
                if chunk_audio.size == 0:
                    continue

                chunk_id = f"chunk-{index:04d}"
                chunk_path = Path(temp_dir) / f"{chunk_id}.wav"
                sf.write(str(chunk_path), chunk_audio, sample_rate, subtype="PCM_16")

                chunk_start = start_frame / float(sample_rate)
                chunk_end = end_frame / float(sample_rate)
                chunk_segments = self._transcribe_chunk(
                    chunk_path, chunk_id, chunk_start
                )
                raw_chunks.append(
                    TranscriptChunk(
                        chunk_id=chunk_id,
                        start=chunk_start,
                        end=chunk_end,
                        segment_count=len(chunk_segments),
                        segments=chunk_segments,
                    )
                )
                all_segments.extend(chunk_segments)

        merged_segments = self._merge_segments(all_segments)
        if not merged_segments:
            raise RuntimeError("No transcript segments were produced")
        return TranscriptionResult(segments=merged_segments, raw_chunks=raw_chunks)

    def _build_chunk_ranges(
        self, sample_count: int, sample_rate: int
    ) -> list[tuple[int, int]]:
        chunk_frames = max(int(self.config.chunk_seconds * sample_rate), sample_rate)
        overlap_frames = int(self.config.chunk_overlap_seconds * sample_rate)
        step_frames = max(chunk_frames - overlap_frames, sample_rate)

        ranges: list[tuple[int, int]] = []
        start_frame = 0
        while start_frame < sample_count:
            end_frame = min(start_frame + chunk_frames, sample_count)
            ranges.append((start_frame, end_frame))
            if end_frame >= sample_count:
                break
            start_frame += step_frames
        return ranges

    def _transcribe_chunk(
        self, chunk_path: Path, chunk_id: str, chunk_offset_seconds: float
    ) -> list[TranscriptSegment]:
        options: dict[str, object] = {
            "vad_filter": self.config.vad_filter,
            "beam_size": self.config.beam_size,
            "word_timestamps": False,
        }
        if self.config.language:
            options["language"] = self.config.language
        if self.config.initial_prompt:
            options["initial_prompt"] = self.config.initial_prompt

        segments, _info = self.model.transcribe(str(chunk_path), **options)
        results: list[TranscriptSegment] = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue

            avg_logprob = self._to_optional_float(getattr(segment, "avg_logprob", None))
            no_speech_prob = self._to_optional_float(
                getattr(segment, "no_speech_prob", None)
            )
            results.append(
                TranscriptSegment(
                    start=chunk_offset_seconds + float(segment.start),
                    end=chunk_offset_seconds + float(segment.end),
                    text=text,
                    confidence=self._estimate_confidence(avg_logprob, no_speech_prob),
                    avg_logprob=avg_logprob,
                    no_speech_prob=no_speech_prob,
                    source_chunk_id=chunk_id,
                )
            )
        return results

    def _merge_segments(
        self, segments: list[TranscriptSegment]
    ) -> list[TranscriptSegment]:
        ordered = sorted(segments, key=lambda item: (item.start, item.end, item.text))
        merged: list[TranscriptSegment] = []
        for segment in ordered:
            text = segment.text.strip()
            if not text:
                continue

            current = TranscriptSegment(
                start=segment.start,
                end=segment.end,
                text=text,
                confidence=segment.confidence,
                avg_logprob=segment.avg_logprob,
                no_speech_prob=segment.no_speech_prob,
                source_chunk_id=segment.source_chunk_id,
            )
            if not merged:
                merged.append(current)
                continue

            previous = merged[-1]
            if self._is_duplicate(previous, current):
                merged[-1] = self._prefer_segment(previous, current)
                continue

            if self._should_merge_adjacent(previous, current):
                previous.end = max(previous.end, current.end)
                previous.text = f"{previous.text} {current.text}".strip()
                previous.confidence = self._merge_optional_max(
                    previous.confidence, current.confidence
                )
                previous.avg_logprob = self._merge_optional_max(
                    previous.avg_logprob, current.avg_logprob
                )
                previous.no_speech_prob = self._merge_optional_min(
                    previous.no_speech_prob, current.no_speech_prob
                )
                continue

            merged.append(current)
        return merged

    def _is_duplicate(
        self, previous: TranscriptSegment, current: TranscriptSegment
    ) -> bool:
        previous_text = self._normalize_text(previous.text)
        current_text = self._normalize_text(current.text)
        if not previous_text or not current_text:
            return False

        start_delta = abs(previous.start - current.start)
        overlap_guard = max(self.config.chunk_overlap_seconds + 1.0, 2.0)
        if previous_text == current_text and start_delta <= overlap_guard:
            return True
        if (
            start_delta <= 1.5
            and (previous_text in current_text or current_text in previous_text)
        ):
            return True
        return False

    def _prefer_segment(
        self, previous: TranscriptSegment, current: TranscriptSegment
    ) -> TranscriptSegment:
        preferred = previous
        if len(current.text) > len(previous.text):
            preferred = current
        elif len(current.text) == len(previous.text):
            preferred_confidence = current.confidence or -1.0
            previous_confidence = previous.confidence or -1.0
            if preferred_confidence > previous_confidence:
                preferred = current

        preferred.start = min(previous.start, current.start)
        preferred.end = max(previous.end, current.end)
        preferred.confidence = self._merge_optional_max(
            previous.confidence, current.confidence
        )
        preferred.avg_logprob = self._merge_optional_max(
            previous.avg_logprob, current.avg_logprob
        )
        preferred.no_speech_prob = self._merge_optional_min(
            previous.no_speech_prob, current.no_speech_prob
        )
        return preferred

    def _should_merge_adjacent(
        self, previous: TranscriptSegment, current: TranscriptSegment
    ) -> bool:
        gap = current.start - previous.end
        if gap < 0 or gap > 0.45:
            return False
        if previous.text.endswith(("。", "！", "？", "；", ".", "!", "?", ";")):
            return False
        return len(previous.text) + len(current.text) <= 60

    def _normalize_text(self, text: str) -> str:
        return "".join(text.split()).strip("，。！？；,.!?;：:")

    def _estimate_confidence(
        self, avg_logprob: float | None, no_speech_prob: float | None
    ) -> float | None:
        if avg_logprob is None and no_speech_prob is None:
            return None

        logprob_score = (
            max(0.0, min(math.exp(avg_logprob), 1.0))
            if avg_logprob is not None
            else 0.5
        )
        speech_score = (
            1.0 - max(0.0, min(no_speech_prob, 1.0))
            if no_speech_prob is not None
            else 0.5
        )
        return max(0.0, min((logprob_score * 0.7) + (speech_score * 0.3), 1.0))

    def _merge_optional_max(
        self, left: float | None, right: float | None
    ) -> float | None:
        if left is None:
            return right
        if right is None:
            return left
        return max(left, right)

    def _merge_optional_min(
        self, left: float | None, right: float | None
    ) -> float | None:
        if left is None:
            return right
        if right is None:
            return left
        return min(left, right)

    def _to_optional_float(self, value: object) -> float | None:
        if value is None:
            return None
        return float(value)
