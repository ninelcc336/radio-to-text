from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
    def test_load_config_defaults_cache_dirs_under_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            tools_dir = root_dir / "tools"
            tools_dir.mkdir(parents=True, exist_ok=True)
            (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

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

    def test_resolve_model_path_prefers_project_snapshot_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            tools_dir = root_dir / "tools"
            tools_dir.mkdir(parents=True, exist_ok=True)
            (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

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
