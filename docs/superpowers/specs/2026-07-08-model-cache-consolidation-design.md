# 模型缓存收拢到项目目录设计

## 概述

当前项目的转写模型主缓存目录已经约定为仓库内的 `cache/models`，但本机上仍存在一份用户级 Hugging Face 缓存：

- `E:\ai-list\radio-to-text\cache\models\models--Systran--faster-whisper-small`
- `C:\Users\Administrator\.cache\huggingface\hub\models--Systran--faster-whisper-small`

这会带来两个问题：

- 模型磁盘占用重复，且实际使用路径不够直观。
- 后续引入更多语音模型时，下载位置可能继续分散到项目目录外。

本设计的目标是把现有和后续的语音模型统一收拢到当前项目目录内，并让开发态、桌面态和后续模型下载都遵循同一套缓存约定。

## 目标

- 把当前机器上的外部语音模型副本迁回项目目录。
- 统一项目内模型根目录为 `E:\ai-list\radio-to-text\cache\models`。
- 后续下载 `small`、`medium` 或其他 Whisper 相关模型时，默认都只落到项目目录内。
- 保持现有转写链路兼容，不要求用户手工指定模型路径。
- 在发现重复模型时避免重复复制和重复占用。

## 非目标

- 本次不改变转写参数、模型格式或模型供应商。
- 本次不引入新的模型管理 UI。
- 本次不处理非语音模型资源。
- 本次不把离线分发资源目录和运行期缓存目录合并为同一路径。

## 推荐方案

推荐采用“项目内单一模型根目录 + 启动时固定第三方缓存环境变量 + 一次性迁移外部副本”的方案。

原因如下：

- 现有代码已经通过 `RTT_MODEL_CACHE_DIR` 把主缓存目录指向项目内，改动成本低。
- 单靠业务层自己的 `RTT_MODEL_CACHE_DIR` 不足以约束所有第三方依赖；未来如果 `huggingface_hub`、`transformers` 或其他语音依赖直接读默认环境变量，仍可能回落到用户目录。
- 先迁移现有模型，再补默认环境变量，能同时解决“历史遗留副本”和“未来继续写散”的问题。

## 目录约定

项目内统一模型根目录保持为：

```text
E:\ai-list\radio-to-text\cache\models
```

在该目录下，保留两类子结构：

- `models--<repo-id>/snapshots/<revision>/...`
- `managed/<repo-id>/...`

约定如下：

- 优先保留完整的 Hugging Face 快照目录，因为它与上游缓存结构兼容，便于后续识别已有模型。
- `managed/` 继续作为当前项目的受控目录，用于现有按文件下载的兼容逻辑。
- 后续所有自动下载的语音模型，不论由当前项目代码还是 Hugging Face 相关依赖触发，都必须写到这个项目内根目录。

## 运行时环境约束

Electron 启动 Python 引擎时，除了现有：

- `RTT_ROOT_DIR`
- `RTT_TASKS_DIR`
- `RTT_LOG_DIR`
- `RTT_MODEL_CACHE_DIR`

还应显式注入至少以下环境变量到项目目录：

- `HF_HOME=<project>/cache/huggingface`
- `HUGGINGFACE_HUB_CACHE=<project>/cache/models`
- `TRANSFORMERS_CACHE=<project>/cache/models`
- `XDG_CACHE_HOME=<project>/cache`

设计原则：

- `HUGGINGFACE_HUB_CACHE` 直接指向 `cache/models`，确保 Hub 快照目录落在项目内。
- `HF_HOME` 和 `XDG_CACHE_HOME` 一并指向项目内，避免部分依赖绕过 Hub 缓存变量后仍回写到用户主目录。
- 如果未来引入额外语音模型依赖，需要优先复用这组变量，而不是各自再写新的用户目录默认值。

## 模型解析与下载行为

运行时模型解析顺序保持现有语义，但目录范围收紧为项目内：

