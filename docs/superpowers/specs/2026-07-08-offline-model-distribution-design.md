# 离线模型多版本分发设计

## 概述

当前项目已经具备 `electron-builder + PyInstaller` 的 Windows 打包能力，但仍只有一套分发形态：Electron 壳层随包分发，Whisper 模型在首次转写时下载到本地缓存。这个方案适合开发和内部试用，不适合同时覆盖轻量试发、离线交付和高精度离线交付三类场景。

本设计的目标是在不改动现有主业务链路的前提下，为 Windows 分发增加三个明确变体：

- `lite`：不内置模型，首次转写时沿用现有在线下载逻辑。
- `offline-small`：内置 `small` 模型，安装后可离线完成转写。
- `offline-medium`：内置 `medium` 模型，安装后可离线完成更高精度转写。

## 目标

- 为分发流程提供一个显式构建入口，而不是继续堆叠在 `package.json` 长命令中。
- 生成 `lite`、`offline-small`、`offline-medium` 三种明确命名的 Windows 产物。
- 保持现有 Python 引擎打包流程不变，继续复用 `dist-python/engine/engine.exe`。
- 让运行时能够优先使用安装包内置模型，同时保留显式环境变量覆盖能力。
- 避免把内置模型目录和用户模型缓存目录混在一起。

## 非目标

- 本次不实现 macOS 或 Linux 分发。
- 本次不引入自动更新、签名或增量更新策略。
- 本次不改变 ASR 推理参数、模型格式或现有转写协议。
- 本次不把模型下载逻辑迁移到 Electron 层。

## 推荐方案

推荐新增一个显式分发构建脚本，例如 `app/desktop/scripts/build-distribution.js`，由它统一编排 Python 引擎校验、模型资源准备、临时 `electron-builder` 配置生成和最终打包。

原因如下：

- 三个分发变体已经不是简单的“多一个 npm 命令”，而是明确的构建矩阵。
- 继续把条件逻辑堆在 `package.json` 中会让命令、输出目录、资源规则和错误处理越来越难维护。
- 维护三份独立 `electron-builder` 配置文件虽然直观，但重复项过多，后续改 `productName`、图标、目标类型或资源规则时容易漏改。

## 构建入口与产物结构

新增单一构建脚本作为分发入口，输入参数至少包括：

- `targetVariant`：`lite` / `offline-small` / `offline-medium`
- `targets`：默认 `nsis`，可选附带 `portable`
- `clean`：是否清理当前变体输出目录

对应 npm 命令保持直接和稳定：

- `npm run dist:lite`
- `npm run dist:offline:small`
- `npm run dist:offline:medium`

统一输出到按变体隔离的目录，例如：

```text
release/
  lite/
  offline-small/
  offline-medium/
```

产物文件名必须带变体标识，避免覆盖和误发，例如：

- `radio-to-text-0.1.0-lite-setup.exe`
- `radio-to-text-0.1.0-offline-small-setup.exe`
- `radio-to-text-0.1.0-offline-medium-setup.exe`
- `radio-to-text-0.1.0-offline-small-portable.exe`

## 配置复用策略

只保留一份基础 `electron-builder` 公共配置，公共项继续放在 `package.json` 或单独基础配置文件中，包括：

- `appId`
- `productName`
- `files`
- `win.target`
- `nsis`
- Python 引擎的 `extraResources`

分发脚本在运行时按变体动态覆盖以下字段：

- `directories.output`
- `artifactName`
- 当前变体需要追加的 `extraResources`
- 必要时的构建元数据标识

这样可以把“应用公共配置”和“分发差异配置”明确分开，减少重复维护。

## 模型资源布局

内置模型和用户缓存模型必须使用不同目录，不共享路径。

构建阶段的中间目录建议为：

```text
build/distribution/models/
  small/
  medium/
```

打包后的资源目录建议为：

```text
resources/
  engine/
  models/
    small/
    medium/
```

规则如下：

- `lite` 不包含任何 `resources/models/*`。
- `offline-small` 仅包含 `resources/models/small/*`。
- `offline-medium` 仅包含 `resources/models/medium/*`。

这样可以让安装包语义清晰，也能避免后续版本升级时与用户缓存目录相互污染。

## 运行时模型选择策略

运行时模型解析顺序定义为：

1. 如果显式设置了 `RTT_ASR_MODEL`，优先使用该值。
2. 如果未设置 `RTT_ASR_MODEL`，且安装包资源目录中存在当前版本内置模型，则优先使用内置模型路径。
3. 如果没有内置模型，则继续尝试当前 `cache/models` 下的用户缓存模型。
4. 如果缓存模型也不存在，再走现有在线下载逻辑。

