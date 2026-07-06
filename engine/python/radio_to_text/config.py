from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class EngineConfig:
    root_dir: Path
    tasks_dir: Path
    logs_dir: Path
    model_cache_dir: Path
    model_name: str
    compute_type: str
    device: str
    sample_rate: int
    max_speakers: int


def resolve_path_env(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default.resolve()
    return Path(value).expanduser().resolve()


def load_config() -> EngineConfig:
    root_dir = resolve_path_env("RTT_ROOT_DIR", Path(__file__).resolve().parents[3])
    tasks_dir = resolve_path_env("RTT_TASKS_DIR", root_dir / "tasks")
    logs_dir = resolve_path_env("RTT_LOG_DIR", root_dir / "logs")
    model_cache_dir = resolve_path_env(
        "RTT_MODEL_CACHE_DIR", root_dir / "cache" / "models"
    )
    for directory in (root_dir, tasks_dir, logs_dir, model_cache_dir):
        directory.mkdir(parents=True, exist_ok=True)

    return EngineConfig(
        root_dir=root_dir,
        tasks_dir=tasks_dir,
        logs_dir=logs_dir,
        model_cache_dir=model_cache_dir,
        model_name=os.getenv("RTT_ASR_MODEL", "small"),
        compute_type=os.getenv("RTT_ASR_COMPUTE_TYPE", "int8"),
        device=os.getenv("RTT_ASR_DEVICE", "cpu"),
        sample_rate=int(os.getenv("RTT_SAMPLE_RATE", "16000")),
        max_speakers=int(os.getenv("RTT_MAX_SPEAKERS", "4")),
    )
