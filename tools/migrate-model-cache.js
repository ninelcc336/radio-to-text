"use strict";

const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const REQUIRED_MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "vocabulary.txt",
  "model.bin"
];

function workspaceRoot() {
  return path.resolve(__dirname, "..");
}

function normalizePath(targetPath) {
  return path.resolve(targetPath).replace(/[\\/]+$/, "").toLowerCase();
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findCompleteSnapshots(modelDir) {
  const snapshotsDir = path.join(modelDir, "snapshots");
  if (!(await pathExists(snapshotsDir))) {
    return [];
  }
  const revisions = await fs.readdir(snapshotsDir, { withFileTypes: true });
  const completeSnapshots = [];
  for (const revision of revisions) {
    if (!revision.isDirectory()) {
      continue;
    }
    const snapshotDir = path.join(snapshotsDir, revision.name);
    const checks = await Promise.all(
      REQUIRED_MODEL_FILES.map((name) => pathExists(path.join(snapshotDir, name)))
    );
    if (checks.every(Boolean)) {
      completeSnapshots.push(snapshotDir);
    }
  }
  return completeSnapshots.sort().reverse();
}

async function hasCompleteSnapshot(modelDir) {
  const snapshots = await findCompleteSnapshots(modelDir);
  return snapshots.length > 0;
}

async function ensureDir(targetDir) {
  await fs.mkdir(targetDir, { recursive: true });
}

async function copyDirectory(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  await ensureDir(targetDir);
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const realPath = await fs.realpath(sourcePath);
      await fs.symlink(realPath, targetPath);
      continue;
    }
    await fs.copyFile(sourcePath, targetPath);
  }
}

async function moveDirectory(sourceDir, targetDir) {
  try {
    await fs.rename(sourceDir, targetDir);
    return;
  } catch (error) {
    if (!error || error.code !== "EXDEV") {
      throw error;
    }
  }

  await copyDirectory(sourceDir, targetDir);
  await fs.rm(sourceDir, { recursive: true, force: true });
}

function getExternalRoots(targetRoot) {
  const candidates = [
    path.join(os.homedir(), ".cache", "huggingface", "hub"),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "huggingface", "hub")
      : "",
    process.env.APPDATA
      ? path.join(process.env.APPDATA, "huggingface", "hub")
      : "",
    process.env.HUGGINGFACE_HUB_CACHE || ""
  ].filter(Boolean);

  const seen = new Set();
  const normalizedTargetRoot = normalizePath(targetRoot);
  return candidates.filter((candidate) => {
    const normalizedCandidate = normalizePath(candidate);
    if (normalizedCandidate === normalizedTargetRoot) {
      return false;
    }
    if (seen.has(normalizedCandidate)) {
      return false;
    }
    seen.add(normalizedCandidate);
    return true;
  });
}

async function collectModelDirs(rootDir) {
  if (!(await pathExists(rootDir))) {
    return [];
  }
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("models--"))
    .map((entry) => path.join(rootDir, entry.name));
}

async function consolidateModelCache(options = {}) {
  const projectRoot = options.projectRoot
    ? path.resolve(options.projectRoot)
    : workspaceRoot();
  const targetRoot = options.targetRoot
    ? path.resolve(options.targetRoot)
    : path.join(projectRoot, "cache", "models");
  await ensureDir(targetRoot);

  const summary = {
    targetRoot,
    scannedRoots: [],
    moved: [],
    deletedDuplicates: [],
    skipped: [],
    failed: []
  };

  const externalRoots = Array.isArray(options.externalRoots)
    ? options.externalRoots
    : getExternalRoots(targetRoot);

  for (const externalRoot of externalRoots) {
    summary.scannedRoots.push(externalRoot);
    const modelDirs = await collectModelDirs(externalRoot);
    for (const sourceDir of modelDirs) {
      const modelName = path.basename(sourceDir);
      const targetDir = path.join(targetRoot, modelName);

      try {
        const sourceComplete = await hasCompleteSnapshot(sourceDir);
        if (!sourceComplete) {
          summary.skipped.push({
            sourceDir,
            reason: "source incomplete"
          });
          continue;
        }

        if (!(await pathExists(targetDir))) {
          await moveDirectory(sourceDir, targetDir);
          summary.moved.push({
            sourceDir,
            targetDir
          });
          continue;
        }

        if (!(await hasCompleteSnapshot(targetDir))) {
          summary.failed.push({
            sourceDir,
            targetDir,
            reason: "target incomplete"
          });
          continue;
        }

        await fs.rm(sourceDir, { recursive: true, force: true });
        summary.deletedDuplicates.push({
          sourceDir,
          targetDir
        });
      } catch (error) {
        summary.failed.push({
          sourceDir,
          targetDir,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  return summary;
}

async function main() {
  const summary = await consolidateModelCache();
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  REQUIRED_MODEL_FILES,
  consolidateModelCache,
  findCompleteSnapshots,
  getExternalRoots,
  hasCompleteSnapshot,
  pathExists
};
