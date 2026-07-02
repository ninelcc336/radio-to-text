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
            # 模型懒加载，避免仅查看任务列表时也触发大模型初始化。
            self._model = WhisperModel(
                self.config.model_name,
                device=self.config.device,
                compute_type=self.config.compute_type,
            )
        return self._model

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        # 这里先拿到“说了什么”和时间轴，暂时不在这一层处理“谁说的”。
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
