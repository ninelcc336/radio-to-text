from __future__ import annotations

import tempfile
import types
import unittest
from pathlib import Path

import numpy as np
import sys

if "soundfile" not in sys.modules:
    soundfile_stub = types.ModuleType("soundfile")
    soundfile_stub.read = lambda *args, **kwargs: (_ for _ in ()).throw(NotImplementedError)
    sys.modules["soundfile"] = soundfile_stub

from radio_to_text.config import EngineConfig
from radio_to_text.diarize import SegmentDiarizer

HAS_NUMPY_RUNTIME = all(
    hasattr(np, attribute) for attribute in ("array", "linalg", "unique")
)


def build_config(root_dir: Path) -> EngineConfig:
    return EngineConfig(
        root_dir=root_dir,
        tasks_dir=root_dir / "tasks",
        logs_dir=root_dir / "logs",
        cache_root_dir=root_dir / "cache",
        model_cache_dir=root_dir / "cache" / "models",
        huggingface_home_dir=root_dir / "cache" / "huggingface",
        term_replacements_path=root_dir / "tools" / "term-replacements.json",
        audio_enhance_enabled=False,
        loudness_normalization_enabled=True,
        target_lufs=-16.0,
        silence_trim_enabled=False,
        silence_trim_min_duration=0.1,
        silence_trim_keep_duration=0.12,
        silence_trim_threshold_db=-50.0,
        model_name="small",
        accuracy_profile="balanced",
        compute_type="int8",
        device="cpu",
        beam_size=5,
        vad_filter=True,
        language="zh",
        initial_prompt="",
        chunk_seconds=150.0,
        chunk_overlap_seconds=12.0,
        sample_rate=16000,
        max_speakers=4,
    )


@unittest.skipUnless(HAS_NUMPY_RUNTIME, "requires numpy runtime")
class SegmentDiarizerTests(unittest.TestCase):
    def test_cluster_groups_obvious_two_speaker_features(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            diarizer = SegmentDiarizer(build_config(Path(temp_dir)))
            features = np.array(
                [
                    [0.0, 0.1],
                    [0.2, -0.1],
                    [4.9, 5.1],
                    [5.2, 4.8],
                ],
                dtype=np.float32,
            )

            labels = diarizer._cluster(features, speaker_count=2)

            self.assertEqual(len(set(labels.tolist())), 2)
            self.assertEqual(int(labels[0]), int(labels[1]))
            self.assertEqual(int(labels[2]), int(labels[3]))
            self.assertNotEqual(int(labels[0]), int(labels[2]))

    def test_estimate_speaker_count_selects_three_clusters(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            diarizer = SegmentDiarizer(build_config(Path(temp_dir)))
            features = np.array(
                [
                    [-4.0, -4.2],
                    [-3.7, -3.8],
                    [0.0, 0.2],
                    [0.2, -0.1],
                    [4.3, 4.1],
                    [4.7, 4.4],
                ],
                dtype=np.float32,
            )

            scaled = diarizer._scale_features(features)
            speaker_count = diarizer._estimate_speaker_count(scaled)

            self.assertEqual(speaker_count, 3)


if __name__ == "__main__":
    unittest.main()
