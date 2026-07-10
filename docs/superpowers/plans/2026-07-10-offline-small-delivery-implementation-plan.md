# offline-small 默认交付 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地一个默认对外交付的 `offline-small` Windows 分发变体，让用户安装后直接可用，不需要自己安装或下载 Whisper 模型。

**Architecture:** 在 Electron 侧引入一个随包分发的发行清单文件，由主进程在启动时解析当前分发变体与内置模型目录，并通过环境变量把该决策注入 Python 引擎。构建阶段新增显式 `offline-small` 打包脚本，负责校验本机 `small` 模型、把模型与发行清单写入资源目录，并生成带变体标识的安装产物；最后用基于 `runEngineRequest()` 的离线验证脚本检查 unpacked 包能否直接跑样例转写。

**Tech Stack:** Electron, Node.js, `electron-builder`, Python 3.12, PyInstaller, `node:test`, `unittest`, PowerShell, 现有 `npm` 脚本

## Global Constraints

- 默认对外交付采用 `offline-small`
- 安装包内必须同时包含 Electron、PyInstaller 引擎和 `small` 模型
- 模型固定放在 `resources/models/small`
- 程序运行时按绝对路径读取内置模型，不依赖当前工作目录
- `offline-small` 在内置模型缺失时直接报资源错误，不回退到下载
- 第一阶段不实现 `offline-medium` 正式交付
- 本次只覆盖 Windows 分发，不扩展到 macOS 或 Linux
- 不改变现有 ASR 推理参数、模型格式或下载协议

---

### Task 1: 增加发行清单与运行时模型路径注入

**Files:**
- Create: `app/desktop/lib/distribution-manifest.js`
- Create: `app/desktop/lib/__tests__/distribution-manifest.test.js`
- Modify: `app/desktop/lib/runtime-paths.js`
- Modify: `app/desktop/lib/python-engine.js`

**Interfaces:**
- Consumes: `process.resourcesPath`, `getRuntimePaths(options = {})`, `runEngineRequest(request, options = {})`
- Produces: `loadDistributionManifest(options = {}) -> { variant: string, bundledModelName: string | null, bundledModelDir: string | null, bundledModelRequired: boolean }`
- Produces: `getRuntimePaths(options = {}) -> { isPackaged: boolean, rootDir: string, tasksDir: string, logsDir: string, cacheRootDir: string, modelCacheDir: string, huggingfaceHomeDir: string, engineEntry: string, distributionVariant: string, bundledModelName: string | null, bundledModelDir: string | null, bundledModelRequired: boolean }`
- Produces: `runEngineRequest()` 启动 Python 时显式注入 `RTT_DISTRIBUTION_VARIANT`、`RTT_ASR_MODEL_DIR`、`RTT_REQUIRE_BUNDLED_MODEL`

- [ ] **Step 1: 先写 Node 单测，锁定发行清单读取和运行时路径输出**

```js
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

    const manifest = loadDistributionManifest({ resourcesPath: resourcesDir, isPackaged: true });

    assert.equal(manifest.variant, "offline-small");
    assert.equal(manifest.bundledModelName, "small");
    assert.equal(manifest.bundledModelRequired, true);
    assert.equal(
        manifest.bundledModelDir,
        path.join(resourcesDir, "models", "small")
    );
});

test("getRuntimePaths falls back to lite when no packaged manifest exists", () => {
    const runtimePaths = getRuntimePaths({
        isPackaged: false,
        resourcesPath: path.resolve(".")
    });

    assert.equal(runtimePaths.distributionVariant, "lite");
    assert.equal(runtimePaths.bundledModelDir, null);
    assert.equal(runtimePaths.bundledModelRequired, false);
});
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `node --test app/desktop/lib/__tests__/distribution-manifest.test.js`
Expected: FAIL，报 `Cannot find module '../distribution-manifest'` 或缺少 `distributionVariant` 字段

- [ ] **Step 3: 新建 `distribution-manifest.js`，统一读取 `resources/distribution/manifest.json`**

```js
const fs = require("fs");
const path = require("path");

