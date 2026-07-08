"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { EngineHealthCard } from "@/components/settings/engine-health-card";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card, CardContent } from "@/components/ui/card";
import { Providers } from "../providers";
import { getDesktopApi } from "../../lib/desktop-api";
import {
  bindSettingsStoreApi,
  useSettingsStore
} from "../../stores/settings-store";

function SettingsSidebar() {
  return (
    <Card className="rounded-[1.5rem] border-border/70 bg-background/80">
      <CardContent className="space-y-3 p-4">
        <p className="text-[0.72rem] uppercase tracking-[0.28em] text-muted-foreground">
          Settings Scope
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          Task 5 只接入桌面设置持久化、健康检查和设置状态层，不修改 Python action，也不提前碰 standalone 打包链。
        </p>
      </CardContent>
    </Card>
  );
}

function SettingsPageContent() {
  const apiReady = useSettingsStore((state) => state.apiReady);
  const load = useSettingsStore((state) => state.load);

  useEffect(() => {
    bindSettingsStoreApi(getDesktopApi());
  }, []);

  useEffect(() => {
    if (!apiReady) {
      return;
    }

    void load();
  }, [apiReady, load]);

  return (
    <AppShell
      description="设置页现在可以查看 Python 健康检查结果，并把桌面偏好保存到 Electron 用户目录。"
      eyebrow="Desktop Settings Deck"
      sidebar={<SettingsSidebar />}
      title="设置"
    >
      <div className="grid gap-5">
        <EngineHealthCard />
        <SettingsForm />
      </div>
    </AppShell>
  );
}

export default function SettingsPage() {
  return (
    <Providers>
      <SettingsPageContent />
    </Providers>
  );
}
