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
    confidence: float | None = None
    avg_logprob: float | None = None
    no_speech_prob: float | None = None
    source_chunk_id: str | None = None
    needs_review: bool = False
    review_reasons: list[str] = field(default_factory=list)


@dataclass
class TranscriptChunk:
    chunk_id: str
    start: float
    end: float
    segment_count: int
    segments: list[TranscriptSegment] = field(default_factory=list)


@dataclass
class TranscriptionResult:
    segments: list[TranscriptSegment] = field(default_factory=list)
    raw_chunks: list[TranscriptChunk] = field(default_factory=list)


@dataclass
class SpeakerSegment:
    start: float
    end: float
    speaker: str
    text: str
