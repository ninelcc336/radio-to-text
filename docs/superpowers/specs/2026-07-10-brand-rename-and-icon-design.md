# 音频转写助手品牌升级与正式图标设计

## 概述

当前项目已经具备桌面端主流程、Next.js 渲染层和 Windows 打包链路，但品牌信息仍处于“过渡状态”：

- 仓库与部分打包配置仍使用 `radio-to-text`。
- 共享品牌配置已经写成 `音频转写`，但还不是最终产品名。
- 目前没有正式可交付的桌面应用图标。

本设计用于一次性收敛第一阶段品牌升级方案：把产品对外名称统一为 `音频转写助手`，补一套正式 icon，并确保安装包、窗口标题、用户数据目录和升级兼容行为一致。

## 目标

- 把产品对外名称统一为 `音频转写助手`。
- 提供一个适合桌面应用分发的正式 icon 主方案。
- 去掉用户可见与运维可见场景中的 `radio-to-text` 旧品牌残留。
- 调整打包配置与运行时标识，使安装名、产物名、应用标识和用户数据目录跟随新品牌。
- 保证已有旧版本用户升级后，历史任务、设置和缓存可继续使用。

## 非目标

- 本次不修改仓库根目录名 `radio-to-text`。
- 本次不重命名 Python 包目录 `engine/python/radio_to_text/`。
- 本次不强制替换历史设计文档、计划文档和报告中的旧路径文本。
- 本次不做多套 icon 候选评审流程，只落一套正式主方案和一个轻微变体备选。
- 本次不处理 macOS、Linux 专用图标资产，只优先覆盖 Windows 桌面交付。

## 当前实现观察

基于当前仓库，和本设计最相关的现状如下：

- [package.json](E:/ai-list/radio-to-text/package.json) 仍把根包名、`appId`、`productName` 设置为 `radio-to-text`。
- [app/shared/app-config.json](E:/ai-list/radio-to-text/app/shared/app-config.json) 当前 `brandName` 已是 `音频转写`，说明界面文案已经开始脱离旧英文名，但尚未统一到最终产品名。
- [app/desktop/main.js](E:/ai-list/radio-to-text/app/desktop/main.js) 通过 `appConfig.brandName` 设置窗口标题、对话框标题，因此共享品牌配置是界面展示名的主入口。
- [app/desktop/web/app/layout.tsx](E:/ai-list/radio-to-text/app/desktop/web/app/layout.tsx) 和 [app/desktop/web/lib/app-config.ts](E:/ai-list/radio-to-text/app/desktop/web/lib/app-config.ts) 复用了共享品牌配置，因此 Next.js 页面标题也可统一收口。
- [app/desktop/main.js](E:/ai-list/radio-to-text/app/desktop/main.js) 当前把设置保存到 `app.getPath("userData")/settings.json`，品牌切换后对应目录会改变，需要显式处理旧目录迁移。
- [app/desktop/lib/runtime-paths.js](E:/ai-list/radio-to-text/app/desktop/lib/runtime-paths.js) 在打包模式下把 `rootDir` 默认解析到 `userDataDir`，因此 `tasks`、`logs`、`cache` 会跟着用户数据根目录一起迁移。
- [engine/python/radio_to_text/transcribe.py](E:/ai-list/radio-to-text/engine/python/radio_to_text/transcribe.py) 下载模型时仍使用 `radio-to-text/0.1.0` 作为 `User-Agent`，这属于运行时品牌串，需要一并替换。

## 推荐方案

本次采用“品牌彻底改名，技术标识有限保留”的方案。

具体定义如下：

- 对用户可见和运维可见的品牌名称全部改成 `音频转写助手`。
- 打包配置中的 `productName`、`appId`、安装包产物名、应用显示名、窗口标题、页面标题、保存对话框标题全部同步更新。
- 旧用户数据目录在首次启动时自动迁移到新目录。
- 源码内部暂时保留不直接影响用户感知的技术标识：
  - Python 包目录 `radio_to_text`
  - 现有环境变量前缀 `RTT_*`
  - 现有媒体协议名 `rtt-media`

这样做的原因是：

- 从用户角度看已经完成了完整品牌升级。
- 从工程角度看避免了一次性重命名 Python 包和大量导入路径，降低构建与运行回归风险。
- 后续如果确实需要再做源码级更名，可以作为独立任务处理，而不阻塞这次正式交付。

## 品牌名称与标识规则

本次品牌升级采用以下统一规则：

- 中文正式产品名：`音频转写助手`
- 英文技术标识 slug：`audio-transcription-assistant`
- Windows `appId`：`com.local.audio-transcription-assistant`

约束如下：

- 所有用户可见标题优先显示中文正式产品名。
- 所有新生成的打包产物文件名优先使用英文 slug，避免中文文件名对分发脚本和终端环境造成额外负担。
- 代码内部如果只需要“展示名”，统一从共享品牌配置读取，不在各层重复硬编码。

## 图标设计规范

图标方向已经确认如下：

- 类型：抽象字母化标识
- 气质：现代效率工具，专业但不死板
- 目标：像成熟桌面生产力软件，而不是语音娱乐或内容平台应用

设计语义定义为：

- 主图形表达“音频信号被整理成结构化文本”。
- 不直接使用具象麦克风、耳机、文档页等通用素材。
- 不强依赖具体字母拼写，但允许在几何结构中隐含“整理、折叠、转写”的感觉。

视觉约束如下：

- 外轮廓优先采用圆角方形基底，适配桌面图标栅格。
- 内部结构控制在 2 到 3 组主几何关系，保证小尺寸仍可识别。
- 避免细线、碎片化装饰、复杂高光和多层投影。
- 避免娱乐化紫色、霓虹风和过强渐变。
- 配色优先蓝青或墨青方向，允许单主色加少量明度层次。

