import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerStore, findActiveSegmentIndex } from "../stores/player-store";

test("findActiveSegmentIndex matches segment by current time", () => {
  const index = findActiveSegmentIndex(
    [{ start: 0, end: 1 }, { start: 1, end: 3 }],
    1.2
  );

  assert.equal(index, 1);
});

test("loadAudio stores resolved source metadata", async () => {
  const api = {
    media: {
      resolveTaskAudio: async () => ({
        available: true,
        url: "file:///demo.wav",
        path: "E:/demo.wav",
        fileName: "demo.wav"
      })
    }
  } as never;

  const store = createPlayerStore(api);
  const audio = await store.getState().loadAudio("task-1");

  assert.equal(audio.available, true);
  assert.equal(store.getState().audio?.url, "file:///demo.wav");
  assert.equal(store.getState().isLoading, false);
});
