"use client";

import { useEffect, useRef } from "react";
import AudioPlayer, { RHAP_UI } from "react-h5-audio-player";
import { Pause, Play, Rewind, FastForward, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlayerStore } from "@/stores/player-store";
import { useTaskDetailStore } from "@/stores/task-detail-store";

type AudioPlayerPanelProps = {
  taskId: string;
};

export function AudioPlayerPanel({ taskId }: AudioPlayerPanelProps) {
  const playerRef = useRef<AudioPlayer | null>(null);
  const task = useTaskDetailStore((state) => state.task);
  const apiReady = usePlayerStore((state) => state.apiReady);
  const audio = usePlayerStore((state) => state.audio);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const activeSegmentIndex = usePlayerStore((state) => state.activeSegmentIndex);
  const seekTargetTime = usePlayerStore((state) => state.seekTargetTime);
  const seekRequestToken = usePlayerStore((state) => state.seekRequestToken);
  const error = usePlayerStore((state) => state.error);
  const loadAudio = usePlayerStore((state) => state.loadAudio);
  const syncPlayback = usePlayerStore((state) => state.syncPlayback);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setError = usePlayerStore((state) => state.setError);
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

  useEffect(() => {
    if (!seekRequestToken) {
      return;
    }

    const audioElement = playerRef.current?.audio.current;
    if (!audioElement) {
      return;
    }

    const nextTime = Math.min(
      seekTargetTime ?? 0,
      Number.isFinite(audioElement.duration) && audioElement.duration > 0 ? audioElement.duration : Number.POSITIVE_INFINITY
    );

    audioElement.currentTime = nextTime;
    syncPlayback(nextTime, segments);
  }, [seekRequestToken, seekTargetTime, segments, syncPlayback]);

  return (
    <Card className="flex flex-col rounded-[1.6rem] border-border/70 bg-white/75">
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

      <CardContent className="flex flex-col gap-5">
        <div className="rounded-[1.3rem] border border-border/70 bg-background/65 p-4">
          {audio?.available && audio.url ? (
            <AudioPlayer
              autoPlayAfterSrcChange={false}
              className="rtt-audio-player"
              customControlsSection={[RHAP_UI.MAIN_CONTROLS]}
              customIcons={{
                play: <Play className="h-5 w-5" />,
                pause: <Pause className="h-5 w-5" />,
                rewind: <Rewind className="h-5 w-5" />,
                forward: <FastForward className="h-5 w-5" />
              }}
              customProgressBarSection={[
                RHAP_UI.CURRENT_TIME,
                RHAP_UI.PROGRESS_BAR,
                RHAP_UI.DURATION
              ]}
              customVolumeControls={[]}
              defaultCurrentTime="00:00"
              defaultDuration="00:00"
              hasDefaultKeyBindings
              key={audio.url}
              listenInterval={200}
              onEnded={() => {
                setPlaying(false);
                syncPlayback(duration, segments);
              }}
              onError={() => {
                setError("音频加载失败，请重新处理任务后再试。");
              }}
              onListen={(event) => {
                const audioElement = event.target as HTMLAudioElement;
                syncPlayback(audioElement.currentTime, segments);
              }}
              onLoadedMetaData={(event) => {
                const audioElement = event.target as HTMLAudioElement;
                setDuration(audioElement.duration);
                syncPlayback(audioElement.currentTime, segments);
              }}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onPlayError={() => {
                setError("音频播放失败，请重新处理任务后再试。");
              }}
              onSeeked={(event) => {
                const audioElement = event.target as HTMLAudioElement;
                syncPlayback(audioElement.currentTime, segments);
              }}
              preload="metadata"
              progressJumpSteps={{ backward: 5000, forward: 5000 }}
              ref={playerRef}
              showDownloadProgress={false}
              showFilledProgress
              showFilledVolume={false}
              showJumpControls
              src={audio.url}
            />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              {error || "当前任务还没有解析到可播放音频。"}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
