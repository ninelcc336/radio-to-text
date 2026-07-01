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
        source = Path(source_path)
        if not source.exists():
            raise FileNotFoundError(f"Source audio not found: {source_path}")
        shutil.copy2(source, target_path)
        return target_path

    def normalize(self, source_path: Path, output_path: Path) -> Path:
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
        output_path.parent.mkdir(parents=True, exist_ok=True)
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
            str(output_path),
        ]
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
            raise RuntimeError(completed.stderr.strip() or "ffmpeg normalization failed")
        return output_path

    def read_wav_metadata(self, wav_path: Path) -> dict[str, Any]:
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
