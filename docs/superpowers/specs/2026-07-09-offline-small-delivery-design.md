# offline-small 默认交付设计

## 概述

当前仓库已经具备 Windows 桌面分发的两块基础能力：

- Electron 使用 `electron-builder` 生成安装版和 portable 版。
- Python 引擎使用 PyInstaller 打成 `dist-python/engine/engine.exe`，并作为 `extraResources` 随应用分发。

但当前模型链路仍以“运行时缓存 + 首次下载”为主。Electron 侧已经显式区分了 `process.resourcesPath` 与用户数据目录，Python 侧也已有缓存目录、快照目录和托管目录查找逻辑；缺少的是“内置模型作为正式交付资源”的路径约定、运行时优先级和错误语义。

本设计用于收敛第一阶段默认交付方案：先落地 `offline-small`，实现“用户安装后直接可用，不需要自己安装模型”。

## 目标

- 提供一个面向外部用户的默认交付包：`offline-small`。
- 安装包内同时包含 Electron、PyInstaller 引擎和 `small` 模型文件。
- 用户安装或解压后可直接转写，不依赖首次联网下载。
- 运行时通过固定资源目录解析内置模型，不依赖当前工作目录。
- 为后续增加 `offline-medium` 保留兼容扩展位，而不推翻第一阶段结构。

## 非目标

- 本次不实现 `medium` 版本的正式交付。
- 本次不设计自动更新、差分更新、签名或 CDN 分发。
- 本次不改变 ASR 推理参数、模型格式或下载协议。
- 本次不要求移除 `lite` 或现有下载逻辑，只要求把它们降级为非默认交付路径。

## 当前实现观察

基于当前代码，和本设计最相关的现状如下：

- [app/desktop/lib/runtime-paths.js](E:/ai-list/radio-to-text/app/desktop/lib/runtime-paths.js) 已经在打包模式下使用 `process.resourcesPath` 解析 `engine.exe`。
- [app/desktop/main.js](E:/ai-list/radio-to-text/app/desktop/main.js) 启动时会把 `isPackaged`、`userDataDir` 和 `resourcesPath` 传入运行时路径解析。
- [engine/python/radio_to_text/config.py](E:/ai-list/radio-to-text/engine/python/radio_to_text/config.py) 当前只显式管理模型缓存目录和 `RTT_ASR_MODEL`，还没有“内置模型目录”这一类配置。
- [engine/python/radio_to_text/transcribe.py](E:/ai-list/radio-to-text/engine/python/radio_to_text/transcribe.py) 当前模型查找顺序是：`RTT_ASR_MODEL` 指向现存目录时直接使用，否则按模型名查缓存快照，再落到托管目录下载。

因此，当前系统并不适合直接把模型丢在“程序根目录”后期待自动生效。第一阶段需要补的是：

- 一个固定的包内模型目录约定。
- 一条由桌面端主进程统一决策的模型路径注入链路。
- 离线版与 lite 版不同的错误处理语义。

## 推荐方案

第一阶段默认对外交付 `offline-small` 安装版，同时保留 `portable` 作为备用分发形态。

推荐理由：

- 安装版对普通用户最稳，目录结构、快捷方式、卸载行为都更完整。
- 模型文件体积较大时，安装版更容易维持资源路径一致性。
- 当前项目已有 `nsis` 和 `portable` 两种打包目标，扩展成本低。

分发策略定义为：

- 对外默认发 `offline-small` 安装版。
- 对内可保留 `offline-small portable` 作为试发和排障工具。
- `lite` 保留给开发、内部试用和特殊场景，不作为默认对外交付。
- 第二阶段再补 `offline-medium`，复用同一资源结构和路径解析策略。

## 包内资源布局

模型不应被定义为“放在根目录下供程序直接读取”，而应被定义为“放在固定资源目录下供程序按绝对路径读取”。

推荐的打包后布局如下：

```text
应用目录/
  radio-to-text.exe
  resources/
    engine/
      engine.exe
    models/
      small/
        config.json
        tokenizer.json
        vocabulary.txt
        model.bin
```

对应原则：

