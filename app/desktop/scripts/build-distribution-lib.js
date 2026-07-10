const fs = require("fs");
const path = require("path");

const REQUIRED_MODEL_FILES = Object.freeze([
  "config.json",
  "tokenizer.json",
  "vocabulary.txt",
  "model.bin"
]);

function workspaceRoot() {
  return path.resolve(__dirname, "../../..");
}

function validateBundledModelDir(modelDir) {
  const resolvedDir = path.resolve(modelDir);

  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`Bundled model directory does not exist: ${resolvedDir}`);
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Bundled model path is not a directory: ${resolvedDir}`);
  }

  const missingFiles = REQUIRED_MODEL_FILES.filter((fileName) => {
    const targetPath = path.join(resolvedDir, fileName);
    return !fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile();
  });

  if (missingFiles.length > 0) {
    throw new Error(
      `Bundled model directory is incomplete: ${resolvedDir} (missing: ${missingFiles.join(", ")})`
    );
  }

  return resolvedDir;
}

function hasRequiredModelFiles(modelDir) {
  if (!fs.existsSync(modelDir) || !fs.statSync(modelDir).isDirectory()) {
    return false;
  }

  return REQUIRED_MODEL_FILES.every((fileName) => {
    const targetPath = path.join(modelDir, fileName);
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile();
  });
}

function writeDistributionManifest(targetRoot, manifest) {
  const distributionDir = path.join(path.resolve(targetRoot), "distribution");
  const manifestPath = path.join(distributionDir, "manifest.json");

  fs.mkdirSync(distributionDir, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return manifestPath;
}

function getLatestSnapshotDir(snapshotsRoot) {
  if (!fs.existsSync(snapshotsRoot)) {
    return null;
  }

  const snapshotEntries = fs.readdirSync(snapshotsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(snapshotsRoot, entry.name);
      return {
        fullPath,
        mtimeMs: fs.statSync(fullPath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  return snapshotEntries[0] ? snapshotEntries[0].fullPath : null;
}

function resolveOfflineSmallModelSource(options = {}) {
  const env = options.env || process.env;
  const rootDir = path.resolve(options.workspaceRoot || workspaceRoot());
  const envOverride = env.RTT_BUNDLE_MODEL_SOURCE_SMALL;

  if (envOverride) {
    return path.resolve(envOverride);
  }

  const managedDir = path.join(
    rootDir,
    "cache",
    "models",
    "managed",
    "Systran--faster-whisper-small"
  );

  if (hasRequiredModelFiles(managedDir)) {
    return managedDir;
  }

  const snapshotsRoot = path.join(
    rootDir,
    "cache",
    "models",
    "models--Systran--faster-whisper-small",
    "snapshots"
  );
  const latestSnapshotDir = getLatestSnapshotDir(snapshotsRoot);

  if (latestSnapshotDir) {
    return latestSnapshotDir;
  }

  throw new Error(
    [
      "Unable to resolve offline-small model source.",
      "Checked RTT_BUNDLE_MODEL_SOURCE_SMALL, managed cache, and snapshot cache."
    ].join(" ")
  );
}

module.exports = {
  REQUIRED_MODEL_FILES,
  resolveOfflineSmallModelSource,
  validateBundledModelDir,
  writeDistributionManifest
};