输出物定义为：

- 主母版：`1024x1024` PNG
- Windows 应用图标：`ICO`
- 可复用预览图：方形 PNG

仓库内建议路径如下：

- `build/icons/app-icon-master.png`
- `build/icons/app-icon-preview.png`
- `build/icons/icon.ico`

如果生成流程需要临时文件，应放在临时目录中，最终只保留上述正式资产。

## 改名实施范围

本次应覆盖的改名范围如下。

### 1. 展示层

- Electron 窗口标题
- 文件保存对话框标题
- Next.js 页面标题
- 界面中引用共享品牌名的说明文本

### 2. 打包与分发层

- 根 `package.json` 的 `productName`
- 根 `package.json` 的 `build.appId`
- Windows 安装包与 portable 产物命名
- Electron Builder 图标配置

### 3. 运行时品牌串

- Python 下载请求中的 `User-Agent`
- 可能显示在日志、健康检查或错误文本中的旧品牌名

### 4. 用户数据与目录标识

- 新安装后的 Electron `userData` 目录
- `userData` 下的 `settings.json`
- 基于 `rootDir` 派生的 `tasks`、`logs`、`cache`、`models` 等目录

## 兼容与迁移策略

品牌升级不能以“让老用户丢数据”为代价，因此首次启动时必须执行旧目录探测。

推荐迁移逻辑如下：

1. 计算新的 `userData` 目录。
2. 在其同级父目录下探测旧目录 `radio-to-text`。
3. 如果旧目录不存在，则跳过迁移。
4. 如果新目录已经存在有效数据，则不覆盖，只记录“检测到旧目录但未迁移”的日志。
5. 如果新目录为空且旧目录存在，则把以下内容整体迁移到新目录：
   - `settings.json`
   - `tasks/`
   - `logs/`
   - `cache/`
6. 迁移成功后记录一次显式日志，便于排障。

约束如下：

- 迁移逻辑必须是幂等的，重复启动不能造成重复覆盖或数据破坏。
- 不允许删除旧目录中尚未成功复制的文件。
- 如果迁移失败，程序应继续提示错误，而不是静默忽略。

本次不要求做“旧路径和新路径双写”，只要求首次安全迁移。

## 文件与实现边界

本次实现预计至少会涉及以下文件：

- 修改：[package.json](E:/ai-list/radio-to-text/package.json)
- 修改：[app/shared/app-config.json](E:/ai-list/radio-to-text/app/shared/app-config.json)
- 修改：[app/desktop/main.js](E:/ai-list/radio-to-text/app/desktop/main.js)
- 修改：[app/desktop/lib/runtime-paths.js](E:/ai-list/radio-to-text/app/desktop/lib/runtime-paths.js)
- 修改：[app/desktop/lib/python-engine.js](E:/ai-list/radio-to-text/app/desktop/lib/python-engine.js)
- 修改：[engine/python/radio_to_text/transcribe.py](E:/ai-list/radio-to-text/engine/python/radio_to_text/transcribe.py)
- 修改：[app/desktop/web/app/layout.tsx](E:/ai-list/radio-to-text/app/desktop/web/app/layout.tsx) 或其依赖的共享品牌入口
- 新增：`build/icons/app-icon-master.png`
- 新增：`build/icons/app-icon-preview.png`
- 新增：`build/icons/icon.ico`

如果 Electron Builder 在仓库中还缺少明确图标字段，本次需要把它补齐到统一配置入口，而不是散落在脚本里单独处理。

## 测试与验收

本次验收至少需要覆盖以下三类。

### 1. 界面与展示验证

- 启动应用后窗口标题显示 `音频转写助手`。
- 页面标题显示 `音频转写助手`。
- 保存文件对话框标题显示 `音频转写助手`。
- 应用图标在窗口和安装产物中正常显示。

### 2. 打包与产物验证

- 执行桌面构建后，安装包与 portable 文件名不再出现 `radio-to-text`。
- 安装后的应用显示名与卸载项显示名为 `音频转写助手`。
- 打包结果使用正式 `icon.ico`。

### 3. 兼容与迁移验证

- 准备一个旧版本用户目录 `radio-to-text`，其中包含 `settings.json`、`tasks/`、`cache/`。
- 启动新版本后，程序能在新目录下读取到原有设置和任务。
- 迁移逻辑重复执行不会覆盖已存在的新数据。

## 风险与约束

本次最主要的风险如下：

- `appId` 变更后会影响 Windows 安装识别与快捷方式行为，因此必须配合实际安装验证。
- `userData` 目录切换会影响设置、任务和缓存位置，因此迁移逻辑必须先于依赖目录读取执行。
- 图标如果只提供 PNG 而不生成合格的 `ICO`，可能导致安装程序或任务栏显示异常。

因此，本次实现顺序应优先是：

1. 统一品牌配置与打包字段
2. 补用户数据迁移
3. 落正式 icon 并接入构建
4. 运行构建与 smoke 验证

## 决策结论

本次正式结论如下：

- 产品名称统一为 `音频转写助手`。
- 采用“品牌彻底改名，技术标识有限保留”的方案。
- 用户可见与运维可见场景不再保留 `radio-to-text`。
- Python 包目录、环境变量前缀和媒体协议名暂时保留，避免一次性技术重构。
- 图标采用抽象字母化、现代效率工具风格，输出正式桌面应用资产。
- 旧版本用户数据必须在首次启动时自动迁移，确保品牌升级不损坏既有任务与设置。
