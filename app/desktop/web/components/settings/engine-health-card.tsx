"use client";

import { Activity, FolderCog, RefreshCcw, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { useSettingsStore } from "@/stores/settings-store";

function StatusBadge({ ok }: { ok: boolean }) {
  return (
    <Badge
      className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.22em]"
      variant={ok ? "secondary" : "destructive"}
    >
      {ok ? "ENGINE READY" : "ENGINE ERROR"}
    </Badge>
  );
}

function HealthField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.15rem] border border-border/70 bg-background/70 p-4">
      <p className="text-[0.68rem] uppercase tracking-[0.28em] text-muted-foreground">{label}</p>
      <p className="mt-3 break-all text-sm leading-6 text-foreground">{value || "未返回"}</p>
    </div>
  );
}

export function EngineHealthCard() {
  const health = useSettingsStore((state) => state.health);
  const error = useSettingsStore((state) => state.error);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const isRefreshingHealth = useSettingsStore((state) => state.isRefreshingHealth);
  const refreshHealth = useSettingsStore((state) => state.refreshHealth);

  return (
    <Card className="rounded-[1.8rem] border-border/70 bg-white/80">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
              Runtime Health
            </p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              Python 引擎与本地目录状态
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
              这里展示的是当前 Python 引擎实际返回的运行参数和目录，不依赖前端缓存。
            </CardDescription>
          </div>

          <div className="flex items-center gap-3">
            <StatusBadge ok={health?.ok ?? !error} />
            <Button
              className="rounded-full"
              disabled={isRefreshingHealth}
              onClick={() => void refreshHealth()}
              variant="outline"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {isRefreshingHealth ? "刷新中" : "刷新健康检查"}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-[1.2rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!health && isLoading ? (
          <div className="rounded-[1.2rem] border border-dashed border-border/80 bg-background/70 px-5 py-8 text-sm text-muted-foreground">
            正在读取引擎健康状态。
          </div>
        ) : null}

        {health ? (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ServerCog className="h-4 w-4" />
                  运行引擎
                </div>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  {health.engine} {health.version || ""}
                </p>
              </div>

              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  Python 版本
                </div>
                <p className="mt-3 text-lg font-semibold text-foreground">{health.pythonVersion || "未返回"}</p>
              </div>

              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FolderCog className="h-4 w-4" />
                  当前模型
                </div>
                <p className="mt-3 text-lg font-semibold text-foreground">{health.modelName || "未返回"}</p>
              </div>

              <div className="rounded-[1.2rem] border border-border/70 bg-background/70 p-4">
                <p className="text-sm text-muted-foreground">语言 / Profile</p>
                <p className="mt-3 text-lg font-semibold text-foreground">
                  {health.language || "auto"} / {health.accuracyProfile || "default"}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <HealthField label="Root Dir" value={health.rootDir} />
              <HealthField label="Tasks Dir" value={health.tasksDir} />
              <HealthField label="Logs Dir" value={health.logsDir} />
              <HealthField label="Cache Root" value={health.cacheRootDir} />
              <HealthField label="Model Cache" value={health.modelCacheDir} />
              <HealthField label="HF Home" value={health.huggingfaceHomeDir} />
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              <HealthField label="Chunk Seconds" value={health.chunkSeconds || "未返回"} />
              <HealthField
                label="Audio Enhance"
                value={health.audioEnhanceEnabled ? "已启用" : "未启用"}
              />
              <HealthField
                label="Loudness Normalize"
                value={health.loudnessNormalizationEnabled ? "已启用" : "未启用"}
              />
              <HealthField
                label="Silence Trim"
                value={health.silenceTrimEnabled ? "已启用" : "未启用"}
              />
            </div>

            <div className="rounded-[1.2rem] border border-dashed border-border/80 bg-background/65 px-4 py-3 text-xs leading-6 text-muted-foreground">
              最近健康检查时间：{health.timestamp || "未返回"}。当前 Task 5 只把设置保存在 Electron
              侧 JSON 文件中，还没有把这些设置自动注入 Python 运行环境。
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
