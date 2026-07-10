from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from radio_to_text.cli import build_response, read_request, write_response


class CliTransportTests(unittest.TestCase):
    def test_read_request_prefers_utf8_file_transport(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            request_path = Path(temp_dir) / "request.json"
            request_path.write_text(
                json.dumps(
                    {
                        "action": "import_audio",
                        "payload": {
                            "originalSourcePath": "C:/Users/Administrator/Desktop/音频素材/录音机-20260702-1559.m4a",
                            "originalFileName": "录音机-20260702-1559.m4a",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            with patch.dict(
                os.environ,
                {"RTT_ENGINE_REQUEST_FILE": str(request_path)},
                clear=False,
            ):
                request = read_request()

            self.assertEqual(
                request["payload"]["originalSourcePath"],
                "C:/Users/Administrator/Desktop/音频素材/录音机-20260702-1559.m4a",
            )
            self.assertEqual(
                request["payload"]["originalFileName"],
                "录音机-20260702-1559.m4a",
            )

    def test_write_response_uses_utf8_file_transport(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            response_path = Path(temp_dir) / "response.json"
            response = build_response(
                ok=True,
                status="completed",
                action="get_task",
                data={
                    "task": {
                        "metadata": {
                            "original_file_name": "录音机-20260702-1559.m4a"
                        },
                        "results": {
                            "segments": [
                                {
                                    "text": "好时间到了我们准时开始。"
                                }
                            ]
                        },
                    }
                },
            )

            with patch.dict(
                os.environ,
                {"RTT_ENGINE_RESPONSE_FILE": str(response_path)},
                clear=False,
            ):
                write_response(response)

            payload = json.loads(response_path.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["data"]["task"]["metadata"]["original_file_name"],
                "录音机-20260702-1559.m4a",
            )
            self.assertEqual(
                payload["data"]["task"]["results"]["segments"][0]["text"],
                "好时间到了我们准时开始。",
            )


if __name__ == "__main__":
    unittest.main()
