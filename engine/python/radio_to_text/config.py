from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class EngineConfig:
    root_dir: Path
    tasks_dir: Path
    model_name: str
    compute_type: str
    device: str
    sample_rate: int
    max_speakers: int


def load_config() -> EngineConfig:
    root_dir = Path(__file__).resolve().parents[3]
    tasks_dir = root_dir / "tasks"
    return EngineConfig(
        root_dir=root_dir,
        tasks_dir=tasks_dir,
        model_name=os.getenv("RTT_ASR_MODEL", "small"),
        compute_type=os.getenv("RTT_ASR_COMPUTE_TYPE", "int8"),
        device=os.getenv("RTT_ASR_DEVICE", "cpu"),
        sample_rate=int(os.getenv("RTT_SAMPLE_RATE", "16000")),
        max_speakers=int(os.getenv("RTT_MAX_SPEAKERS", "4")),
    )