const DEFAULT_MANIFEST = Object.freeze({
  variant: "lite",
  bundledModelName: null,
  bundledModelDir: null,
  bundledModelRequired: false
});

function loadDistributionManifest(options = {}) {
  const resourcesRoot = path.resolve(options.resourcesPath || process.resourcesPath || ".");
  const manifestPath = path.join(resourcesRoot, "distribution", "manifest.json");

  if (!options.isPackaged || !fs.existsSync(manifestPath)) {
    return { ...DEFAULT_MANIFEST };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const relativePath = manifest.bundledModelRelativePath || null;

  return {
    variant: manifest.variant || "lite",
    bundledModelName: manifest.bundledModelName || null,
    bundledModelRequired: Boolean(manifest.bundledModelRequired),
    bundledModelDir: relativePath ? path.join(resourcesRoot, relativePath) : null
  };
}

module.exports = {
  loadDistributionManifest
};
```

- [ ] **Step 4: 在 `runtime-paths.js` 中接入发行清单，并把模型路径字段返回给调用方**

```js
const { loadDistributionManifest } = require("./distribution-manifest");

function getRuntimePaths(options = {}) {
  const isPackaged = Boolean(options.isPackaged);
  const distribution = loadDistributionManifest({
    isPackaged,
    resourcesPath: options.resourcesPath
  });
  const defaultRootDir = isPackaged
    ? path.resolve(options.userDataDir || workspaceRoot())
    : workspaceRoot();

  return {
    isPackaged,
    rootDir,
    tasksDir,
    logsDir,
    cacheRootDir,
    modelCacheDir,
    huggingfaceHomeDir,
    engineEntry,
    distributionVariant: distribution.variant,
    bundledModelName: distribution.bundledModelName,
    bundledModelDir: distribution.bundledModelDir,
    bundledModelRequired: distribution.bundledModelRequired
  };
}
```

- [ ] **Step 5: 在 `python-engine.js` 中注入离线分发相关环境变量**

```js
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        RTT_ROOT_DIR: runtimePaths.rootDir,
        RTT_TASKS_DIR: runtimePaths.tasksDir,
        RTT_LOG_DIR: runtimePaths.logsDir,
        RTT_CACHE_ROOT_DIR: runtimePaths.cacheRootDir,
        RTT_MODEL_CACHE_DIR: runtimePaths.modelCacheDir,
        RTT_DISTRIBUTION_VARIANT: runtimePaths.distributionVariant || "lite",
        RTT_ASR_MODEL_DIR: runtimePaths.bundledModelDir || "",
        RTT_REQUIRE_BUNDLED_MODEL: runtimePaths.bundledModelRequired ? "1" : "0",
        HF_HOME: runtimePaths.huggingfaceHomeDir,
        HUGGINGFACE_HUB_CACHE: runtimePaths.modelCacheDir,
        TRANSFORMERS_CACHE: runtimePaths.modelCacheDir,
        XDG_CACHE_HOME: runtimePaths.cacheRootDir
      }
