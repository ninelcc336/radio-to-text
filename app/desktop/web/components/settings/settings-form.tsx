"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettingsStore, type AppSettings } from "@/stores/settings-store";

function createDraft(settings: AppSettings | null): AppSettings {
  return {
    language: settings?.language || "zh",
    modelName: settings?.modelName || "small",
    exportFormat: settings?.exportFormat || "txt"
  };
}

function Field({
  label,
  hint,
  value,
  onChange
}: {
  label: string;
  hint: string;
  value: string;
  onChange(nextValue: string): void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs leading-5 text-muted-foreground">{hint}</span>
      <Input
        className="h-11 rounded-2xl border-border/70 bg-white/80"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

export function SettingsForm() {
  const settings = useSettingsStore((state) => state.settings);
  const isLoading = useSettingsStore((state) => state.isLoading);
  const isSaving = useSettingsStore((state) => state.isSaving);
  const error = useSettingsStore((state) => state.error);
  const save = useSettingsStore((state) => state.save);
  const [draft, setDraft] = useState<AppSettings>(() => createDraft(settings));

  useEffect(() => {
    setDraft(createDraft(settings));
  }, [settings]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(draft);
  }

  return (
    <Card className="rounded-[1.8rem] border-border/70 bg-white/80">
      <CardHeader className="space-y-4 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.3em] text-muted-foreground">
              Local Preferences
            </p>
            <CardTitle
              className="mt-2 text-2xl text-foreground"
              style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
            >
              桌面侧设置
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
              当前阶段只持久化桌面偏好，不修改 Python 引擎协议，也不直接改写 `tasks/` 目录。
            </CardDescription>
          </div>

          <div className="rounded-full border border-border/70 bg-background/70 px-4 py-2 text-xs tracking-[0.22em] text-muted-foreground">
            JSON STORE
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <div className="rounded-[1.2rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]" onSubmit={(event) => void handleSubmit(event)}>
          <div className="grid gap-4">
            <Field
              hint="语言代码，默认写入桌面配置文件。当前不会自动覆盖 Python health 里的语言值。"
              label="Language"
              onChange={(value) => setDraft((current) => ({ ...current, language: value }))}
              value={draft.language}
            />
            <Field
              hint="默认模型名，便于后续把桌面设置和引擎参数对齐。"
              label="Model Name"
              onChange={(value) => setDraft((current) => ({ ...current, modelName: value }))}
              value={draft.modelName}
            />
            <Field
              hint="导出默认格式，占位为 txt，后续 Task 6+ 若扩展导出协议再继续复用。"
              label="Export Format"
              onChange={(value) => setDraft((current) => ({ ...current, exportFormat: value }))}
              value={draft.exportFormat}
            />
          </div>

          <div className="grid content-start gap-4 rounded-[1.4rem] border border-border/70 bg-background/70 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              保存说明
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              设置会写入 Electron 用户目录下的 `settings.json`。这一步先解决“有地方保存”和“可在设置页查看”的问题。
            </p>
            <Button
              className="rounded-full"
              disabled={isLoading || isSaving}
              type="submit"
              variant="default"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "保存中" : "保存设置"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
