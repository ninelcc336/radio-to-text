import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopApi, getDesktopApi } from "../lib/desktop-api";
import type { DesktopApi, DesktopBridge } from "../lib/desktop-types";

test("desktop api maps task list call to preload bridge", async () => {
  const calls: Array<{ channel: string; payload: unknown }> = [];
  const bridge: DesktopBridge = {
    invoke<T>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return Promise.resolve({ ok: true, data: { tasks: [] } } as T);
    }
  };

  const api = createDesktopApi(bridge);
  await api.tasks.list();

  assert.deepEqual(calls[0], {
    channel: "engine:request",
    payload: { action: "list_tasks", payload: {} }
  });
});

test("desktop api returns null when audio selection is cancelled", async () => {
  const bridge: DesktopBridge = {
    invoke<T>(channel: string) {
      assert.equal(channel, "dialog:select-audio");
      return Promise.resolve({ canceled: true, filePaths: [] } as T);
    }
  };

  const api = createDesktopApi(bridge);
  assert.equal(await api.tasks.importAudio(), null);
});

test("getDesktopApi returns preload desktop api when available", () => {
  const desktopApi = {
    tasks: {},
    review: {},
    media: {},
    dialog: {},
    settings: {},
    engine: {}
  } as DesktopApi;

  Object.assign(globalThis, {
    window: {
      desktopApi
    }
  });

  assert.equal(getDesktopApi(), desktopApi);
  delete (globalThis as { window?: unknown }).window;
});
