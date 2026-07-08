# 模型缓存收拢到项目目录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有和后续语音模型统一收拢到项目内 `cache/models`，并清理当前用户目录中的重复模型副本。

**Architecture:** 运行时继续以 `RTT_MODEL_CACHE_DIR` 为项目主缓存目录，同时在 Electron 启动 Python 引擎时显式注入 Hugging Face 相关缓存环境变量，封死第三方库回落到用户目录的入口。额外增加一个一次性迁移脚本，用于扫描外部默认缓存根目录，把已存在模型迁回项目目录或删除项目内已有的重复副本。

**Tech Stack:** Electron, Node.js, Python 3.12, PowerShell, `unittest`, 现有 `npm` 脚本

## Global Constraints

- 统一项目内模型根目录为 `E:\ai-list\radio-to-text\cache\models`
- 后续 `small`、`medium` 或其他 `Systran/faster-whisper-*` 模型默认都只允许落到项目目录内
- 不改变现有 `RTT_ASR_MODEL` 显式路径优先级
- 不依赖用户手工迁移模型
- 发现项目内已存在完整模型时，不重复复制外部副本
- 迁移失败时保留外部模型，避免误删

---

### Task 1: 固定运行时模型缓存环境变量

**Files:**
- Modify: `app/desktop/lib/runtime-paths.js`
- Modify: `app/desktop/lib/python-engine.js`

**Interfaces:**
- Consumes: `getRuntimePaths(options = {}) -> { rootDir, tasksDir, logsDir, modelCacheDir, engineEntry }`
- Produces: `getRuntimePaths()` 额外返回项目内 Hugging Face 缓存路径；`runEngineRequest()` 启动 Python 时把模型相关缓存环境变量全部指向项目目录

- [ ] **Step 1: 在 `runtime-paths.js` 中为项目内 Hugging Face 缓存补充路径字段**

```js
  const cacheRootDir = resolvePathOverride(
    "RTT_CACHE_ROOT_DIR",
    path.join(rootDir, "cache")
  );
  const huggingfaceHomeDir = resolvePathOverride(
    "HF_HOME",
    path.join(cacheRootDir, "huggingface")
  );

  return {
    isPackaged,
    rootDir,
    tasksDir,
    logsDir,
    cacheRootDir,
    modelCacheDir,
    huggingfaceHomeDir,
    engineEntry
  };
```

- [ ] **Step 2: 把新增缓存目录加入 `ensureRuntimeDirs()`**

```js
  for (const target of [
    runtimePaths.rootDir,
    runtimePaths.tasksDir,
    runtimePaths.logsDir,
    runtimePaths.cacheRootDir,
    runtimePaths.modelCacheDir,
    runtimePaths.huggingfaceHomeDir
  ]) {
    fs.mkdirSync(target, { recursive: true });
  }
```

- [ ] **Step 3: 在 `python-engine.js` 中统一注入第三方缓存环境变量**

```js
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        RTT_ROOT_DIR: runtimePaths.rootDir,
        RTT_TASKS_DIR: runtimePaths.tasksDir,
        RTT_LOG_DIR: runtimePaths.logsDir,
        RTT_MODEL_CACHE_DIR: runtimePaths.modelCacheDir,
        RTT_CACHE_ROOT_DIR: runtimePaths.cacheRootDir,
        HF_HOME: runtimePaths.huggingfaceHomeDir,
        HUGGINGFACE_HUB_CACHE: runtimePaths.modelCacheDir,
        TRANSFORMERS_CACHE: runtimePaths.modelCacheDir,
        XDG_CACHE_HOME: runtimePaths.cacheRootDir
      }
```

- [ ] **Step 4: 运行健康检查，确认修改没有破坏引擎启动**

Run: `npm run engine:health`
Expected: 退出码 `0`，输出包含配置路径和 `ok: true`

### Task 2: 收紧 Python 侧模型目录解析并补测试

**Files:**
- Modify: `engine/python/radio_to_text/config.py`
- Modify: `engine/python/radio_to_text/transcribe.py`
- Create: `engine/python/tests/test_model_cache_paths.py`

**Interfaces:**
- Consumes: `load_config() -> EngineConfig`, `Transcriber._resolve_model_path() -> Path`
- Produces: Python 配置能读到项目内缓存根目录；模型解析仅在项目内快照和项目内 managed 目录之间切换

- [ ] **Step 1: 在 `EngineConfig` 中增加缓存根目录与 Hugging Face 目录字段**

```python
@dataclass(frozen=True)
class EngineConfig:
    root_dir: Path
    tasks_dir: Path
    logs_dir: Path
    cache_root_dir: Path
    model_cache_dir: Path
    huggingface_home_dir: Path
```

- [ ] **Step 2: 在 `load_config()` 中计算并创建这些目录**

