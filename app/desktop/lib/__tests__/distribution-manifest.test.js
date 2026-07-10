"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { loadDistributionManifest } = require("../distribution-manifest");
const { getRuntimePaths } = require("../runtime-paths");

test("loadDistributionManifest returns offline-small metadata from resources manifest", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-dist-manifest-"));

  try {
    const resourcesDir = path.join(tempRoot, "resources");
    const manifestDir = path.join(resourcesDir, "distribution");
    await fs.mkdir(manifestDir, { recursive: true });
    await fs.writeFile(
      path.join(manifestDir, "manifest.json"),
      JSON.stringify({
        variant: "offline-small",
        bundledModelName: "small",
        bundledModelRelativePath: "models/small",
        bundledModelRequired: true
      }),
      "utf8"
    );

    const manifest = loadDistributionManifest({
      isPackaged: true,
      resourcesPath: resourcesDir
    });

    assert.equal(manifest.variant, "offline-small");
    assert.equal(manifest.bundledModelName, "small");
    assert.equal(manifest.bundledModelRequired, true);
    assert.equal(
      manifest.bundledModelDir,
      path.join(resourcesDir, "models", "small")
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("getRuntimePaths falls back to lite when no packaged manifest exists", () => {
  const runtimePaths = getRuntimePaths({
    isPackaged: false,
    resourcesPath: path.resolve(".")
  });

  assert.equal(runtimePaths.distributionVariant, "lite");
  assert.equal(runtimePaths.bundledModelName, null);
  assert.equal(runtimePaths.bundledModelDir, null);
  assert.equal(runtimePaths.bundledModelRequired, false);
});
