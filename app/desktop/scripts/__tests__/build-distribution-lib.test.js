const fs = require("fs");
const os = require("os");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  REQUIRED_MODEL_FILES,
  resolveOfflineSmallModelSource,
  validateBundledModelDir,
  writeDistributionManifest
} = require("../build-distribution-lib");

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeRequiredModelFiles(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const fileName of REQUIRED_MODEL_FILES) {
    fs.writeFileSync(path.join(targetDir, fileName), `${fileName}\n`, "utf8");
  }
}

test("validateBundledModelDir accepts a complete model directory", () => {
  const tempDir = createTempDir("rtt-model-valid-");
  const modelDir = path.join(tempDir, "small");
  writeRequiredModelFiles(modelDir);

  assert.equal(validateBundledModelDir(modelDir), modelDir);
});

test("validateBundledModelDir throws when model files are missing", () => {
  const tempDir = createTempDir("rtt-model-missing-");
  const modelDir = path.join(tempDir, "small");
  writeRequiredModelFiles(modelDir);
  fs.rmSync(path.join(modelDir, "model.bin"));

  assert.throws(
    () => validateBundledModelDir(modelDir),
    /missing: model\.bin/
  );
});

test("writeDistributionManifest writes manifest.json with stable formatting", () => {
  const tempDir = createTempDir("rtt-manifest-");
  const manifestPath = writeDistributionManifest(tempDir, {
    variant: "offline-small",
    bundledModelName: "small",
    bundledModelRelativePath: "models/small",
    bundledModelRequired: true
  });

  assert.equal(
    manifestPath,
    path.join(tempDir, "distribution", "manifest.json")
  );

  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  assert.equal(
    manifestContent,
    [
      "{",
      "  \"variant\": \"offline-small\",",
      "  \"bundledModelName\": \"small\",",
      "  \"bundledModelRelativePath\": \"models/small\",",
      "  \"bundledModelRequired\": true",
      "}",
      ""
    ].join("\n")
  );
});

test("resolveOfflineSmallModelSource prefers RTT_BUNDLE_MODEL_SOURCE_SMALL", () => {
  const tempDir = createTempDir("rtt-model-env-");
  const envDir = path.join(tempDir, "env-model");
  writeRequiredModelFiles(envDir);

  const resolvedDir = resolveOfflineSmallModelSource({
    env: {
      RTT_BUNDLE_MODEL_SOURCE_SMALL: envDir
    },
    workspaceRoot: tempDir
  });

  assert.equal(resolvedDir, envDir);
});

test("resolveOfflineSmallModelSource falls back to managed cache before snapshots", () => {
  const tempDir = createTempDir("rtt-model-managed-");
  const managedDir = path.join(
    tempDir,
    "cache",
    "models",
    "managed",
    "Systran--faster-whisper-small"
  );
  const snapshotDir = path.join(
    tempDir,
    "cache",
    "models",
    "models--Systran--faster-whisper-small",
    "snapshots",
    "newer"
  );
  writeRequiredModelFiles(managedDir);
  writeRequiredModelFiles(snapshotDir);

  const resolvedDir = resolveOfflineSmallModelSource({
    env: {},
    workspaceRoot: tempDir
  });

  assert.equal(resolvedDir, managedDir);
});

test("resolveOfflineSmallModelSource skips incomplete managed cache and falls back to snapshots", async () => {
  const tempDir = createTempDir("rtt-model-managed-incomplete-");
  const managedDir = path.join(
    tempDir,
    "cache",
    "models",
    "managed",
    "Systran--faster-whisper-small"
  );
  const snapshotDir = path.join(
    tempDir,
    "cache",
    "models",
    "models--Systran--faster-whisper-small",
    "snapshots",
    "usable"
  );
  writeRequiredModelFiles(managedDir);
  fs.rmSync(path.join(managedDir, "model.bin"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeRequiredModelFiles(snapshotDir);

  const resolvedDir = resolveOfflineSmallModelSource({
    env: {},
    workspaceRoot: tempDir
  });

  assert.equal(resolvedDir, snapshotDir);
});

test("resolveOfflineSmallModelSource selects the latest snapshot when managed cache is absent", async () => {
  const tempDir = createTempDir("rtt-model-snapshot-");
  const snapshotsRoot = path.join(
    tempDir,
    "cache",
    "models",
    "models--Systran--faster-whisper-small",
    "snapshots"
  );
  const olderDir = path.join(snapshotsRoot, "older");
  const newerDir = path.join(snapshotsRoot, "newer");
  writeRequiredModelFiles(olderDir);
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeRequiredModelFiles(newerDir);

  const resolvedDir = resolveOfflineSmallModelSource({
    env: {},
    workspaceRoot: tempDir
  });

  assert.equal(resolvedDir, newerDir);
});
