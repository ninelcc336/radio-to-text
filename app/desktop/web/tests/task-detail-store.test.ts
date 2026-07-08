import assert from "node:assert/strict";
import test from "node:test";
import { createTaskDetailStore } from "../stores/task-detail-store";

test("loadTask stores fetched task and defaults to clean/all view", async () => {
  const api = {
    tasks: {
      get: async () => ({ task_id: "task-1", results: { segments: [] } })
    }
  } as never;

  const store = createTaskDetailStore(api);
  await store.getState().loadTask("task-1");

  assert.equal(store.getState().task?.task_id, "task-1");
  assert.equal(store.getState().textVersion, "clean");
  assert.equal(store.getState().reviewFilter, "all");
});

test("updateReview writes returned task back into the store", async () => {
  const api = {
    tasks: {
      get: async () => null
    },
    review: {
      update: async () => ({
        task_id: "task-1",
        results: {
          segments: [
            {
              start: 0,
              end: 1,
              text: "已修正",
              review_status: "corrected",
              reviewed_text: "已修正"
            }
          ]
        }
      })
    }
  } as never;

  const store = createTaskDetailStore(api);
  const task = await store.getState().updateReview("task-1", 0, "correct", "已修正");

  assert.equal(task?.results?.segments?.[0]?.text, "已修正");
  assert.equal(store.getState().task?.results?.segments?.[0]?.review_status, "corrected");
  assert.equal(store.getState().isSavingReview, false);
});
