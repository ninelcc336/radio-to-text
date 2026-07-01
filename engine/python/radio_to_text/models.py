from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EngineResponse:
    ok: bool
    status: str
    action: str
    data: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] | None = None


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class SpeakerSegment:
    start: float
    end: float
    speaker: str
    text: str
