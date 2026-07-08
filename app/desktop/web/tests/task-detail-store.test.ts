import assert from "node:assert/strict";
import test from "node:test";
import { createTaskDetailStore, getReviewStats, getVisibleSegments } from "../stores/task-detail-store";

test("loadTask stores fetched task and defaults to all review filter", async () => {
  const api = {
    tasks: {
      get: async () => ({ task_id: "task-1", results: { segments: [] } })
    }
  } as never;

  const store = createTaskDetailStore(api);
  await store.getState().loadTask("task-1");

  assert.equal(store.getState().task?.task_id, "task-1");
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

test("visible segments hide deleted items and only count unresolved focus review", () => {
  const task = {
    task_id: "task-1",
    results: {
      segments: [
        { start: 0, end: 1, text: "普通片段", needs_review: false, review_status: "pending" },
        { start: 1, end: 2, text: "重点片段", needs_review: true, review_status: "pending" },
        { start: 2, end: 3, text: "已确认片段", needs_review: true, review_status: "confirmed" },
        { start: 3, end: 4, text: "已删除片段", needs_review: true, review_status: "deleted" }
      ]
    }
  };

  assert.equal(getVisibleSegments(task as never, "all").length, 3);
  assert.equal(getVisibleSegments(task as never, "needs-review").length, 1);
  assert.deepEqual(getReviewStats(task as never), { total: 3, needsReview: 1 });
});