```python
    cache_root_dir = resolve_path_env("RTT_CACHE_ROOT_DIR", root_dir / "cache")
    model_cache_dir = resolve_path_env(
        "RTT_MODEL_CACHE_DIR", cache_root_dir / "models"
    )
    huggingface_home_dir = resolve_path_env("HF_HOME", cache_root_dir / "huggingface")

    for directory in (
        root_dir,
        tasks_dir,
        logs_dir,
        cache_root_dir,
        model_cache_dir,
        huggingface_home_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 3: 补单测，确认默认配置目录都落在项目内 `cache/`**

```python
def test_load_config_defaults_cache_dirs_under_project_root(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        root = Path(temp_dir)
        with patch.dict(
            os.environ,
            {
                "RTT_ROOT_DIR": str(root),
            },
            clear=False,
        ):
            config = load_config()

        self.assertEqual(config.cache_root_dir, root / "cache")
        self.assertEqual(config.model_cache_dir, root / "cache" / "models")
        self.assertEqual(config.huggingface_home_dir, root / "cache" / "huggingface")
```

- [ ] **Step 4: 再补单测，确认 `Transcriber` 优先读取项目内快照目录**

```python
def test_resolve_model_path_prefers_project_snapshot_cache(self) -> None:
    snapshot_dir = (
        root / "cache" / "models" / "models--Systran--faster-whisper-small"
        / "snapshots" / "test-rev"
    )
    for name in ("config.json", "tokenizer.json", "vocabulary.txt", "model.bin"):
        (snapshot_dir / name).parent.mkdir(parents=True, exist_ok=True)
        (snapshot_dir / name).write_text("x", encoding="utf-8")

    transcriber = Transcriber(config)
    self.assertEqual(transcriber._resolve_model_path(), snapshot_dir)
```

- [ ] **Step 5: 运行 Python 单测**

Run: `$env:PYTHONPATH='engine/python'; python -m unittest engine/python/tests/test_model_cache_paths.py -v`
Expected: PASS

### Task 3: 实现模型缓存迁移脚本

**Files:**
- Create: `tools/migrate-model-cache.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: 项目内 `cache/models`，外部 Hugging Face 默认缓存根目录
- Produces: `npm run model:consolidate`，可把 `models--*` 外部模型迁到项目目录，或在项目内已有完整副本时删除外部重复目录

- [ ] **Step 1: 新建迁移脚本，扫描外部默认缓存根目录**

```js
const externalRoots = [
  path.join(os.homedir(), ".cache", "huggingface", "hub"),
  process.env.HUGGINGFACE_HUB_CACHE
].filter(Boolean);

for (const root of externalRoots) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const modelDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("models--"))
    .map((entry) => path.join(root, entry.name));
}
```

- [ ] **Step 2: 为目录完整性判断补 helper，只认包含完整快照的模型目录**

```js
async function hasCompleteSnapshot(modelDir) {
  const snapshotsDir = path.join(modelDir, "snapshots");
  if (!(await pathExists(snapshotsDir))) {
    return false;
  }
  const revisions = await fs.readdir(snapshotsDir, { withFileTypes: true });
  for (const revision of revisions) {
    if (!revision.isDirectory()) {
      continue;
    }
    const candidate = path.join(snapshotsDir, revision.name);
    const required = ["config.json", "tokenizer.json", "vocabulary.txt", "model.bin"];
    const ok = await Promise.all(required.map((name) => pathExists(path.join(candidate, name))));
    if (ok.every(Boolean)) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 3: 实现迁移动作：项目内不存在则移动，已存在完整副本则删除外部重复目录**

```js
if (!(await pathExists(targetDir))) {
  await fs.rename(sourceDir, targetDir);
  summary.moved.push({ sourceDir, targetDir });
  continue;
}

if (!(await hasCompleteSnapshot(targetDir))) {
  summary.failed.push({ sourceDir, reason: "target incomplete" });
  continue;
}

await fs.rm(sourceDir, { recursive: true, force: true });
summary.deletedDuplicates.push(sourceDir);
```

- [ ] **Step 4: 在 `package.json` 增加命令入口**

```json
"model:consolidate": "node tools/migrate-model-cache.js"
```

- [ ] **Step 5: 运行脚本，确认它能打印迁移摘要**

Run: `npm run model:consolidate`
Expected: 输出包含 `moved`、`deletedDuplicates`、`failed` 之一

### Task 4: 实际迁移本机模型并做回归验证

**Files:**
- Verify: `app/desktop/lib/runtime-paths.js`
- Verify: `app/desktop/lib/python-engine.js`
- Verify: `engine/python/radio_to_text/config.py`
- Verify: `engine/python/radio_to_text/transcribe.py`
- Verify: `tools/migrate-model-cache.js`

**Interfaces:**
- Consumes: `npm run model:consolidate`, `npm run engine:health`
- Produces: 用户目录中不再保留重复模型副本；项目内模型仍可用；未来下载默认落在项目目录

- [ ] **Step 1: 执行迁移脚本，归拢现有外部模型**

Run: `npm run model:consolidate`
Expected: 当前 `C:\Users\Administrator\.cache\huggingface\hub\models--Systran--faster-whisper-small` 被识别为重复副本并删除

- [ ] **Step 2: 校验项目内模型目录仍存在完整模型**

Run: `Get-ChildItem E:\ai-list\radio-to-text\cache\models\models--Systran--faster-whisper-small -Recurse -File | Select-Object FullName`
Expected: 仍可见 `model.bin`

- [ ] **Step 3: 校验用户目录中该模型目录已消失**

Run: `Test-Path C:\Users\Administrator\.cache\huggingface\hub\models--Systran--faster-whisper-small`
Expected: `False`

- [ ] **Step 4: 再跑一次引擎健康检查**

Run: `npm run engine:health`
Expected: PASS

- [ ] **Step 5: 查看最终差异**

Run: `git diff --stat`
Expected: 仅包含计划内的运行时路径、引擎环境、Python 配置、迁移脚本、测试与文档变更
