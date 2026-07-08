"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

type ConfirmDialogOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
};

type PromptDialogOptions = ConfirmDialogOptions & {
  defaultValue?: string;
  placeholder?: string;
};

type DialogState =
  | null
  | ({
      mode: "confirm";
      resolve(result: boolean): void;
    } & ConfirmDialogOptions)
  | ({
      mode: "prompt";
      resolve(result: string | null): void;
    } & PromptDialogOptions);

type DialogStoreState = {
  dialog: DialogState;
  openConfirm(options: ConfirmDialogOptions): Promise<boolean>;
  openPrompt(options: PromptDialogOptions): Promise<string | null>;
  close(): void;
  resolve(result: boolean | string | null): void;
};

export function createDialogStore() {
  return createStore<DialogStoreState>()((set, get) => ({
    dialog: null,
    openConfirm(options) {
      return new Promise<boolean>((resolve) => {
        set({
          dialog: {
            mode: "confirm",
            confirmLabel: "确认",
            cancelLabel: "取消",
            tone: "default",
            ...options,
            resolve
          }
        });
      });
    },
    openPrompt(options) {
      return new Promise<string | null>((resolve) => {
        set({
          dialog: {
            mode: "prompt",
            confirmLabel: "保存",
            cancelLabel: "取消",
            tone: "default",
            ...options,
            resolve
          }
        });
      });
    },
    close() {
      const dialog = get().dialog;
      if (!dialog) {
        return;
      }

      if (dialog.mode === "confirm") {
        dialog.resolve(false);
      } else {
        dialog.resolve(null);
      }
      set({ dialog: null });
    },
    resolve(result) {
      const dialog = get().dialog;
      if (!dialog) {
        return;
      }

      if (dialog.mode === "confirm") {
        dialog.resolve(Boolean(result));
      } else {
        dialog.resolve(typeof result === "string" ? result : null);
      }
      set({ dialog: null });
    }
  }));
}

const dialogStore = createDialogStore();

export function useDialogStore<T>(selector: (state: DialogStoreState) => T) {
  return useStore(dialogStore, selector);
}

export function getDialogStore() {
  return dialogStore;
}
