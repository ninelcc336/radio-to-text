from __future__ import annotations

import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

if "numpy" not in sys.modules:
    numpy_stub = types.ModuleType("numpy")
    numpy_stub.ndarray = object
    numpy_stub.float32 = float
    numpy_stub.asarray = lambda value, dtype=None: value
    numpy_stub.exp = lambda value: value
    sys.modules["numpy"] = numpy_stub

if "soundfile" not in sys.modules:
    soundfile_stub = types.ModuleType("soundfile")
    soundfile_stub.read = lambda *args, **kwargs: (_ for _ in ()).throw(NotImplementedError)
    soundfile_stub.write = lambda *args, **kwargs: (_ for _ in ()).throw(NotImplementedError)
    sys.modules["soundfile"] = soundfile_stub

if "faster_whisper" not in sys.modules:
    faster_whisper_stub = types.ModuleType("faster_whisper")

    class WhisperModel:  # pragma: no cover - only used to satisfy imports
        def __init__(self, *args, **kwargs) -> None:
            self.args = args
            self.kwargs = kwargs

    faster_whisper_stub.WhisperModel = WhisperModel
    sys.modules["faster_whisper"] = faster_whisper_stub

from radio_to_text.config import load_config
from radio_to_text.transcribe import Transcriber


def write_model_snapshot(snapshot_dir: Path) -> None:
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    (snapshot_dir / "config.json").write_text("{}", encoding="utf-8")
    (snapshot_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
    (snapshot_dir / "vocabulary.txt").write_text("token", encoding="utf-8")
    (snapshot_dir / "model.bin").write_bytes(b"model")


def normalize_path(target: Path) -> str:
    return os.path.normcase(str(target.resolve()))


class ModelCachePathTests(unittest.TestCase):
    def create_root_dir(self, root_dir: Path) -> None:
        tools_dir = root_dir / "tools"
        tools_dir.mkdir(parents=True, exist_ok=True)
        (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

    def test_load_config_defaults_cache_dirs_under_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            self.create_root_dir(root_dir)

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                },
                clear=True,
            ):
                config = load_config()

            self.assertEqual(
                normalize_path(config.cache_root_dir),
                normalize_path(root_dir / "cache"),
            )
            self.assertEqual(
                normalize_path(config.model_cache_dir),
                normalize_path(root_dir / "cache" / "models"),
            )
            self.assertEqual(
                normalize_path(config.huggingface_home_dir),
                normalize_path(root_dir / "cache" / "huggingface"),
            )

    def test_load_config_reads_bundled_model_env(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            self.create_root_dir(root_dir)
            bundled_model_dir = root_dir / "resources" / "models" / "small"

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                    "RTT_ASR_MODEL_DIR": str(bundled_model_dir),
                    "RTT_REQUIRE_BUNDLED_MODEL": "1",
                    "RTT_DISTRIBUTION_VARIANT": "offline-small",
                },
                clear=True,
            ):
                config = load_config()

            self.assertEqual(
                normalize_path(config.bundled_model_dir),
                normalize_path(bundled_model_dir),
            )
            self.assertTrue(config.bundled_model_required)
            self.assertEqual(config.distribution_variant, "offline-small")

    def test_resolve_model_path_prefers_bundled_model_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            self.create_root_dir(root_dir)

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                },
                clear=True,
            ):
                config = load_config()

            bundled_model_dir = root_dir / "resources" / "models" / "small"
            write_model_snapshot(bundled_model_dir)
            snapshot_dir = (
                config.model_cache_dir
                / "models--Systran--faster-whisper-small"
                / "snapshots"
                / "test-rev"
            )
            write_model_snapshot(snapshot_dir)

            config = type(config)(
                **{
                    **config.__dict__,
                    "bundled_model_dir": bundled_model_dir,
                    "bundled_model_required": True,
                    "distribution_variant": "offline-small",
                }
            )
            transcriber = Transcriber(config)
            self.assertEqual(
                normalize_path(transcriber._resolve_model_path()),
                normalize_path(bundled_model_dir),
            )

    def test_resolve_model_path_raises_when_required_bundled_model_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            self.create_root_dir(root_dir)

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                    "RTT_ASR_MODEL_DIR": str(root_dir / "resources" / "models" / "small"),
                    "RTT_REQUIRE_BUNDLED_MODEL": "1",
                    "RTT_DISTRIBUTION_VARIANT": "offline-small",
                },
                clear=True,
            ):
                config = load_config()

            snapshot_dir = (
                config.model_cache_dir
                / "models--Systran--faster-whisper-small"
                / "snapshots"
                / "test-rev"
            )
            write_model_snapshot(snapshot_dir)

            transcriber = Transcriber(config)
            with self.assertRaisesRegex(
                RuntimeError,
                "Bundled model is required for distribution 'offline-small'",
            ):
                transcriber._resolve_model_path()

    def test_resolve_model_path_prefers_project_snapshot_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            self.create_root_dir(root_dir)

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                },
                clear=True,
            ):
                config = load_config()

            snapshot_dir = (
                config.model_cache_dir
                / "models--Systran--faster-whisper-small"
                / "snapshots"
                / "test-rev"
            )
            write_model_snapshot(snapshot_dir)

            transcriber = Transcriber(config)
            self.assertEqual(
                normalize_path(transcriber._resolve_model_path()),
                normalize_path(snapshot_dir),
            )


if __name__ == "__main__":
    unittest.main()