这一顺序满足三类需求：

- 开发和部署人员仍可通过环境变量强制指定模型。
- 离线包可以稳定兑现“安装后离线可用”的承诺。
- `lite` 版继续保留当前轻量分发行为。

对于 `offline-small` 和 `offline-medium`，如果运行时按版本声明应该存在内置模型，但实际资源缺失，应直接报错并提示分发产物损坏，而不是静默回退到联网下载。这样能保持版本语义稳定，避免“离线包实际上仍依赖联网”的隐性问题。

## 模型准备与校验策略

分发脚本不负责在打包过程中联网下载模型，而是只消费本机已经准备好的模型目录。模型来源约定如下：

- 如果显式设置了 `RTT_BUNDLE_MODEL_SOURCE_SMALL` 或 `RTT_BUNDLE_MODEL_SOURCE_MEDIUM`，优先使用对应目录。
- 如果未显式设置，则默认从当前仓库运行期缓存目录中查找：
  - `cache/models/managed/Systran--faster-whisper-small`
  - `cache/models/managed/Systran--faster-whisper-medium`
- 如果默认目录不存在，再尝试 `cache/models/models--Systran--faster-whisper-<name>/snapshots/<latest>/` 中最新且完整的快照目录。

也就是说：

- `lite` 构建不要求本地存在模型。
- `offline-small` 构建前，机器上必须已有完整 `small` 模型。
- `offline-medium` 构建前，机器上必须已有完整 `medium` 模型。

脚本对离线模型至少执行以下完整性校验：

- `config.json`
- `tokenizer.json`
- `vocabulary.txt`
- `model.bin`

如果任一文件缺失，脚本必须立刻失败，并明确输出缺失目录或缺失文件名，不继续进入 `electron-builder`。

## 构建失败策略

所有变体共有的失败条件：

- `dist-python/engine/engine.exe` 不存在
- `electron-builder` 执行失败
- 输出目录清理失败或构建时配置生成失败

仅离线变体额外覆盖：

- 对应模型目录不存在
- 模型文件不完整
- 模型复制到中间目录失败

错误输出必须直接指向问题源，而不是只返回“打包失败”。例如：

- 缺少 `dist-python/engine/engine.exe`
- 缺少 `offline-medium` 所需的 `model.bin`
- 无法复制 `small` 模型到 `build/distribution/models/small`

## 运行时错误处理

`lite` 版沿用当前行为：

- 没有本地模型时，允许进入在线下载逻辑。
- 下载失败时提示用户并保留现有错误处理路径。

`offline-small` 和 `offline-medium` 行为收紧：

- 如果本应存在的内置模型目录缺失，视为安装包资源损坏。
- 不再回退到在线下载。
- 错误信息中应明确说明当前版本期望的内置模型名称和缺失路径。

## 测试与验收标准

本次设计落地后，至少需要满足以下验收标准：

- `npm run dist:lite` 可以生成 Lite 安装包。
- `npm run dist:offline:small` 可以生成带 `small` 模型的离线包。
- `npm run dist:offline:medium` 可以生成带 `medium` 模型的离线包。
- 三个变体的输出目录和产物命名互不冲突。
- `lite` 在无模型缓存时仍可通过联网下载完成首次转写。
- `offline-small` 在断网环境下可以直接完成 `small` 模型转写。
- `offline-medium` 在断网环境下可以直接完成 `medium` 模型转写。
- 显式设置 `RTT_ASR_MODEL` 时，仍然可以覆盖默认模型选择结果。

建议的验证顺序为：

1. 先校验 `engine.exe` 构建成功。
2. 分别构建三个分发变体。
3. 在全新用户数据目录下验证 `lite` 首次联网下载行为。
4. 在断网环境下验证 `offline-small` 和 `offline-medium` 的离线可用性。

## 风险与后续

当前主要风险：

- `medium` 离线包体积较大，分发和存储成本明显高于 `small`。
- 如果模型来源目录约定不清晰，离线构建很容易因路径不一致失败。
- 后续引入代码签名时，三种产物都需要纳入同一条签名流程。

建议的后续顺序：

1. 先实现显式构建脚本和三种变体的命名、输出隔离。
2. 再实现运行时内置模型优先级。
3. 最后补充离线变体的验证脚本或 smoke 流程，确保每次发版都能稳定复现。
