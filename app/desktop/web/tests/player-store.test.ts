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

test("requestSeek updates time and token even when seeking to same timestamp", () => {
  const store = createPlayerStore();

  store.getState().requestSeek(12.5, 3);
  const firstState = store.getState();

  assert.equal(firstState.currentTime, 12.5);
  assert.equal(firstState.activeSegmentIndex, 3);
  assert.equal(firstState.seekTargetTime, 12.5);
  assert.equal(firstState.seekRequestToken, 1);

  store.getState().requestSeek(12.5, 3);
  const secondState = store.getState();

  assert.equal(secondState.seekRequestToken, 2);
  assert.equal(secondState.seekTargetTime, 12.5);
});
