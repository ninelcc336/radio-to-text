"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  consolidateModelCache,
  findCompleteSnapshots,
  hasCompleteSnapshot
} = require("../migrate-model-cache.js");

async function writeModelSnapshot(snapshotDir) {
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.writeFile(path.join(snapshotDir, "config.json"), "{}", "utf8");
  await fs.writeFile(path.join(snapshotDir, "tokenizer.json"), "{}", "utf8");
  await fs.writeFile(path.join(snapshotDir, "vocabulary.txt"), "token", "utf8");
  await fs.writeFile(path.join(snapshotDir, "model.bin"), Buffer.from("model"));
}

test("findCompleteSnapshots only returns complete revisions", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-model-cache-"));
  try {
    const modelDir = path.join(tempRoot, "models--Systran--faster-whisper-small");
    const goodSnapshot = path.join(modelDir, "snapshots", "good");
    const badSnapshot = path.join(modelDir, "snapshots", "bad");

    await writeModelSnapshot(goodSnapshot);
    await fs.mkdir(badSnapshot, { recursive: true });
    await fs.writeFile(path.join(badSnapshot, "config.json"), "{}", "utf8");

    const snapshots = await findCompleteSnapshots(modelDir);
    assert.deepEqual(snapshots, [goodSnapshot]);
    assert.equal(await hasCompleteSnapshot(modelDir), true);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("consolidateModelCache deletes external duplicate when project copy is complete", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-model-cache-"));
  try {
    const targetRoot = path.join(tempRoot, "project", "cache", "models");
    const externalRoot = path.join(tempRoot, "external", "huggingface", "hub");
    const modelName = "models--Systran--faster-whisper-small";
    const targetModelDir = path.join(targetRoot, modelName);
    const externalModelDir = path.join(externalRoot, modelName);

    await writeModelSnapshot(path.join(targetModelDir, "snapshots", "project-rev"));
    await writeModelSnapshot(path.join(externalModelDir, "snapshots", "external-rev"));

    const summary = await consolidateModelCache({
      targetRoot,
      externalRoots: [externalRoot]
    });

    assert.equal(summary.moved.length, 0);
    assert.equal(summary.failed.length, 0);
    assert.equal(summary.deletedDuplicates.length, 1);
    assert.equal(await hasCompleteSnapshot(targetModelDir), true);
    assert.equal(await fs.stat(targetModelDir).then(() => true, () => false), true);
    assert.equal(await fs.stat(externalModelDir).then(() => true, () => false), false);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
