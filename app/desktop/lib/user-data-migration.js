const fs = require("fs/promises");
const path = require("path");

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function isDirectoryEmpty(targetPath) {
  if (!(await pathExists(targetPath))) {
    return true;
  }

  const entries = await fs.readdir(targetPath);
  return entries.length === 0;
}

async function migrateLegacyUserData(options) {
  const userDataDir = path.resolve(String(options?.userDataDir || ""));
  const legacyDirName = String(options?.legacyDirName || "").trim();
  const targets = Array.isArray(options?.targets) ? options.targets : [];
  const logger =
    typeof options?.logger === "function" ? options.logger : () => {};

  if (!userDataDir) {
    throw new Error("userDataDir is required");
  }

  if (!legacyDirName) {
    throw new Error("legacyDirName is required");
  }

  const parentDir = path.dirname(userDataDir);
  const legacyUserDataDir = path.join(parentDir, legacyDirName);

  if (!(await pathExists(legacyUserDataDir))) {
    return {
      migrated: false,
      skipped: true,
      reason: "legacy-dir-missing",
      legacyUserDataDir
    };
  }

  if (!(await isDirectoryEmpty(userDataDir))) {
    logger(`[desktop] Detected legacy user data at ${legacyUserDataDir}, but current userData dir is not empty. Skip migration.`);
    return {
      migrated: false,
      skipped: true,
      reason: "user-data-dir-not-empty",
      legacyUserDataDir
    };
  }

  const migratedTargets = [];
  await fs.mkdir(userDataDir, { recursive: true });

  for (const targetName of targets) {
    const sourcePath = path.join(legacyUserDataDir, targetName);
    if (!(await pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.join(userDataDir, targetName);
    await fs.cp(sourcePath, targetPath, {
      recursive: true,
      force: false,
      errorOnExist: true
    });
    migratedTargets.push(targetName);
  }

  if (!migratedTargets.length) {
    return {
      migrated: false,
      skipped: true,
      reason: "no-known-targets",
      legacyUserDataDir
    };
  }

  logger(
    `[desktop] Migrated legacy user data from ${legacyUserDataDir} to ${userDataDir}: ${migratedTargets.join(", ")}`
  );

  return {
    migrated: true,
    skipped: false,
    legacyUserDataDir,
    migratedTargets
  };
}

module.exports = {
  migrateLegacyUserData
};
