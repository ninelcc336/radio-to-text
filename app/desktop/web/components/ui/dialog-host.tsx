"use client";

import { useEffect, useState } from "react";
import { APP_BRAND_NAME } from "@/lib/app-config";
import { useDialogStore } from "@/stores/dialog-store";
import { Button } from "./button";
import { Input } from "./input";

export function DialogHost() {
  const dialog = useDialogStore((state) => state.dialog);
  const close = useDialogStore((state) => state.close);
  const resolve = useDialogStore((state) => state.resolve);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (dialog?.mode === "prompt") {
      setValue(dialog.defaultValue || "");
      return;
    }

    setValue("");
  }, [dialog]);

  if (!dialog) {
    return null;
  }

  const isPrompt = dialog.mode === "prompt";
  const trimmedValue = value.trim();
  const confirmDisabled = isPrompt && !trimmedValue;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(31,24,16,0.38)] px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.8rem] border border-border/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.98),rgba(243,233,216,0.96))] p-6 shadow-[0_30px_80px_rgba(58,39,13,0.26)]">
        <p className="text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
          {APP_BRAND_NAME}
        </p>
        <h2
          className="mt-3 text-2xl text-foreground"
          style={{ fontFamily: "\"Palatino Linotype\", Georgia, serif" }}
        >
          {dialog.title}
        </h2>
        {dialog.description ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{dialog.description}</p>
        ) : null}

        {isPrompt ? (
          <div className="mt-5">
            <Input
              autoFocus
              className="h-11 rounded-2xl border-border/70 bg-white/90"
              onChange={(event) => setValue(event.target.value)}
              placeholder={dialog.placeholder}
              value={value}
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button className="rounded-full px-5" onClick={close} type="button" variant="outline">
            {dialog.cancelLabel}
          </Button>
          <Button
            className="rounded-full px-5"
            disabled={Boolean(confirmDisabled)}
            onClick={() => resolve(isPrompt ? trimmedValue : true)}
            type="button"
            variant={dialog.tone === "destructive" ? "destructive" : "default"}
          >
            {dialog.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
