from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class EngineConfig:
    root_dir: Path
    tasks_dir: Path
    logs_dir: Path
    cache_root_dir: Path
    model_cache_dir: Path
    huggingface_home_dir: Path
    term_replacements_path: Path
    audio_enhance_enabled: bool
    loudness_normalization_enabled: bool
    target_lufs: float
    silence_trim_enabled: bool
    silence_trim_min_duration: float
    silence_trim_keep_duration: float
    silence_trim_threshold_db: float
    model_name: str
    accuracy_profile: str
    compute_type: str
    device: str
    beam_size: int
    vad_filter: bool
    language: str | None
    initial_prompt: str
    chunk_seconds: float
    chunk_overlap_seconds: float
    sample_rate: int
    max_speakers: int


def resolve_path_env(name: str, default: Path) -> Path:
    value = os.getenv(name)
    if not value:
        return default.resolve()
    return Path(value).expanduser().resolve()


def resolve_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if not value:
        return default
    return int(value)


def resolve_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if not value:
        return default
    return float(value)


def resolve_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"0", "false", "no", "off"}


def resolve_optional_text_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name)
    if value is None:
        return default
    text = value.strip()
    if not text:
        return default
    return text


def default_beam_size(accuracy_profile: str) -> int:
    profile = accuracy_profile.strip().lower()
    if profile in {"fast", "low"}:
        return 2
    if profile in {"accurate", "high"}:
        return 8
    return 5


def load_config() -> EngineConfig:
    root_dir = resolve_path_env("RTT_ROOT_DIR", Path(__file__).resolve().parents[3])
    tasks_dir = resolve_path_env("RTT_TASKS_DIR", root_dir / "tasks")
    logs_dir = resolve_path_env("RTT_LOG_DIR", root_dir / "logs")
    cache_root_dir = resolve_path_env("RTT_CACHE_ROOT_DIR", root_dir / "cache")
    model_cache_dir = resolve_path_env(
        "RTT_MODEL_CACHE_DIR", cache_root_dir / "models"
    )
    huggingface_home_dir = resolve_path_env("HF_HOME", cache_root_dir / "huggingface")
    term_replacements_path = resolve_path_env(
        "RTT_TERM_REPLACEMENTS_PATH", root_dir / "tools" / "term-replacements.json"
    )
    for directory in (
        root_dir,
        tasks_dir,
        logs_dir,
        cache_root_dir,
        model_cache_dir,
        huggingface_home_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    accuracy_profile = os.getenv("RTT_ASR_ACCURACY_PROFILE", "balanced")
    beam_size = resolve_int_env(
        "RTT_ASR_BEAM_SIZE", default_beam_size(accuracy_profile)
    )
    chunk_seconds = max(resolve_float_env("RTT_ASR_CHUNK_SECONDS", 150.0), 30.0)
    chunk_overlap_seconds = resolve_float_env("RTT_ASR_CHUNK_OVERLAP_SECONDS", 12.0)
    chunk_overlap_seconds = min(
        max(chunk_overlap_seconds, 0.0),
        max(chunk_seconds - 1.0, 0.0),
    )

    return EngineConfig(
        root_dir=root_dir,
        tasks_dir=tasks_dir,
        logs_dir=logs_dir,
        cache_root_dir=cache_root_dir,
        model_cache_dir=model_cache_dir,
        huggingface_home_dir=huggingface_home_dir,
        term_replacements_path=term_replacements_path,
        audio_enhance_enabled=resolve_bool_env("RTT_AUDIO_ENHANCE_ENABLED", False),
        loudness_normalization_enabled=resolve_bool_env(
            "RTT_AUDIO_LOUDNESS_NORMALIZATION_ENABLED", True
        ),
        target_lufs=resolve_float_env("RTT_AUDIO_TARGET_LUFS", -16.0),
        silence_trim_enabled=resolve_bool_env("RTT_AUDIO_SILENCE_TRIM_ENABLED", False),
        silence_trim_min_duration=max(
            resolve_float_env("RTT_AUDIO_SILENCE_TRIM_MIN_DURATION", 0.1),
            0.05,
        ),
        silence_trim_keep_duration=max(
            resolve_float_env("RTT_AUDIO_SILENCE_TRIM_KEEP_DURATION", 0.12),
            0.0,
        ),
        silence_trim_threshold_db=resolve_float_env(
            "RTT_AUDIO_SILENCE_TRIM_THRESHOLD_DB", -50.0
        ),
        model_name=os.getenv("RTT_ASR_MODEL", "small"),
        accuracy_profile=accuracy_profile,
        compute_type=os.getenv("RTT_ASR_COMPUTE_TYPE", "int8"),
        device=os.getenv("RTT_ASR_DEVICE", "cpu"),
        beam_size=max(1, beam_size),
        vad_filter=resolve_bool_env("RTT_ASR_VAD_FILTER", True),
        language=resolve_optional_text_env("RTT_ASR_LANGUAGE", "zh"),
        initial_prompt=resolve_optional_text_env("RTT_ASR_INITIAL_PROMPT", "") or "",
        chunk_seconds=chunk_seconds,
        chunk_overlap_seconds=chunk_overlap_seconds,
        sample_rate=resolve_int_env("RTT_SAMPLE_RATE", 16000),
        max_speakers=resolve_int_env("RTT_MAX_SPEAKERS", 4),
    )
