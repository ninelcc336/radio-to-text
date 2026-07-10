from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from radio_to_text.config import load_config
from radio_to_text.task_store import TaskStore


class TaskStoreTests(unittest.TestCase):
    def create_root_dir(self, root_dir: Path) -> None:
        tools_dir = root_dir / "tools"
        tools_dir.mkdir(parents=True, exist_ok=True)
        (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

    def create_store(self, root_dir: Path) -> TaskStore:
        self.create_root_dir(root_dir)
        with patch.dict(
            os.environ,
            {
                "RTT_ROOT_DIR": str(root_dir),
            },
            clear=True,
        ):
            config = load_config()
        return TaskStore(config)

    def test_save_task_replaces_invalid_surrogates(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = self.create_store(Path(temp_dir))
            task = store.create_task("C:/audio/\udca2/sample.wav")

            self.assertEqual(task["source_path"], "C:/audio/?/sample.wav")

            saved_task = store.load_task(task["task_id"])
            self.assertEqual(saved_task["source_path"], "C:/audio/?/sample.wav")

    def test_list_tasks_auto_purges_empty_task_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            store = self.create_store(Path(temp_dir))
            corrupt_dir = store.task_dir("20260710-000000-deadbeef")
            corrupt_dir.mkdir(parents=True, exist_ok=True)
            (corrupt_dir / "task.json").write_text("", encoding="utf-8")

            self.assertEqual(store.list_tasks(), [])
            self.assertFalse(corrupt_dir.exists())


if __name__ == "__main__":
    unittest.main()