1. 如果 `RTT_ASR_MODEL` 是一个已存在的本地路径，继续按显式路径加载。
2. 如果 `RTT_ASR_MODEL` 是模型名或 repo id，优先在项目内 `cache/models/models--.../snapshots/...` 中查找完整快照。
3. 如果快照不存在，则在项目内 `cache/models/managed/...` 中查找或下载所需文件。
4. 不再把用户目录下已有缓存作为常规运行时搜索路径。

这样可以保证：

- 显式路径能力不丢失。
- 默认模型名解析继续兼容当前实现。
- 后续下载的新模型仍会被收拢到项目目录。
- 用户目录中的历史缓存即使残留，也不会再成为默认运行依赖。

## 迁移策略

新增一个一次性迁移入口，例如 `tools/migrate-model-cache.js`，负责把已知外部模型归拢回项目目录。

迁移范围至少包括：

- `C:\Users\Administrator\.cache\huggingface\hub\models--*`
- 未来通过环境变量可泛化到当前登录用户的 Hugging Face 默认缓存根目录

迁移步骤：

1. 扫描外部缓存根目录下的 `models--*` 目录。
2. 对每个模型目录判断项目内是否已存在同名完整目录。
3. 如果项目内不存在，则把该目录完整迁移到 `E:\ai-list\radio-to-text\cache\models\`。
4. 如果项目内已存在且完整，则不覆盖项目内目录，只删除外部重复副本。
5. 迁移完成后输出处理结果：已迁移、已跳过、已删除、失败。

完整性的判断标准至少包括：

- 目录存在
- 至少有一个 `snapshots/<revision>/model.bin`
- 同一快照下同时存在 `config.json`、`tokenizer.json`、`vocabulary.txt`

对于当前已发现的 `Systran/faster-whisper-small`，因为项目内已经存在完整副本，迁移工具应直接把外部重复副本删除，而不是重复复制。

## 错误处理

迁移与运行时都应给出明确错误，而不是静默回退。

迁移阶段：

- 外部目录不存在：直接跳过并记录。
- 项目内目录不完整：视为异常，拒绝删除外部副本。
- 移动失败：保留外部目录，报告失败原因。

运行阶段：

- 项目内目标模型不存在且下载失败：维持现有错误返回。
- 发现模型目录存在但关键文件缺失：直接报“模型目录不完整”，不要继续尝试使用该目录。

## 测试与验收标准

本设计落地后，至少应满足以下验收标准：

- 项目启动时传给 Python 引擎的模型相关缓存环境变量全部指向项目目录。
- 运行一次 `small` 模型转写后，不会在 `C:\Users\Administrator\.cache\huggingface\hub` 新增模型目录。
- 运行迁移脚本后，用户目录中的 `models--Systran--faster-whisper-small` 被清理，项目内完整模型仍可用。
- 当后续切换到 `medium` 或其他 `Systran/faster-whisper-*` 模型时，新下载模型默认落到 `E:\ai-list\radio-to-text\cache\models`。
- `npm run engine:health` 可以通过。

建议的验证顺序：

1. 先执行迁移脚本，确认外部重复副本被归拢或删除。
2. 再运行引擎健康检查，确认项目内模型可正常解析。
3. 最后在需要下载新模型的场景下验证新增模型是否仍写入项目目录。

## 风险与后续

当前主要风险：

- 某些第三方库未来可能新增新的缓存环境变量约定，现有变量覆盖不一定永远完整。
- 如果项目目录被整体移动到其他盘符，历史显式路径配置可能失效，但这不影响默认缓存方案。
- 后续若同时支持离线内置模型和运行期缓存模型，需要继续保持“分发资源目录”和“项目缓存目录”语义分离。

建议的后续顺序：

1. 先补运行时环境变量约束。
2. 再补迁移脚本并执行一次本机迁移。
3. 最后增加一条脚本化验证，防止后续改动重新把模型写回用户目录。
