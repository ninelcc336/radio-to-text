from __future__ import annotations

import shutil
import subprocess
import wave
from pathlib import Path
from typing import Any

import imageio_ffmpeg

from .config import EngineConfig


class AudioProcessor:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config

    def copy_source(self, source_path: str, target_path: Path) -> Path:
        # 保留原始录音副本，后续重跑模型时不需要依赖外部原文件路径。
        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"Source audio not found: {source_path}")
        shutil.copy2(source, target_path)
        return target_path

    def normalize(
        self,
        source_path: Path,
        output_path: Path,
        *,
        base_output_path: Path | None = None,
    ) -> Path:
        # 无论原文件是什么格式，先统一成单声道 16kHz wav；若启用增强，再在此基础上做保守处理。
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        base_path = base_output_path or output_path
        base_path.parent.mkdir(parents=True, exist_ok=True)

        command = [
            ffmpeg_path,
            "-y",
            "-i",
            str(source_path),
            "-ac",
            "1",
            "-ar",
            str(self.config.sample_rate),
            "-vn",
            str(base_path),
        ]
        self._run_ffmpeg(command, "ffmpeg normalization failed")

        if base_path != output_path:
            if not self.config.audio_enhance_enabled:
                shutil.copy2(base_path, output_path)
                return output_path

            filter_chain = self._build_enhancement_filters()
            if not filter_chain:
                shutil.copy2(base_path, output_path)
                return output_path

            enhance_command = [
                ffmpeg_path,
                "-y",
                "-i",
                str(base_path),
                "-ac",
                "1",
                "-ar",
                str(self.config.sample_rate),
                "-af",
                ",".join(filter_chain),
                "-vn",
                str(output_path),
            ]
            self._run_ffmpeg(enhance_command, "ffmpeg enhancement failed")
        return output_path

    def _build_enhancement_filters(self) -> list[str]:
        filters: list[str] = []
        if self.config.loudness_normalization_enabled:
            filters.append(
                "loudnorm="
                f"I={self.config.target_lufs}:TP=-1.5:LRA=11"
            )
        if self.config.silence_trim_enabled:
            # 用 peak 检测并保留一小段前导缓冲，避免把弱起音节一起裁掉。
            filters.append(
                "silenceremove="
                f"start_periods=1:start_duration={self.config.silence_trim_min_duration}:"
                f"start_threshold={self.config.silence_trim_threshold_db}dB:"
                f"start_silence={self.config.silence_trim_keep_duration}:"
                "detection=peak"
            )
        return filters

    def _run_ffmpeg(self, command: list[str], error_message: str) -> None:
        completed = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr.strip() or error_message)

    def read_wav_metadata(self, wav_path: Path) -> dict[str, Any]:
        # 元数据既用于页面展示，也用于后续判断长音频处理表现。
        with wave.open(str(wav_path), "rb") as wav_file:
            frames = wav_file.getnframes()
            sample_rate = wav_file.getframerate()
            duration = frames / float(sample_rate)
            return {
                "duration_seconds": duration,
                "sample_rate": sample_rate,
                "channels": wav_file.getnchannels(),
                "sample_width": wav_file.getsampwidth(),
            }
