from __future__ import annotations

from pathlib import Path

import librosa
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from .config import EngineConfig
from .models import SpeakerSegment, TranscriptSegment


class SegmentDiarizer:
    def __init__(self, config: EngineConfig) -> None:
        self.config = config

    def diarize(
        self,
        audio_path: Path,
        transcript_segments: list[TranscriptSegment],
        speaker_count: int | None = None,
    ) -> list[SpeakerSegment]:
        # 第一版先按转写分段提特征并聚类，做到完全本地可用闭环。
        audio, sample_rate = librosa.load(
            str(audio_path), sr=self.config.sample_rate, mono=True
        )
        if not transcript_segments:
            return []

        features = np.vstack(
            [
                self._segment_features(audio, sample_rate, segment.start, segment.end)
                for segment in transcript_segments
            ]
        )

        labels = self._cluster(features, speaker_count)
        speaker_segments: list[SpeakerSegment] = []
        for segment, label in zip(transcript_segments, labels):
            speaker_segments.append(
                SpeakerSegment(
                    start=segment.start,
                    end=segment.end,
                    speaker=self._speaker_name(int(label)),
                    text=segment.text,
                )
            )
        return self._merge_adjacent(speaker_segments)

    def _segment_features(
        self, audio: np.ndarray, sample_rate: int, start: float, end: float
    ) -> np.ndarray:
        # 用较轻量的声学特征描述每段声音，供后面的聚类估算说话人。
        start_idx = max(int(start * sample_rate), 0)
        end_idx = min(int(end * sample_rate), len(audio))
        chunk = audio[start_idx:end_idx]
        if len(chunk) < sample_rate // 2:
            pad = np.zeros(sample_rate // 2, dtype=np.float32)
            pad[: len(chunk)] = chunk
            chunk = pad

        mfcc = librosa.feature.mfcc(y=chunk, sr=sample_rate, n_mfcc=13)
        delta = librosa.feature.delta(mfcc)
        spectral = librosa.feature.spectral_centroid(y=chunk, sr=sample_rate)
        rms = librosa.feature.rms(y=chunk)
        feature = np.concatenate(
            [
                mfcc.mean(axis=1),
                mfcc.std(axis=1),
                delta.mean(axis=1),
                delta.std(axis=1),
                spectral.mean(axis=1),
                spectral.std(axis=1),
                rms.mean(axis=1),
                rms.std(axis=1),
            ]
        )
        return feature

    def _cluster(
        self, features: np.ndarray, speaker_count: int | None = None
    ) -> np.ndarray:
        if len(features) == 1:
            return np.array([0])

        # 先标准化特征，避免量纲不同导致聚类偏向某一类特征。
        scaled = StandardScaler().fit_transform(features)
        if speaker_count is None:
            speaker_count = self._estimate_speaker_count(scaled)

        speaker_count = max(1, min(int(speaker_count), len(features)))
        if speaker_count == 1:
            return np.zeros(len(features), dtype=int)

        clustering = AgglomerativeClustering(n_clusters=speaker_count)
        return clustering.fit_predict(scaled)

    def _estimate_speaker_count(self, features: np.ndarray) -> int:
        # 用 silhouette score 在合理范围内选一个说话人数，避免让用户手填。
        sample_count = len(features)
        upper = min(self.config.max_speakers, max(sample_count - 1, 1))
        if sample_count <= 2:
            return sample_count
        if upper <= 2:
            return 2

        best_score = -1.0
        best_k = 2
        for k in range(2, upper + 1):
            labels = AgglomerativeClustering(n_clusters=k).fit_predict(features)
            if len(set(labels)) == 1:
                continue
            score = silhouette_score(features, labels)
            if score > best_score:
                best_score = score
                best_k = k
        return best_k

    def _speaker_name(self, label: int) -> str:
        return chr(ord("A") + label)

    def _merge_adjacent(
        self, segments: list[SpeakerSegment]
    ) -> list[SpeakerSegment]:
        # 相邻同一说话人的片段直接合并，最终文本会更接近真实会议纪要。
        if not segments:
            return []
        merged = [segments[0]]
        for current in segments[1:]:
            previous = merged[-1]
            if previous.speaker == current.speaker:
                previous.end = current.end
                previous.text = f"{previous.text} {current.text}".strip()
                continue
            merged.append(current)
        return merged
