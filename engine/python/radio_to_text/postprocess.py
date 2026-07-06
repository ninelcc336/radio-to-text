from __future__ import annotations

import json
import re
from dataclasses import replace
from pathlib import Path

from .config import EngineConfig
from .models import SpeakerSegment, TranscriptSegment

_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_HAN_SPACE_RE = re.compile(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])")
_SPACE_BEFORE_PUNCT_RE = re.compile(r"\s+([，。！？；：、“”’’,.!?;:])")
_MULTISPACE_RE = re.compile(r"\s+")

_PUNCT_TRANSLATIONS = str.maketrans(
    {
        ",": "，",
        ".": "。",
        "?": "？",
        "!": "！",
        ";": "；",
        ":": "：",
        "(": "（",
        ")": "）",
    }
)


class TranscriptPostProcessor:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self.replacements = self._load_replacements(config.term_replacements_path)

    def process_segments(
        self, segments: list[TranscriptSegment]
    ) -> list[TranscriptSegment]:
        return [replace(segment, text=self._clean_text(segment.text)) for segment in segments]

    def process_speaker_segments(
        self, segments: list[SpeakerSegment]
    ) -> list[SpeakerSegment]:
        return [replace(segment, text=self._clean_text(segment.text)) for segment in segments]

    def _clean_text(self, text: str) -> str:
        cleaned = text.strip()
        if not cleaned:
            return ""

        cleaned = _MULTISPACE_RE.sub(" ", cleaned)
        cleaned = _HAN_SPACE_RE.sub("", cleaned)
        cleaned = _SPACE_BEFORE_PUNCT_RE.sub(r"\1", cleaned)
        cleaned = self._apply_term_replacements(cleaned)
        cleaned = self._normalize_punctuation(cleaned)
        return cleaned.strip()

    def _apply_term_replacements(self, text: str) -> str:
        if not self.replacements:
            return text

        cleaned = text
        for source, target in sorted(
            self.replacements.items(),
            key=lambda item: len(item[0]),
            reverse=True,
        ):
            if not source:
                continue
            cleaned = cleaned.replace(source, target)
        return cleaned

    def _normalize_punctuation(self, text: str) -> str:
        cleaned = text
        if _HAN_RE.search(cleaned):
            cleaned = cleaned.translate(_PUNCT_TRANSLATIONS)

        if cleaned.endswith(("，", "、", ",", ";", "；", ":", "：")):
            cleaned = cleaned[:-1].rstrip()

        if _HAN_RE.search(cleaned) and not cleaned.endswith(
            ("。", "！", "？", "”", "）")
        ):
            cleaned = f"{cleaned}。"
        return cleaned

    def _load_replacements(self, path: Path) -> dict[str, str]:
        if not path.exists():
            return {}

        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise RuntimeError("Term replacements file must be a JSON object")

        replacements: dict[str, str] = {}
        for key, value in payload.items():
            source = str(key).strip()
            target = str(value).strip()
            if not source:
                continue
            replacements[source] = target
        return replacements