```

- [ ] **Step 6: 重新运行测试，确认运行时路径语义已稳定**

Run: `node --test app/desktop/lib/__tests__/distribution-manifest.test.js`
Expected: PASS

- [ ] **Step 7: 提交这一层运行时变更**

```bash
git add app/desktop/lib/distribution-manifest.js app/desktop/lib/__tests__/distribution-manifest.test.js app/desktop/lib/runtime-paths.js app/desktop/lib/python-engine.js
git commit -m "增加分发清单与模型路径注入"
```

### Task 2: 让 Python 显式支持内置模型目录和离线错误语义

**Files:**
- Modify: `engine/python/radio_to_text/config.py`
- Modify: `engine/python/radio_to_text/transcribe.py`
- Modify: `engine/python/tests/test_model_cache_paths.py`

**Interfaces:**
- Consumes: `RTT_DISTRIBUTION_VARIANT`, `RTT_ASR_MODEL_DIR`, `RTT_REQUIRE_BUNDLED_MODEL`
- Produces: `EngineConfig` 额外暴露 `distribution_variant: str`, `bundled_model_dir: Path | None`, `bundled_model_required: bool`
- Produces: `Transcriber._resolve_model_path() -> Path` 先检查显式内置模型目录，再回落到现有缓存/下载逻辑

- [ ] **Step 1: 先补 Python 单测，锁定显式模型目录优先级和离线错误**

```python
    def test_load_config_reads_bundled_model_env(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            bundled_dir = root_dir / "resources" / "models" / "small"
            write_model_snapshot(bundled_dir)
            tools_dir = root_dir / "tools"
            tools_dir.mkdir(parents=True, exist_ok=True)
            (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                    "RTT_DISTRIBUTION_VARIANT": "offline-small",
                    "RTT_ASR_MODEL_DIR": str(bundled_dir),
                    "RTT_REQUIRE_BUNDLED_MODEL": "1",
                },
                clear=True,
            ):
                config = load_config()

            self.assertEqual(config.distribution_variant, "offline-small")
            self.assertEqual(normalize_path(config.bundled_model_dir), normalize_path(bundled_dir))
            self.assertEqual(config.bundled_model_required, True)

    def test_resolve_model_path_prefers_explicit_bundled_model_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            bundled_dir = root_dir / "resources" / "models" / "small"
            write_model_snapshot(bundled_dir)
            tools_dir = root_dir / "tools"
            tools_dir.mkdir(parents=True, exist_ok=True)
            (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                    "RTT_ASR_MODEL_DIR": str(bundled_dir),
                    "RTT_REQUIRE_BUNDLED_MODEL": "1",
                },
                clear=True,
            ):
                config = load_config()

            transcriber = Transcriber(config)
            self.assertEqual(
                normalize_path(transcriber._resolve_model_path()),
                normalize_path(bundled_dir),
            )

    def test_required_bundled_model_missing_raises_runtime_error(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root_dir = Path(temp_dir)
            tools_dir = root_dir / "tools"
            tools_dir.mkdir(parents=True, exist_ok=True)
            (tools_dir / "term-replacements.json").write_text("{}", encoding="utf-8")
            missing_dir = root_dir / "resources" / "models" / "small"

            with patch.dict(
                os.environ,
                {
                    "RTT_ROOT_DIR": str(root_dir),
                    "RTT_DISTRIBUTION_VARIANT": "offline-small",
                    "RTT_ASR_MODEL_DIR": str(missing_dir),
                    "RTT_REQUIRE_BUNDLED_MODEL": "1",
                },
                clear=True,
            ):
                config = load_config()

            transcriber = Transcriber(config)
            with self.assertRaisesRegex(RuntimeError, "Bundled model is required"):
                transcriber._resolve_model_path()
```

- [ ] **Step 2: 运行单测，确认它先失败**

Run: `$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_model_cache_paths.py -v`
Expected: FAIL，报 `EngineConfig` 缺少 `distribution_variant` / `bundled_model_dir` 字段，或 `Transcriber` 仍走缓存逻辑

- [ ] **Step 3: 在 `config.py` 中增加离线分发字段解析**

```python
@dataclass(frozen=True)
class EngineConfig:
    root_dir: Path
    tasks_dir: Path
    logs_dir: Path
    cache_root_dir: Path
    model_cache_dir: Path
    huggingface_home_dir: Path
    bundled_model_dir: Path | None
    bundled_model_required: bool
    distribution_variant: str
    term_replacements_path: Path

bundled_model_dir_raw = resolve_optional_text_env("RTT_ASR_MODEL_DIR")
bundled_model_dir = (
    Path(bundled_model_dir_raw).expanduser().resolve()
    if bundled_model_dir_raw
    else None
)

return EngineConfig(
    root_dir=root_dir,
    tasks_dir=tasks_dir,
    logs_dir=logs_dir,
    cache_root_dir=cache_root_dir,
    model_cache_dir=model_cache_dir,
    huggingface_home_dir=huggingface_home_dir,
    bundled_model_dir=bundled_model_dir,
    bundled_model_required=resolve_bool_env("RTT_REQUIRE_BUNDLED_MODEL", False),
    distribution_variant=os.getenv("RTT_DISTRIBUTION_VARIANT", "lite"),
    term_replacements_path=term_replacements_path,
)
```

- [ ] **Step 4: 在 `transcribe.py` 中把内置模型目录放到最高优先级，并收紧离线版错误**

```python
    def _resolve_model_path(self) -> Path:
        if self.config.bundled_model_dir is not None:
            try:
                return self._validate_model_dir(self.config.bundled_model_dir)
            except RuntimeError as error:
                if self.config.bundled_model_required:
                    raise RuntimeError(
                        f"Bundled model is required for {self.config.distribution_variant}: {error}"
                    ) from error

        configured = Path(self.config.model_name).expanduser()
        if configured.exists():
            return self._validate_model_dir(configured)

        repo_id = self._repo_id_for_model(self.config.model_name)
        snapshot_dir = self._try_resolve_snapshot_dir(repo_id)
        if snapshot_dir is not None:
            return snapshot_dir

        if self.config.bundled_model_required:
            raise RuntimeError(
                f"Bundled model is required for {self.config.distribution_variant} but no valid model was found at {self.config.bundled_model_dir}"
            )

        managed_dir = (
            self.config.model_cache_dir / "managed" / repo_id.replace("/", "--")
        )
        self._ensure_model_files(repo_id, managed_dir)
        return self._validate_model_dir(managed_dir)
```

- [ ] **Step 5: 跑回归测试，确认缓存逻辑仍可用且离线语义生效**

Run: `$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_model_cache_paths.py -v`
Expected: PASS

- [ ] **Step 6: 再跑一次基础健康检查，确认桌面到引擎的配置链路未坏**

Run: `npm run engine:health`
Expected: 退出码 `0`，输出 JSON 中 `ok` 为 `true`

- [ ] **Step 7: 提交 Python 侧显式模型解析变更**

```bash
git add engine/python/radio_to_text/config.py engine/python/radio_to_text/transcribe.py engine/python/tests/test_model_cache_paths.py
git commit -m "收紧离线模型解析语义"
```

### Task 3: 新增 offline-small 分发构建脚本

**Files:**
- Create: `app/desktop/scripts/build-distribution-lib.js`
- Create: `app/desktop/scripts/__tests__/build-distribution-lib.test.js`
- Create: `app/desktop/scripts/build-distribution.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `dist-python/engine/engine.exe`, `cache/models`, `RTT_BUNDLE_MODEL_SOURCE_SMALL`
- Produces: `resolveOfflineSmallModelSource(options = {}) -> string`
- Produces: `validateBundledModelDir(modelDir) -> void`
- Produces: `writeDistributionManifest(targetDir, manifest) -> string`
- Produces: `npm run dist:offline:small`

- [ ] **Step 1: 先写构建辅助单测，锁定模型目录校验和发行清单生成格式**

```js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  validateBundledModelDir,
  writeDistributionManifest
} = require("../build-distribution-lib");

test("validateBundledModelDir accepts a complete faster-whisper model directory", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-offline-small-"));
  const modelDir = path.join(tempRoot, "small");
  await fs.mkdir(modelDir, { recursive: true });
  for (const [name, value] of [
    ["config.json", "{}"],
    ["tokenizer.json", "{}"],
    ["vocabulary.txt", "token"],
    ["model.bin", Buffer.from("model")]
  ]) {
    await fs.writeFile(path.join(modelDir, name), value);
  }

  await assert.doesNotReject(() => validateBundledModelDir(modelDir));
});

test("writeDistributionManifest writes offline-small metadata with relative bundled path", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-offline-small-"));
  const manifestPath = await writeDistributionManifest(tempRoot, {
    variant: "offline-small",
    bundledModelName: "small",
    bundledModelRelativePath: "models/small",
    bundledModelRequired: true
  });
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  assert.equal(manifest.variant, "offline-small");
  assert.equal(manifest.bundledModelRelativePath, "models/small");
  assert.equal(manifest.bundledModelRequired, true);
});
```

- [ ] **Step 2: 运行测试，确认它先失败**

Run: `node --test app/desktop/scripts/__tests__/build-distribution-lib.test.js`
Expected: FAIL，报 `Cannot find module '../build-distribution-lib'`

- [ ] **Step 3: 实现构建辅助库，负责模型来源解析、目录校验和发行清单写入**

```js
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");

const REQUIRED_MODEL_FILES = ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"];

async function validateBundledModelDir(modelDir) {
  for (const name of REQUIRED_MODEL_FILES) {
    const filePath = path.join(modelDir, name);
    try {
      await fs.access(filePath);
    } catch (_error) {
      throw new Error(`Bundled model directory is incomplete: missing ${name} in ${modelDir}`);
    }
  }
}

async function writeDistributionManifest(targetRoot, manifest) {
  const manifestDir = path.join(targetRoot, "distribution");
  const manifestPath = path.join(manifestDir, "manifest.json");
  await fs.mkdir(manifestDir, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifestPath;
}

function resolveOfflineSmallModelSource(options = {}) {
  if (options.explicitModelSource) {
    return path.resolve(options.explicitModelSource);
  }

  const managedDir = path.resolve(
    options.projectRoot,
    "cache",
    "models",
    "managed",
    "Systran--faster-whisper-small"
  );

  if (fsSync.existsSync(path.join(managedDir, "model.bin"))) {
    return managedDir;
  }

  const snapshotsRoot = path.resolve(
    options.projectRoot,
    "cache",
    "models",
    "models--Systran--faster-whisper-small",
    "snapshots"
  );
  if (!fsSync.existsSync(snapshotsRoot)) {
    return managedDir;
  }

  const revisions = fsSync
    .readdirSync(snapshotsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(snapshotsRoot, entry.name))
    .sort()
    .reverse();

  return revisions[0] || managedDir;
}

module.exports = {
  REQUIRED_MODEL_FILES,
  resolveOfflineSmallModelSource,
  validateBundledModelDir,
  writeDistributionManifest
};
```

- [ ] **Step 4: 新建 `build-distribution.js`，生成 `offline-small` 变体并把额外资源挂给 `electron-builder`**

```js
const fs = require("fs/promises");
const path = require("path");
const { build, Platform } = require("electron-builder");
const packageJson = require("../../../package.json");
const {
  resolveOfflineSmallModelSource,
  validateBundledModelDir,
  writeDistributionManifest
} = require("./build-distribution-lib");

async function main() {
  const projectRoot = path.resolve(__dirname, "../../..");
  const outputDir = path.join(projectRoot, "release", "offline-small");
  const stagingRoot = path.join(projectRoot, "build", "distribution", "offline-small");
  const stagedModelDir = path.join(stagingRoot, "models", "small");
  const enginePath = path.join(projectRoot, "dist-python", "engine", "engine.exe");
  const modelSource = resolveOfflineSmallModelSource({
    projectRoot,
    explicitModelSource: process.env.RTT_BUNDLE_MODEL_SOURCE_SMALL
  });

  await fs.access(enginePath);
  await validateBundledModelDir(modelSource);
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(stagedModelDir), { recursive: true });
  await fs.cp(modelSource, stagedModelDir, { recursive: true });

  await writeDistributionManifest(stagingRoot, {
    variant: "offline-small",
    bundledModelName: "small",
    bundledModelRelativePath: "models/small",
    bundledModelRequired: true
  });

  await build({
    targets: Platform.WINDOWS.createTarget(["nsis", "portable"]),
    config: {
      ...packageJson.build,
      directories: {
        ...(packageJson.build.directories || {}),
        output: outputDir
      },
      artifactName: "radio-to-text-${version}-offline-small-${arch}.${ext}",
      extraResources: [
        ...(packageJson.build.extraResources || []),
        { from: stagedModelDir, to: "models/small" },
        { from: path.join(stagingRoot, "distribution"), to: "distribution" }
      ]
    }
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 5: 在 `package.json` 中增加显式分发命令**

```json
"dist:offline:small": "npm run build:web && npm run build:engine && npm run build:engine:verify && node app/desktop/scripts/build-distribution.js"
```

- [ ] **Step 6: 运行单测和构建命令，确认离线包结构正确**

Run: `node --test app/desktop/scripts/__tests__/build-distribution-lib.test.js`
Expected: PASS

Run: `npm run dist:offline:small`
Expected: 退出码 `0`，生成 `release/offline-small/win-unpacked/resources/models/small/model.bin`，并生成文件名包含 `offline-small` 的安装产物

- [ ] **Step 7: 提交离线分发构建脚本**

```bash
git add app/desktop/scripts/build-distribution-lib.js app/desktop/scripts/__tests__/build-distribution-lib.test.js app/desktop/scripts/build-distribution.js package.json
git commit -m "增加 offline-small 打包脚本"
```

### Task 4: 增加 offline-small 离线验证脚本

**Files:**
- Create: `app/desktop/scripts/verify-offline-distribution.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `runEngineRequest(request, { runtimePaths })`, `tools/sample-meeting.wav`, `release/offline-small/win-unpacked`
- Produces: `verifyOfflineDistribution({ unpackedDir, sampleAudioPath }) -> Promise<void>`
- Produces: `npm run dist:offline:small:verify`

- [ ] **Step 1: 先写验证脚本，要求同时检查资源布局和样例转写**

```js
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { runEngineRequest } = require("../lib/python-engine");

async function verifyOfflineDistribution(unpackedDir, sampleAudioPath) {
  const resourcesDir = path.join(unpackedDir, "resources");
  const modelDir = path.join(resourcesDir, "models", "small");
  const manifestPath = path.join(resourcesDir, "distribution", "manifest.json");

  await fs.access(path.join(resourcesDir, "engine", "engine.exe"));
  await fs.access(path.join(modelDir, "config.json"));
  await fs.access(path.join(modelDir, "tokenizer.json"));
  await fs.access(path.join(modelDir, "vocabulary.txt"));
  await fs.access(path.join(modelDir, "model.bin"));
  await fs.access(manifestPath);

  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtt-offline-small-run-"));
  const imported = await runEngineRequest(
    {
      action: "import_audio",
      payload: { sourcePath: sampleAudioPath }
    },
    {
      runtimePaths: {
        isPackaged: true,
        rootDir: runtimeRoot,
        tasksDir: path.join(runtimeRoot, "tasks"),
        logsDir: path.join(runtimeRoot, "logs"),
        cacheRootDir: path.join(runtimeRoot, "cache"),
        modelCacheDir: path.join(runtimeRoot, "cache", "models"),
        huggingfaceHomeDir: path.join(runtimeRoot, "cache", "huggingface"),
        engineEntry: path.join(resourcesDir, "engine", "engine.exe"),
        distributionVariant: "offline-small",
        bundledModelName: "small",
        bundledModelDir: modelDir,
        bundledModelRequired: true
      }
    }
  );

  await runEngineRequest(
    {
      action: "process_task",
      payload: { taskId: imported.data.task.task_id }
    },
    {
      runtimePaths: {
        isPackaged: true,
        rootDir: runtimeRoot,
        tasksDir: path.join(runtimeRoot, "tasks"),
        logsDir: path.join(runtimeRoot, "logs"),
        cacheRootDir: path.join(runtimeRoot, "cache"),
        modelCacheDir: path.join(runtimeRoot, "cache", "models"),
        huggingfaceHomeDir: path.join(runtimeRoot, "cache", "huggingface"),
        engineEntry: path.join(resourcesDir, "engine", "engine.exe"),
        distributionVariant: "offline-small",
        bundledModelName: "small",
        bundledModelDir: modelDir,
        bundledModelRequired: true
      }
    }
  );
}
```

- [ ] **Step 2: 在脚本入口中固定默认路径，并把验证失败直接退出为非零状态**

```js
async function main() {
  const projectRoot = path.resolve(__dirname, "../../..");
  const unpackedDir = path.resolve(
    process.argv[2] || path.join(projectRoot, "release", "offline-small", "win-unpacked")
  );
  const sampleAudioPath = path.resolve(
    process.argv[3] || path.join(projectRoot, "tools", "sample-meeting.wav")
  );

  await verifyOfflineDistribution(unpackedDir, sampleAudioPath);
  console.log("offline-small verification passed");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 3: 在 `package.json` 中增加验证命令**

```json
"dist:offline:small:verify": "node app/desktop/scripts/verify-offline-distribution.js"
```

- [ ] **Step 4: 先构建，再跑离线验证，确认 unpacked 包能直接处理样例**

Run: `npm run dist:offline:small`
Expected: PASS，`release/offline-small/win-unpacked` 存在

Run: `npm run dist:offline:small:verify`
Expected: PASS，输出 `offline-small verification passed`

- [ ] **Step 5: 再跑桌面冒烟，确认普通 UI 启动链路未被离线分发改坏**

Run: `npm run smoke`
Expected: PASS

- [ ] **Step 6: 提交离线验证脚本**

```bash
git add app/desktop/scripts/verify-offline-distribution.js package.json
git commit -m "补充分发离线验证脚本"
```

### Task 5: 做最终回归并整理对外交付检查点

**Files:**
- Verify: `app/desktop/lib/distribution-manifest.js`
- Verify: `app/desktop/lib/runtime-paths.js`
- Verify: `app/desktop/lib/python-engine.js`
- Verify: `engine/python/radio_to_text/config.py`
- Verify: `engine/python/radio_to_text/transcribe.py`
- Verify: `app/desktop/scripts/build-distribution.js`
- Verify: `app/desktop/scripts/verify-offline-distribution.js`

**Interfaces:**
- Consumes: `node --test`, `python -m unittest`, `npm run engine:health`, `npm run dist:offline:small`, `npm run dist:offline:small:verify`, `npm run smoke`
- Produces: 一条可重复执行的 `offline-small` 分发与验证流水线

- [ ] **Step 1: 跑完 Node 侧单测**

Run: `node --test app/desktop/lib/__tests__/distribution-manifest.test.js app/desktop/scripts/__tests__/build-distribution-lib.test.js`
Expected: PASS

- [ ] **Step 2: 跑完 Python 侧模型路径单测**

Run: `$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_model_cache_paths.py -v`
Expected: PASS

- [ ] **Step 3: 跑引擎健康检查与桌面冒烟**

Run: `npm run engine:health`
Expected: PASS

Run: `npm run smoke`
Expected: PASS

- [ ] **Step 4: 构建并验证正式离线包**

Run: `npm run dist:offline:small`
Expected: PASS，产物目录为 `release/offline-small`

Run: `npm run dist:offline:small:verify`
Expected: PASS，样例音频在空缓存临时目录下也能完成转写

- [ ] **Step 5: 查看最终差异，确认只包含本计划范围**

Run: `git diff --stat HEAD~4..HEAD`
Expected: 仅包含运行时路径、Python 模型解析、打包脚本、验证脚本、测试和 `package.json` 变更

- [ ] **Step 6: 汇总对外交付检查点，写入发版说明或 PR 描述**

```text
- 默认交付命令：npm run dist:offline:small
- 默认产物目录：release/offline-small
- 默认模型位置：resources/models/small
- 离线验证命令：npm run dist:offline:small:verify
- 破坏性检查：删除 resources/models/small/model.bin 后，offline-small 必须报资源缺失，不得转为下载
```

- [ ] **Step 7: 记录最终验证结论，准备进入正式交付或 PR 审查**

```text
- Node 单测：通过
- Python 单测：通过
- engine:health：通过
- smoke：通过
- dist:offline:small：通过
- dist:offline:small:verify：通过
```
