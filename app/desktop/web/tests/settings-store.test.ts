import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsStore } from "../stores/settings-store";

test("loadSettings stores settings and engine health together", async () => {
  const api = {
    settings: {
      get: async () => ({ language: "zh", modelName: "small", exportFormat: "txt" })
    },
    engine: {
      health: async () => ({ ok: true, runtime_paths: {}, model_name: "small" })
    }
  } as never;

  const store = createSettingsStore(api);
  await store.getState().load();

  assert.equal(store.getState().settings?.language, "zh");
  assert.equal(store.getState().health?.ok, true);
  assert.equal(store.getState().health?.modelName, "small");
});

test("save writes returned settings back into the store", async () => {
  const calls: Array<unknown> = [];
  const api = {
    settings: {
      get: async () => ({ language: "zh", modelName: "small", exportFormat: "txt" }),
      set: async (payload: unknown) => {
        calls.push(payload);
        return { language: "en", modelName: "medium", exportFormat: "md" };
      }
    },
    engine: {
      health: async () => ({ ok: true })
    }
  } as never;

  const store = createSettingsStore(api);
  const settings = await store.getState().save({
    language: "en",
    modelName: "medium",
    exportFormat: "md"
  });

  assert.deepEqual(calls[0], {
    language: "en",
    modelName: "medium",
    exportFormat: "md"
  });
  assert.equal(settings.language, "en");
  assert.equal(store.getState().settings?.exportFormat, "md");
  assert.equal(store.getState().isSaving, false);
});
