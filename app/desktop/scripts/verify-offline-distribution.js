const fs = require("fs");
const path = require("path");
const { runEngineRequest } = require("../lib/python-engine");
const { ensureRuntimeDirs, workspaceRoot } = require("../lib/runtime-paths");

function resolveWorkspacePath(...segments) {
  return path.join(workspaceRoot(), ...segments);
}

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} is missing: ${targetPath}`);
  }
}

function readJsonFile(filePath, label) {
  assertExists(filePath, label);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}. ${error.message}`);
  }
}

function buildRuntimePaths({ runtimeRoot, engineEntry, manifest, bundledModelDir }) {
  const cacheRootDir = path.join(runtimeRoot, "cache");
  const runtimePaths = {
    isPackaged: true,
    rootDir: runtimeRoot,
    tasksDir: path.join(runtimeRoot, "tasks"),
    logsDir: path.join(runtimeRoot, "logs"),
    cacheRootDir,
    modelCacheDir: path.join(cacheRootDir, "models"),
    huggingfaceHomeDir: path.join(cacheRootDir, "huggingface"),
    engineEntry,
    distributionVariant: manifest.variant || "lite",
    bundledModelName: manifest.bundledModelName || null,
    bundledModelDir,
    bundledModelRequired: Boolean(manifest.bundledModelRequired)
  };

  ensureRuntimeDirs(runtimePaths);
  return runtimePaths;
}

function validateDistributionResources(unpackedDir) {
  assertExists(unpackedDir, "Offline distribution directory");

  const resourcesDir = path.join(unpackedDir, "resources");
  const enginePath = path.join(resourcesDir, "engine", "engine.exe");
  const manifestPath = path.join(resourcesDir, "distribution", "manifest.json");
  const bundledModelDir = path.join(resourcesDir, "models", "small");

  assertExists(resourcesDir, "Offline distribution resources directory");
  assertExists(enginePath, "Bundled engine executable");
  assertExists(bundledModelDir, "Bundled small model directory");

  for (const fileName of [
    "config.json",
    "tokenizer.json",
    "vocabulary.txt",
    "model.bin"
  ]) {
    assertExists(
      path.join(bundledModelDir, fileName),
      `Bundled small model file ${fileName}`
    );
  }

  const manifest = readJsonFile(manifestPath, "Distribution manifest");
  if ((manifest.variant || "") !== "offline-small") {
    throw new Error(
      `Distribution manifest variant must be offline-small: ${manifestPath}`
    );
  }
  if ((manifest.bundledModelName || "") !== "small") {
    throw new Error(
      `Distribution manifest bundledModelName must be small: ${manifestPath}`
    );
  }
  if ((manifest.bundledModelRelativePath || "") !== "models/small") {
    throw new Error(
      `Distribution manifest bundledModelRelativePath must be models/small: ${manifestPath}`
    );
  }
  if (!manifest.bundledModelRequired) {
    throw new Error(
      `Distribution manifest bundledModelRequired must be true: ${manifestPath}`
    );
  }

  return {
    resourcesDir,
    enginePath,
    bundledModelDir,
    manifest
  };
}

function createIsolatedRuntimeRoot() {
  const baseDir = resolveWorkspacePath("release", "offline-small", "verify-runtime");
  fs.mkdirSync(baseDir, { recursive: true });
  return fs.mkdtempSync(path.join(baseDir, `${Date.now()}-`));
}

function assertTaskArtifacts(runtimePaths, taskId, processedTask) {
  if (processedTask.status !== "completed") {
    throw new Error(`Processed task did not complete: ${processedTask.status}`);
  }
  if (processedTask.stage !== "completed") {
    throw new Error(`Processed task stage is not completed: ${processedTask.stage}`);
  }

  const taskDir = path.join(runtimePaths.tasksDir, taskId);
  assertExists(taskDir, "Processed task directory");
  assertExists(path.join(taskDir, "task.json"), "Processed task metadata");

  for (const exportName of ["txt", "md", "json"]) {
    const exportPath =
      processedTask.exports && processedTask.exports[exportName]
        ? processedTask.exports[exportName]
        : path.join(taskDir, "output", `${taskId}.${exportName}`);
    assertExists(exportPath, `Processed task export ${exportName}`);
  }
}

async function main() {
  const defaultUnpackedDirCandidates = [
    resolveWorkspacePath("release", "offline-small", "win-unpacked-offline-small"),
    resolveWorkspacePath("release", "offline-small", "win-unpacked")
  ];
  const defaultUnpackedDir =
    defaultUnpackedDirCandidates.find((targetPath) => fs.existsSync(targetPath)) ||
    defaultUnpackedDirCandidates[0];
  const unpackedDir = path.resolve(
    process.argv[2] || defaultUnpackedDir
  );
  const sampleAudioPath = path.resolve(
    process.argv[3] || resolveWorkspacePath("tools", "sample-meeting.wav")
  );

  console.log(`Verifying offline distribution: ${unpackedDir}`);
  const distribution = validateDistributionResources(unpackedDir);
  assertExists(sampleAudioPath, "Sample audio file");

  const runtimeRoot = createIsolatedRuntimeRoot();
  const runtimePaths = buildRuntimePaths({
    runtimeRoot,
    engineEntry: distribution.enginePath,
    manifest: distribution.manifest,
    bundledModelDir: distribution.bundledModelDir
  });

  console.log(`Using isolated runtime: ${runtimeRoot}`);
  console.log(`Importing sample audio: ${sampleAudioPath}`);
  const imported = await runEngineRequest(
    {
      action: "import_audio",
      payload: {
        sourcePath: sampleAudioPath
      }
    },
    {
      runtimePaths
    }
  );

  const taskId = imported && imported.data && imported.data.task
    ? imported.data.task.task_id
    : null;
  if (!taskId) {
    throw new Error("import_audio did not return task_id");
  }

  console.log(`Processing task: ${taskId}`);
  const processed = await runEngineRequest(
    {
      action: "process_task",
      payload: {
        taskId
      }
    },
    {
      runtimePaths
    }
  );

  const processedTask = processed && processed.data ? processed.data.task : null;
  if (!processedTask) {
    throw new Error("process_task did not return task data");
  }

  assertTaskArtifacts(runtimePaths, taskId, processedTask);

  console.log(
    JSON.stringify(
      {
        ok: true,
        unpackedDir,
        runtimeRoot,
        taskId,
        distributionVariant: runtimePaths.distributionVariant,
        bundledModelDir: runtimePaths.bundledModelDir
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  const message = error && error.message ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
