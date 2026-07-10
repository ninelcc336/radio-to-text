const fs = require("fs");
const path = require("path");
const { build, Platform } = require("electron-builder");
const {
  resolveOfflineSmallModelSource,
  validateBundledModelDir,
  writeDistributionManifest
} = require("./build-distribution-lib");

function workspaceRoot() {
  return path.resolve(__dirname, "../../..");
}

function ensureExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

function cleanDir(targetPath) {
  let lastError = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      fs.rmSync(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 500
      });
      return;
    } catch (error) {
      lastError = error;
      sleep(500);
    }
  }

  throw lastError;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function copyDir(sourceDir, targetDir) {
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      fs.cpSync(sourceDir, targetDir, {
        recursive: true,
        force: true
      });
      return;
    } catch (error) {
      lastError = error;
      sleep(300);
    }
  }

  throw lastError;
}

function copyFile(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyBuildOutput(sourceDir, targetDir, options = {}) {
  const includeDirectories = Boolean(options.includeDirectories);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      if (includeDirectories) {
        cleanDir(targetPath);
        copyDir(sourcePath, targetPath);
      }
      continue;
    }

    copyFile(sourcePath, targetPath);
  }
}

function createUnpackedBuilderConfig(rootDir, outputDir) {
  const packageJson = require(path.join(rootDir, "package.json"));
  const {
    extraResources: _ignoredExtraResources,
    ...baseBuildConfig
  } = packageJson.build || {};

  return {
    ...baseBuildConfig,
    directories: {
      ...(baseBuildConfig.directories || {}),
      output: path.relative(rootDir, outputDir)
    }
  };
}

function createInstallerBuilderConfig(rootDir, outputDir) {
  const packageJson = require(path.join(rootDir, "package.json"));
  const {
    extraResources: _ignoredExtraResources,
    ...baseBuildConfig
  } = packageJson.build || {};

  return {
    ...baseBuildConfig,
    directories: {
      ...(baseBuildConfig.directories || {}),
      output: path.relative(rootDir, outputDir)
    },
    nsis: {
      ...((packageJson.build && packageJson.build.nsis) || {}),
      artifactName: "${productName}-${version}-offline-small-installer.${ext}"
    },
    portable: {
      ...((packageJson.build && packageJson.build.portable) || {}),
      artifactName: "${productName}-${version}-offline-small-portable.${ext}"
    }
  };
}

async function main() {
  const rootDir = workspaceRoot();
  const enginePath = path.join(rootDir, "dist-python", "engine", "engine.exe");
  const webStandaloneDir = path.join(rootDir, "app", "desktop", "web", ".next", "standalone");
  const webStaticDir = path.join(rootDir, "app", "desktop", "web", ".next", "static");
  const webServerPath = path.join(webStandaloneDir, "server.js");
  const finalOutputDir = path.join(rootDir, "release", "offline-small");
  const stagingRootDir = path.join(rootDir, "build", "distribution", "offline-small");
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const stagingDir = path.join(stagingRootDir, runId);
  const unpackedBuildDir = path.join(stagingDir, "unpacked-build");
  const prepackagedDir = path.join(stagingDir, "prepackaged", "win-unpacked");
  const stagedResourcesDir = path.join(stagingDir, "bundle-resources", "resources");
  const stagedModelsDir = path.join(stagedResourcesDir, "models");
  const stagedDistributionDir = path.join(stagedResourcesDir, "distribution");
  const publishedUnpackedDir = path.join(finalOutputDir, "win-unpacked-offline-small");

  ensureExists(enginePath, "Python engine build");
  ensureExists(webServerPath, "Next standalone build");
  ensureExists(webStaticDir, "Next static assets");

  const modelSourceDir = validateBundledModelDir(
    resolveOfflineSmallModelSource({ workspaceRoot: rootDir })
  );

  fs.mkdirSync(stagedResourcesDir, { recursive: true });
  fs.mkdirSync(finalOutputDir, { recursive: true });

  copyDir(modelSourceDir, path.join(stagedModelsDir, "small"));
  writeDistributionManifest(stagedResourcesDir, {
    variant: "offline-small",
    bundledModelName: "small",
    bundledModelRelativePath: "models/small",
    bundledModelRequired: true
  });
  ensureExists(
    path.join(stagedDistributionDir, "manifest.json"),
    "Distribution manifest"
  );

  await build({
    projectDir: rootDir,
    config: createUnpackedBuilderConfig(rootDir, unpackedBuildDir),
    targets: Platform.WINDOWS.createTarget(["dir"]),
    publish: "never"
  });

  ensureExists(path.join(unpackedBuildDir, "win-unpacked"), "Unpacked offline-small app");
  copyDir(path.join(unpackedBuildDir, "win-unpacked"), prepackagedDir);
  copyDir(
    path.join(rootDir, "app", "desktop", "web", ".next", "standalone"),
    path.join(prepackagedDir, "resources", "web")
  );
  ensureExists(
    path.join(prepackagedDir, "resources", "web", "server.js"),
    "Bundled web standalone entry"
  );
  copyDir(path.join(rootDir, "dist-python", "engine"), path.join(prepackagedDir, "resources", "engine"));
  ensureExists(
    path.join(prepackagedDir, "resources", "engine", "engine.exe"),
    "Bundled engine executable"
  );
  copyDir(path.join(stagedModelsDir, "small"), path.join(prepackagedDir, "resources", "models", "small"));
  copyDir(stagedDistributionDir, path.join(prepackagedDir, "resources", "distribution"));

  for (const targetName of ["nsis", "portable"]) {
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await build({
          projectDir: rootDir,
          prepackaged: prepackagedDir,
          config: createInstallerBuilderConfig(rootDir, finalOutputDir),
          targets: Platform.WINDOWS.createTarget([targetName]),
          publish: "never"
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (
          !String(error && error.message ? error.message : error).includes("used by another process") &&
          !String(error && error.message ? error.message : error).includes("EBUSY")
        ) {
          throw error;
        }
        if (attempt === 3) {
          throw error;
        }
        sleep(2000);
      }
    }

    if (lastError) {
      throw lastError;
    }
  }

  copyDir(prepackagedDir, publishedUnpackedDir);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
