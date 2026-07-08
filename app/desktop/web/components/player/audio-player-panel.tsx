"use client";

import { useEffect, useRef } from "react";
import { Pause, Play, Rewind, FastForward, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/components/ui/utils";
import { usePlayerStore } from "@/stores/player-store";
import { useTaskDetailStore } from "@/stores/task-detail-store";

type AudioPlayerPanelProps = {
  taskId: string;
};

function formatClock(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AudioPlayerPanel({ taskId }: AudioPlayerPanelProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const task = useTaskDetailStore((state) => state.task);
  const apiReady = usePlayerStore((state) => state.apiReady);
  const audio = usePlayerStore((state) => state.audio);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const activeSegmentIndex = usePlayerStore((state) => state.activeSegmentIndex);
  const error = usePlayerStore((state) => state.error);
  const loadAudio = usePlayerStore((state) => state.loadAudio);
  const syncPlayback = usePlayerStore((state) => state.syncPlayback);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const reset = usePlayerStore((state) => state.reset);

  const segments = Array.isArray(task?.results?.segments) ? task.results.segments : [];
  const activeSegment = activeSegmentIndex >= 0 ? segments[activeSegmentIndex] : null;
  const sourcePath =
    typeof task?.artifacts?.source_copy === "string"
      ? task.artifacts.source_copy
      : typeof task?.source_path === "string"
        ? task.source_path
        : undefined;

  useEffect(() => {
    if (!apiReady || !task) {
      return;
    }

    void loadAudio(taskId, sourcePath);
  }, [apiReady, loadAudio, sourcePath, task, taskId]);

  useEffect(() => reset, [reset]);

  function seekBy(offsetSeconds: number) {
    if (!audioRef.current) {
      return;
    }

    const nextTime = Math.max(audioRef.current.currentTime + offsetSeconds, 0);
    audioRef.current.currentTime = nextTime;
    syncPlayback(nextTime, segments);
  }

  function togglePlayback() {
    if (!audioRef.current || !audio?.available) {
      return;
    }

    if (audioRef.current.paused) {
      void audioRef.current.play();
      return;
    }

    audioRef.current.pause();
  }

  return (
    <Card className="rounded-[1.6rem] border-border/70 bg-white/75">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">Player</p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              音频播放
            </CardTitle>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs tracking-[0.18em] text-muted-foreground">
            <Volume2 className="h-4 w-4" />
            {audio?.available ? "音频已就绪" : isLoading ? "加载中" : "待解析"}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="rounded-[1.3rem] border border-border/70 bg-background/65 p-4">
          {audio?.available && audio.url ? (
            <audio
              className="w-full"
              controls
              key={audio.url}
              onEnded={() => setPlaying(false)}
              onLoadedMetadata={(event) => {
                setDuration(event.currentTarget.duration);
              }}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onTimeUpdate={(event) => {
                syncPlayback(event.currentTarget.currentTime, segments);
              }}
              ref={audioRef}
              src={audio.url}
            />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {error || "当前任务还没有解析到可播放音频。"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button className="rounded-full" disabled={!audio?.available} onClick={() => seekBy(-5)} size="icon" variant="outline">
              <Rewind className="h-4 w-4" />
            </Button>
            <Button className="rounded-full px-5" disabled={!audio?.available} onClick={togglePlayback}>
              {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isPlaying ? "暂停" : "播放"}
            </Button>
            <Button className="rounded-full" disabled={!audio?.available} onClick={() => seekBy(5)} size="icon" variant="outline">
              <FastForward className="h-4 w-4" />
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {formatClock(currentTime)} / {formatClock(duration)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
