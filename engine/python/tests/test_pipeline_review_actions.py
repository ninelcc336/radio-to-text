from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from radio_to_text.config import EngineConfig
from radio_to_text.pipeline import ProcessingPipeline
from radio_to_text.task_store import TaskStore


class ProcessingPipelineReviewActionsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        root_dir = Path(self.temp_dir.name)
        tasks_dir = root_dir / "tasks"
        logs_dir = root_dir / "logs"
        cache_root_dir = root_dir / "cache"
        model_cache_dir = root_dir / "cache" / "models"
        huggingface_home_dir = cache_root_dir / "huggingface"
        for directory in (
            tasks_dir,
            logs_dir,
            cache_root_dir,
            model_cache_dir,
            huggingface_home_dir,
        ):
            directory.mkdir(parents=True, exist_ok=True)

        self.config = EngineConfig(
            root_dir=root_dir,
            tasks_dir=tasks_dir,
            logs_dir=logs_dir,
            cache_root_dir=cache_root_dir,
            model_cache_dir=model_cache_dir,
            huggingface_home_dir=huggingface_home_dir,
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
        self.pipeline = ProcessingPipeline.__new__(ProcessingPipeline)
        self.pipeline.config = self.config
        self.pipeline.store = TaskStore(self.config)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_delete_single_segment_filters_outputs(self) -> None:
        task = self._create_mock_task()

        updated = self.pipeline.update_segment_review(task["task_id"], 0, "delete")

        self.assertEqual(updated["results"]["segments"][0]["review_status"], "deleted")
        self.assertEqual(len(updated["results"]["segments"]), 2)
        self.assertNotIn("第一段重复内容。", updated["results"]["plain_text"])
        self.assertIn("第二段保留内容。", updated["results"]["plain_text"])
        self.assertNotIn("第一段重复内容。", updated["results"]["speaker_text"])
        self.assertIn("第二段保留内容。", updated["results"]["speaker_text"])
        self.assertEqual(len(updated["results"]["speaker_segments"]), 1)
        self.assertEqual(
            updated["results"]["speaker_segments"][0]["text"],
            "第二段保留内容。",
        )
        self.assertEqual(updated["results"]["raw_segments"][0]["text"], "第一段重复内容。")
        self.assertEqual(
            updated["results"]["raw_speaker_segments"][0]["text"],
            "第一段重复内容。",
        )

    def test_delete_all_segments_still_exports_empty_outputs(self) -> None:
        task = self._create_mock_task()

        self.pipeline.update_segment_review(task["task_id"], 0, "delete")
        updated = self.pipeline.update_segment_review(task["task_id"], 1, "delete")

        self.assertEqual(updated["results"]["plain_text"], "")
        self.assertEqual(updated["results"]["speaker_text"], "")
        self.assertEqual(updated["results"]["speaker_segments"], [])

        for fmt in ("txt", "md", "json"):
            self.pipeline.export_task(task["task_id"], fmt)

        txt_path = Path(updated["exports"]["txt"])
        md_path = Path(updated["exports"]["md"])
        json_path = Path(updated["exports"]["json"])

        self.assertTrue(txt_path.exists())
        self.assertTrue(md_path.exists())
        self.assertTrue(json_path.exists())
        self.assertEqual(txt_path.read_text(encoding="utf-8"), "")
        self.assertEqual(
            md_path.read_text(encoding="utf-8").strip(),
            f"# 语音转写结果 - {task['task_id']}",
        )

        payload = json.loads(json_path.read_text(encoding="utf-8"))
        self.assertEqual(payload["results"]["plain_text"], "")
        self.assertEqual(payload["results"]["speaker_text"], "")
        self.assertEqual(payload["results"]["speaker_segments"], [])
        self.assertEqual(payload["results"]["raw_segments"][0]["text"], "第一段重复内容。")
        self.assertEqual(
            payload["results"]["raw_speaker_segments"][1]["text"],
            "第二段保留内容。",
        )

    def _create_mock_task(self) -> dict:
        task = self.pipeline.store.create_task("mock-meeting.wav")
        task["status"] = "completed"
        task["stage"] = "completed"
        segments = [
            {
                "start": 0.0,
                "end": 1.5,
                "text": "第一段重复内容。",
                "confidence": None,
                "avg_logprob": None,
                "no_speech_prob": None,
                "source_chunk_id": "chunk-0000",
                "needs_review": False,
                "review_reasons": [],
                "review_status": "pending",
                "reviewed_text": None,
                "review_updated_at": None,
            },
            {
                "start": 1.5,
                "end": 3.0,
                "text": "第二段保留内容。",
                "confidence": None,
                "avg_logprob": None,
                "no_speech_prob": None,
                "source_chunk_id": "chunk-0000",
                "needs_review": False,
                "review_reasons": [],
                "review_status": "pending",
                "reviewed_text": None,
                "review_updated_at": None,
            },
        ]
        speaker_segments = [
            {
                "start": 0.0,
                "end": 1.5,
                "speaker": "A",
                "text": "第一段重复内容。",
            },
            {
                "start": 1.5,
                "end": 3.0,
                "speaker": "B",
                "text": "第二段保留内容。",
            },
        ]
        task["results"]["raw_segments"] = [dict(item) for item in segments]
        task["results"]["segments"] = [dict(item) for item in segments]
        task["results"]["raw_speaker_segments"] = [dict(item) for item in speaker_segments]
        task["results"]["speaker_segments"] = [dict(item) for item in speaker_segments]
        task["results"]["raw_plain_text"] = self.pipeline._build_plain_text(
            task["results"]["raw_segments"]
        )
        task["results"]["plain_text"] = self.pipeline._build_plain_text(
            task["results"]["segments"]
        )
        task["results"]["raw_speaker_text"] = self.pipeline._build_speaker_text(
            task["results"]["raw_speaker_segments"]
        )
        task["results"]["speaker_text"] = self.pipeline._build_speaker_text(
            task["results"]["speaker_segments"]
        )
        task["results"]["full_text"] = task["results"]["plain_text"]
        self.pipeline.store.save_task(task)
        return task


if __name__ == "__main__":
    unittest.main()
