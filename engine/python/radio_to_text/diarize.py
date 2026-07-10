from __future__ import annotations

from pathlib import Path

import numpy as np
import soundfile as sf

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
        if not transcript_segments:
            return []
        audio, sample_rate = sf.read(str(audio_path), dtype="float32", always_2d=False)
        if isinstance(audio, np.ndarray) and audio.ndim > 1:
            audio = audio.mean(axis=1)
        audio = np.asarray(audio, dtype=np.float32)

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

        window = np.hanning(len(chunk))
        spectrum = np.abs(np.fft.rfft(chunk * window)).astype(np.float32)
        power = np.maximum(spectrum * spectrum, 1e-10)
        freqs = np.fft.rfftfreq(len(chunk), d=1.0 / float(sample_rate))
        total_power = float(power.sum())

        spectral_centroid = float(np.sum(freqs * power) / total_power)
        spectral_spread = float(
            np.sqrt(np.sum(((freqs - spectral_centroid) ** 2) * power) / total_power)
        )
        cumulative_power = np.cumsum(power)
        rolloff_index = int(np.searchsorted(cumulative_power, total_power * 0.85))
        rolloff_index = min(max(rolloff_index, 0), len(freqs) - 1)
        spectral_rolloff = float(freqs[rolloff_index])

        low_band = self._band_energy_ratio(power, freqs, 0.0, 500.0, total_power)
        mid_band = self._band_energy_ratio(power, freqs, 500.0, 2000.0, total_power)
        high_band = self._band_energy_ratio(power, freqs, 2000.0, 8000.0, total_power)

        rms = float(np.sqrt(np.mean(chunk * chunk)))
        mean_abs = float(np.mean(np.abs(chunk)))
        amplitude_std = float(np.std(chunk))
        zero_crossing_rate = float(np.mean(chunk[:-1] * chunk[1:] < 0))
        diff_energy = float(np.mean(np.abs(np.diff(chunk))))
        feature = np.array(
            [
                rms,
                mean_abs,
                amplitude_std,
                zero_crossing_rate,
                diff_energy,
                spectral_centroid,
                spectral_spread,
                spectral_rolloff,
                low_band,
                mid_band,
                high_band,
            ],
            dtype=np.float32,
        )
        return feature

    def _band_energy_ratio(
        self,
        power: np.ndarray,
        freqs: np.ndarray,
        min_freq: float,
        max_freq: float,
        total_power: float,
    ) -> float:
        mask = (freqs >= min_freq) & (freqs < max_freq)
        if not np.any(mask):
            return 0.0
        return float(power[mask].sum() / max(total_power, 1e-10))

    def _cluster(
        self, features: np.ndarray, speaker_count: int | None = None
    ) -> np.ndarray:
        if len(features) == 1:
            return np.array([0])

        # 先标准化特征，避免量纲不同导致聚类偏向某一类特征。
        scaled = self._scale_features(features)
        distinct_count = self._distinct_feature_count(scaled)
        if distinct_count <= 1:
            return np.zeros(len(features), dtype=int)

        if speaker_count is None:
            speaker_count = self._estimate_speaker_count(scaled)

        speaker_count = max(1, min(int(speaker_count), len(features), distinct_count))
        if speaker_count == 1:
            return np.zeros(len(features), dtype=int)

        return self._fit_kmeans(scaled, speaker_count)

    def _estimate_speaker_count(self, features: np.ndarray) -> int:
        # 用 silhouette score 在合理范围内选一个说话人数，避免让用户手填。
        sample_count = len(features)
        distinct_count = self._distinct_feature_count(features)
        if distinct_count <= 1:
            return 1
        upper = min(self.config.max_speakers, max(sample_count - 1, 1))
        upper = min(upper, distinct_count)
        if sample_count <= 2:
            return min(sample_count, distinct_count)
        if upper <= 2:
            return max(1, upper)

        best_score = -1.0
        best_k = 2
        distance_matrix = self._pairwise_distance_matrix(features)
        for k in range(2, upper + 1):
            labels = self._fit_kmeans(features, k)
            if len(set(labels)) == 1:
                continue
            _cluster_ids, counts = np.unique(labels, return_counts=True)
            if np.any(counts < 2):
                continue
            score = self._silhouette_score(distance_matrix, labels)
            if score > best_score:
                best_score = score
                best_k = k
        return best_k

    def _scale_features(self, features: np.ndarray) -> np.ndarray:
        means = features.mean(axis=0)
        stds = features.std(axis=0)
        safe_stds = np.where(stds < 1e-6, 1.0, stds)
        return (features - means) / safe_stds

    def _distinct_feature_count(self, features: np.ndarray) -> int:
        rounded = np.round(features, decimals=6)
        return int(len(np.unique(rounded, axis=0)))

    def _fit_kmeans(self, features: np.ndarray, cluster_count: int) -> np.ndarray:
        centers = self._select_initial_centers(features, cluster_count)
        labels = np.full(len(features), -1, dtype=int)
        for _ in range(32):
            distances = self._squared_distance_matrix(features, centers)
            next_labels = np.argmin(distances, axis=1).astype(int)
            next_centers = centers.copy()
            for index in range(cluster_count):
                cluster_points = features[next_labels == index]
                if len(cluster_points) == 0:
                    continue
                next_centers[index] = cluster_points.mean(axis=0)

            if np.array_equal(next_labels, labels) and np.allclose(next_centers, centers):
                labels = next_labels
                centers = next_centers
                break

            labels = next_labels
            centers = next_centers

        if np.any(labels < 0):
            distances = self._squared_distance_matrix(features, centers)
            labels = np.argmin(distances, axis=1).astype(int)
        return labels

    def _select_initial_centers(
        self, features: np.ndarray, cluster_count: int
    ) -> np.ndarray:
        center_indexes: list[int] = []
        global_center = features.mean(axis=0)
        first_index = int(
            np.argmax(np.linalg.norm(features - global_center, axis=1))
        )
        center_indexes.append(first_index)

        min_distances = self._squared_distance_matrix(
            features, features[[first_index]]
        ).reshape(-1)
        while len(center_indexes) < cluster_count:
            next_index = int(np.argmax(min_distances))
            if next_index in center_indexes:
                break
            center_indexes.append(next_index)
            next_distances = self._squared_distance_matrix(
                features, features[[next_index]]
            ).reshape(-1)
            min_distances = np.minimum(min_distances, next_distances)

        return features[np.array(center_indexes)]

    def _squared_distance_matrix(
        self, left: np.ndarray, right: np.ndarray
    ) -> np.ndarray:
        diffs = left[:, np.newaxis, :] - right[np.newaxis, :, :]
        return np.sum(diffs * diffs, axis=2)

    def _pairwise_distance_matrix(self, features: np.ndarray) -> np.ndarray:
        return np.sqrt(self._squared_distance_matrix(features, features))

    def _silhouette_score(
        self, distance_matrix: np.ndarray, labels: np.ndarray
    ) -> float:
        cluster_ids = np.unique(labels)
        if len(cluster_ids) <= 1:
            return -1.0

        scores: list[float] = []
        for index, label in enumerate(labels):
            same_mask = labels == label
            same_mask[index] = False

            intra_cluster = 0.0
            if np.any(same_mask):
                intra_cluster = float(distance_matrix[index, same_mask].mean())

            nearest_other_cluster = None
            for candidate in cluster_ids:
                if candidate == label:
                    continue
                candidate_mask = labels == candidate
                if not np.any(candidate_mask):
                    continue
                candidate_distance = float(distance_matrix[index, candidate_mask].mean())
                if (
                    nearest_other_cluster is None
                    or candidate_distance < nearest_other_cluster
                ):
                    nearest_other_cluster = candidate_distance

            if nearest_other_cluster is None:
                continue

            denominator = max(intra_cluster, nearest_other_cluster)
            if denominator <= 1e-6:
                scores.append(0.0)
                continue

            scores.append((nearest_other_cluster - intra_cluster) / denominator)

        if not scores:
            return -1.0
        return float(np.mean(scores))

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