- Electron 和 Python 都不依赖当前工作目录。
- 运行时只认固定资源路径，例如 `resources/models/small`。
- `small` 和未来的 `medium` 从第一天起就分目录放置。

后续增加 `offline-medium` 时，仅需增加：

```text
resources/models/medium/
```

而不需要改变现有 `offline-small` 的目录规则。

## 运行时模型解析策略

推荐把“本次启动到底用哪个模型目录”收口到桌面端主进程决策，再通过环境变量或请求上下文传给 Python 引擎。

推荐顺序如下：

1. 如果显式设置了覆盖环境变量，优先使用覆盖值。
2. 如果当前发行版声明为 `offline-small`，优先解析包内 `resources/models/small`。
3. 如果当前发行版是 `lite`，继续沿用用户缓存目录查找与下载逻辑。
4. 只有 `lite` 允许在缺少本地模型时触发在线下载。

这里的关键点不是“始终使用 `RTT_ASR_MODEL=small`”，而是“把 `RTT_ASR_MODEL` 视为模型标识或显式覆盖入口，再引入一条独立的模型目录注入能力”。否则仅设置模型名无法区分“要去缓存里找”还是“要去安装包资源里找”。

第一阶段建议新增一个显式模型目录环境变量，例如：

- `RTT_ASR_MODEL_DIR`

语义定义为：

- 设置后，Python 侧直接把它当成待校验的模型目录使用。
- 未设置时，才回落到现有的“模型名 -> 缓存/下载”逻辑。

这样可以把“选择哪种模型”和“模型文件放在哪里”明确拆开，后续扩展更稳定。

## 离线版错误语义

`offline-small` 既然对外承诺“安装后直接可用”，就不能在内置模型缺失时静默回退到联网下载。

因此推荐定义：

- `offline-small` 启动时如果声明要使用内置 `small` 模型，但目录不存在或文件不完整，应直接报“安装包资源缺失或已损坏”。
- 错误信息需要明确指出期望目录和缺失文件名。
- 不允许静默回退到缓存模型或在线下载，避免离线交付语义失真。

而 `lite` 的行为继续保持宽松：

- 优先使用已有缓存。
- 没有缓存时允许下载。
- 下载失败时保留当前错误处理路径。

## 构建与校验要求

第一阶段建议把 `offline-small` 视为一个独立发行变体，而不是继续把逻辑堆叠在现有长命令中。

至少需要满足以下构建要求：

- 构建前确认 `dist-python/engine/engine.exe` 存在。
- 构建时把 `small` 模型复制或挂载到打包资源目录。
- 构建前校验 `small` 模型最少包含：
  - `config.json`
  - `tokenizer.json`
  - `vocabulary.txt`
  - `model.bin`
- 构建产物命名显式带上 `offline-small` 标识，避免和 `lite` 混淆。

验收要求应至少包括：

- 在全新机器或全新用户目录中安装后，无需联网即可完成一次转写。
- 删除用户缓存目录后，`offline-small` 仍能正常运行。
- 故意移除包内模型文件后，程序报错为“资源缺失”，而不是转入下载流程。

## 阶段化落地建议

建议按以下顺序推进：

1. 先补运行时模型目录注入能力，例如 `RTT_ASR_MODEL_DIR`。
2. 再让 Electron 打包配置支持 `resources/models/small`。
3. 然后增加 `offline-small` 构建入口与模型完整性校验。
4. 最后补一条离线 smoke 验证路径。

这样做的好处是：

- 先把运行时语义定稳，再处理打包差异。
- `offline-medium` 后续只需复用同一路径和校验框架。
- 不会破坏当前 `lite` 的现有下载能力。

## 决策结论

本次交付问题的正式结论如下：

- 默认对外交付采用 `offline-small`。
- 安装包内必须同时包含 Electron、PyInstaller 引擎和 `small` 模型。
- 模型不放“程序根目录”，而放固定资源目录 `resources/models/small`。
- 程序运行时按绝对路径读取内置模型，不依赖当前工作目录。
- `offline-small` 在内置模型缺失时直接报资源错误，不回退到下载。
- 后续新增 `offline-medium` 时沿用同一目录和解析机制。
