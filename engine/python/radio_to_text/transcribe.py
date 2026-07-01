from __future__ import annotations

from pathlib import Path

from faster_whisper import WhisperModel

from .config import EngineConfig
from .models import TranscriptSegment


class Transcriber:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self._model: WhisperModel | None = None

    @property
    def model(self) -> WhisperModel:
        if self._model is None:
            self._model = WhisperModel(
                self.config.model_name,
                device=self.config.device,
                compute_type=self.config.compute_type,
            )
        return self._model

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        segments, _info = self.model.transcribe(
            str(audio_path),
            vad_filter=True,
            beam_size=5,
            word_timestamps=False,
        )
        results: list[TranscriptSegment] = []
        for segment in segments:
            text = segment.text.strip()
            if not text:
                continue
            results.append(
                TranscriptSegment(
                    start=float(segment.start),
                    end=float(segment.end),
                    text=text,
                )
            )
        if not results:
            raise RuntimeError("No transcript segments were produced")
        return results
