"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { migrateLegacyUserData } = require("../user-data-migration");

test("migrateLegacyUserData copies legacy settings and runtime folders into new userData dir", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-user-data-migration-"));

  try {
    const parentDir = path.join(tempRoot, "Roaming");
    const legacyDir = path.join(parentDir, "radio-to-text");
    const nextDir = path.join(parentDir, "音频转写助手");

    await fs.mkdir(path.join(legacyDir, "tasks", "task-1"), { recursive: true });
    await fs.mkdir(path.join(legacyDir, "cache"), { recursive: true });
    await fs.writeFile(path.join(legacyDir, "settings.json"), "{\"theme\":\"dark\"}", "utf8");
    await fs.writeFile(path.join(legacyDir, "tasks", "task-1", "task.json"), "{\"task_id\":\"task-1\"}", "utf8");

    const result = await migrateLegacyUserData({
      userDataDir: nextDir,
      legacyDirName: "radio-to-text",
      targets: ["settings.json", "tasks", "logs", "cache"]
    });

    assert.equal(result.migrated, true);
    assert.deepEqual(result.migratedTargets, ["settings.json", "tasks", "cache"]);
    assert.equal(
      await fs.readFile(path.join(nextDir, "settings.json"), "utf8"),
      "{\"theme\":\"dark\"}"
    );
    assert.equal(
      await fs.readFile(path.join(nextDir, "tasks", "task-1", "task.json"), "utf8"),
      "{\"task_id\":\"task-1\"}"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("migrateLegacyUserData skips migration when current userData dir already has data", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-user-data-migration-"));

  try {
    const parentDir = path.join(tempRoot, "Roaming");
    const legacyDir = path.join(parentDir, "radio-to-text");
    const nextDir = path.join(parentDir, "音频转写助手");

    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(path.join(legacyDir, "settings.json"), "{\"theme\":\"dark\"}", "utf8");
    await fs.mkdir(nextDir, { recursive: true });
    await fs.writeFile(path.join(nextDir, "settings.json"), "{\"theme\":\"light\"}", "utf8");

    const result = await migrateLegacyUserData({
      userDataDir: nextDir,
      legacyDirName: "radio-to-text",
      targets: ["settings.json", "tasks", "logs", "cache"]
    });

    assert.equal(result.migrated, false);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "user-data-dir-not-empty");
    assert.equal(
      await fs.readFile(path.join(nextDir, "settings.json"), "utf8"),
      "{\"theme\":\"light\"}"
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
