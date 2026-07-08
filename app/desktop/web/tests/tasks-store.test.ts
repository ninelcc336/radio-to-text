import assert from "node:assert/strict";
import test from "node:test";
import { createTasksStore } from "../stores/tasks-store";

test("refreshTasks stores latest list with newest task first", async () => {
  const api = {
    tasks: {
      list: async () => [{ task_id: "b" }, { task_id: "a" }]
    }
  } as never;

  const store = createTasksStore(api);
  await store.getState().refreshTasks();

  assert.deepEqual(
    store.getState().tasks.map((item) => item.task_id),
    ["b", "a"]
  );
  assert.equal(store.getState().selectedTaskId, "b");
});

test("importAudioTask prepends task and selects it", async () => {
  const api = {
    tasks: {
      list: async () => [],
      importAudio: async () => ({ task_id: "task-2", name: "Morning briefing" })
    }
  } as never;

  const store = createTasksStore(api);
  const imported = await store.getState().importAudioTask();

  assert.equal(imported?.task_id, "task-2");
  assert.deepEqual(store.getState().tasks.map((item) => item.task_id), ["task-2"]);
  assert.equal(store.getState().selectedTaskId, "task-2");
});

test("renameTask and deleteTask keep local list in sync", async () => {
  const api = {
    tasks: {
      list: async () => [],
      rename: async (taskId: string, name: string) => ({ task_id: taskId, name }),
      delete: async (taskId: string) => ({ taskId })
    }
  } as never;

  const store = createTasksStore(api);
  store.setState({
    tasks: [
      { task_id: "task-1", name: "Draft" },
      { task_id: "task-2", name: "Archive" }
    ],
    selectedTaskId: "task-1"
  });

  await store.getState().renameTask("task-1", "Updated");
  assert.equal(store.getState().tasks[0]?.name, "Updated");

  await store.getState().deleteTask("task-1");
  assert.deepEqual(store.getState().tasks.map((item) => item.task_id), ["task-2"]);
  assert.equal(store.getState().selectedTaskId, "task-2");
});
