# Next.js Electron 前端迁移设计

## 概述

当前桌面端前端由静态 `index.html` 和单文件 `renderer.js` 组成，已经承载了任务列表、任务详情、音频播放器、文本审校、导出菜单、任务重命名与删除等多类职责。这种结构在功能验证阶段足够直接，但随着任务选择、审校、模型缓存、设置页等能力逐步增加，前端已经出现两个明显问题：

- 页面结构、样式和交互逻辑高度耦合，继续新增功能会让单文件进一步膨胀。
- 当前渲染层缺少路由、组件边界和类型约束，不利于后续做设置页、模型配置、缓存管理和更复杂的状态同步。

本次设计的目标是在保持 `Electron + preload + Python` 主链路不变的前提下，把现有渲染层升级为完整的 `Next.js App Router + TypeScript + Tailwind + shadcn/ui` 前端工程，并形成适合后续产品化迭代的页面结构、状态组织和构建发布方案。

## 目标

- 把现有 `renderer/index.html + renderer.js` 升级为独立的 `Next.js` 前端工程。
- 保持现有 Electron 主进程、`preload` 安全边界和 Python 引擎主流程不变。
- 前端页面结构至少包含 `任务列表 / 任务详情 / 设置` 三类路由。
- 将任务列表、详情、播放器、审校、导出等能力拆为独立组件和前端状态模块。
- 在开发期支持 `Next dev server + Electron` 联调。
- 在生产期支持 `Next standalone + Electron` 打包运行。
- 保持当前 `tasks/` 目录、`task.json` 数据模型和 Python 处理链兼容。

## 非目标

- 本次不迁移到 `Tauri` 或 `Rust`。
- 本次不重写 Python 引擎协议和 `task.json` 存储模型。
- 本次不引入本地数据库替代任务目录结构。
- 本次不新增录音、会议摘要、团队协作或云同步能力。
- 本次不要求一次性重做现有 Python 测试体系。

## 推荐方案

推荐采用“保留桌面主链路，重写渲染层，顺手收敛前端 API 契约”的渐进迁移方案。

具体来说：

- Electron 继续负责窗口、运行时目录、原生对话框、Python 进程拉起和生产环境生命周期。
- `preload` 继续作为唯一受控桥接层，对前端暴露白名单桌面 API。
- Python 继续负责任务创建、音频标准化、转写、分人、审校、导出和 `task.json` 落盘。
- 现有静态渲染层改造为 `Next.js App Router + TypeScript + Tailwind + shadcn/ui` 工程。
- 前端调用不再直接散落拼接 `action/payload`，而是通过语义明确的桌面 API 封装访问 Electron 与 Python。

推荐该方案的原因如下：

- 当前仓库最稳定的部分是 `Electron -> preload -> Python -> tasks/` 这条本地链路，适合复用而不是推倒。
- 前端当前的主要问题是组织方式，而不是业务主流程本身。
- 如果在迁移前端时同时重写桌面壳、Python 协议和任务存储，范围会明显失控。
- 先解决前端工程化、路由、组件边界和构建链，再决定是否继续演进任务元数据层，风险更低。

## 总体架构

迁移后的架构保持“三层不变、一层重写”：

- 桌面壳：`Electron`
- 安全边界：`preload + IPC`
- 本地业务引擎：`Python`
- 前端渲染层：由静态 HTML/JS 重写为 `Next.js`

数据与控制流保持以下原则：

1. 前端页面只通过 `window.desktopApi` 访问桌面能力。
2. Electron 主进程继续负责对话框、路径校验、子进程拉起和运行时资源编排。
3. Python 仍是任务处理和结果生成的唯一业务事实来源。
4. `tasks/<task-id>/task.json` 仍作为任务详情和导出结果的单一事实来源。

这样可以确保前端升级后：

- 不破坏现有本地优先和受控桥接模型。
- 不让 Next 直接接触 Node 原语或 Python 进程。
- 不让页面逻辑绕过 Electron 主进程直接访问文件系统。

## 目录设计

建议在现有桌面工程下新增独立前端目录：

```text
app/
  desktop/
    main.js
    preload.js
    lib/
      python-engine.js
      runtime-paths.js
    web/
      package.json
      next.config.js
      tsconfig.json
      postcss.config.js
      components/
      hooks/
      lib/
      stores/
      app/
        page.tsx
        tasks/[taskId]/page.tsx
        settings/page.tsx
```

目录职责如下：

- `main.js`：开发/生产加载 Next、窗口生命周期、原生能力和主进程 IPC。
- `preload.js`：对前端暴露稳定的 `desktopApi` 白名单接口。
- `web/app/`：Next 路由入口。
- `web/components/`：可复用展示组件和交互组件。
- `web/hooks/`：围绕页面用例组织交互逻辑。
- `web/stores/`：管理前端全局状态与异步请求状态。
- `web/lib/`：类型定义、桌面 API 封装、格式化工具、常量和错误模型。

该目录设计的重点不是追求复杂，而是避免新前端再次退化为“一个页面文件 + 一个大状态文件”。

## 页面与路由设计

前端第一阶段采用三类主路由：

- `/`
- `/tasks/[taskId]`
- `/settings`

页面职责如下：

### 1. `/` 任务列表页

负责：

- 展示任务列表与基本状态
- 创建任务入口
- 最近任务快速预览
- 任务删除、重命名等列表级操作

不负责：

- 长文本审校主工作区
- 复杂播放器同步逻辑
- 设置编辑

### 2. `/tasks/[taskId]` 任务详情页

负责：

- 任务基本信息
- 处理入口
- 音频播放器
- 文本视图切换
- 片段审校
- 导出动作

这是当前 `renderer.js` 里大部分高交互能力的最终承接页。

### 3. `/settings` 设置页

负责：

- 模型配置
- 缓存目录信息
- 运行环境与引擎健康状态
- 导出偏好和后续可扩展设置项

设置页是这次产品化前端结构中必须预留的能力，否则现有单页结构很快会再次膨胀。

## 组件拆分设计

建议按能力域拆分组件，而不是按 DOM 片段硬切。第一阶段建议至少包含以下组件：

- `TaskListPanel`
- `TaskListItem`
- `TaskSummaryCard`
- `TaskActionBar`
- `AudioPlayerPanel`
- `TranscriptToolbar`
- `TranscriptSegmentList`
- `TranscriptSegmentCard`
- `TranscriptSegmentEditor`
- `ExportMenu`
- `SettingsForm`
- `EngineHealthCard`

拆分原则如下：

- 列表相关组件只处理任务摘要信息，不直接依赖播放器状态。
- 审校相关组件只依赖任务文本和审校动作，不直接触发对话框和文件保存。
- 导出相关组件不直接写文件，只调用桌面桥接能力。
- 设置相关组件只消费设置 store 和健康检查能力，不混入任务详情状态。

这样可以让每类组件的职责更稳定，测试边界也更清晰。

## 前端状态设计

建议将前端状态拆为四组，而不是继续使用一个页面脚本内的多个全局变量：

- `tasks store`
- `task detail store`
- `player store`
- `settings store`

### 1. `tasks store`

负责：

- 任务列表加载与刷新
- 当前选中任务 ID
- 列表项更新、删除、重命名后的本地同步
- 列表级 loading / error 状态

### 2. `task detail store`

负责：

- 当前任务详情加载
- 当前文本视图版本与过滤器
- 处理任务中的忙碌态
- 片段审校提交状态
- 导出动作状态

### 3. `player store`

负责：

- 音频可用性
- 音频加载状态
- 当前播放时间
- 总时长
- 当前激活片段
- 路由切换时的播放器状态重置或恢复

### 4. `settings store`

负责：

- 设置读取与提交
- 缓存路径信息
- 运行环境信息
- 引擎健康检查状态

前端状态设计的重点是把“列表状态、详情状态、播放器状态、设置状态”显式分开，避免后续继续在单个页面文件里跨区域相互修改。

## 桌面 API 与 IPC 契约设计

现有渲染层通过一个统一入口：

- `engineApi.request(request)`

访问主进程与 Python 引擎。该模式在原型阶段足够直接，但在 Next 前端里会导致：

- 页面组件到处拼 `action/payload`
- 类型边界不清晰
- 组件难以复用和测试

本次推荐做“前端桥接接口收敛”，即对前端暴露清晰 API，但主进程底层可以继续复用现有请求通道。

建议暴露为：

- `window.desktopApi.tasks.list()`
- `window.desktopApi.tasks.get(taskId)`
- `window.desktopApi.tasks.importAudio()`
- `window.desktopApi.tasks.process(taskId)`
- `window.desktopApi.tasks.rename(taskId, name)`
- `window.desktopApi.tasks.delete(taskId)`
- `window.desktopApi.review.update(taskId, segmentIndex, action, reviewedText?)`
- `window.desktopApi.media.resolveTaskAudio(taskId, sourcePath?)`
- `window.desktopApi.dialog.selectAudio()`
- `window.desktopApi.dialog.saveText(payload)`
- `window.desktopApi.settings.get()`
- `window.desktopApi.settings.set(payload)`
- `window.desktopApi.engine.health()`

其中：

- `tasks`、`review`、`settings` 面向业务操作
- `dialog`、`media` 面向原生能力
- `engine.health()` 面向环境诊断

这样设计后，Next 前端只感知语义明确的桌面能力，不再直接承受底层协议细节。

## 开发模式设计

开发期建议采用双进程联调：

- `Next dev server`
- `Electron`

启动顺序如下：

1. 启动 Next 开发服务，固定本地端口，例如 `127.0.0.1:3000`。
2. Electron 在创建窗口前等待该端口可用。
3. 开发环境下 `main.js` 使用 `loadURL()` 加载本地 Next 地址。
4. 页面仍通过 `preload` 注入的 `desktopApi` 调用 Electron 与 Python。

这样可以获得：

- Next 开发期热更新
- Electron 原生联调能力
- 与生产模式接近的前端调用路径

开发模式下不应让 Next 直接替代 Electron 负责系统能力，否则后续生产行为会与开发行为严重背离。

## 生产构建与发布设计

生产期推荐采用 `Next standalone` 方案，而不是静态导出：

1. 执行 `next build`
2. 输出 `standalone` 服务端产物和静态资源
3. Electron 启动时先拉起本地 Node 子进程运行 standalone server
4. Electron 等待本地端口可用后再创建窗口并 `loadURL()`
5. Electron 退出时负责清理该 Node 子进程

采用该方案的原因：

- 保留 App Router 的能力边界
- 不必把 Next 限制为纯静态站点
- 开发模式与生产模式的页面加载形态更接近
- 更容易在后续引入服务端路由、元数据和结构化页面能力

最终打包产物应包含三部分：

- Electron 应用壳
- Next standalone 前端产物
- Python 引擎产物

Electron Builder 继续作为总装打包入口，不再为前端单独维护第二套发布链路。

## 错误处理设计

错误处理建议分三层收敛：

- `Next UI 层`
- `Electron bridge 层`
- `Python engine 层`

职责如下：

- `Next UI 层` 只负责展示错误态、空态、重试入口和禁用态。
- `Electron bridge 层` 负责把主进程、IPC、子进程和原生能力错误转为稳定结构。
- `Python engine 层` 继续保留业务错误来源。

建议前端统一错误模型：

```ts
type DesktopError = {
  code: string;
  message: string;
  detail?: string;
  retryable?: boolean;
};
```

这样可以避免页面逻辑依赖底层 stderr 文本或异常字符串内容。

## 测试策略

迁移后测试建议分为四层：

- 前端单元测试
- 前端集成测试
- Electron 冒烟测试
- Python 流程测试

### 1. 前端单元测试

重点覆盖：

- store
- 文本筛选和状态映射纯函数
- 组件内交互辅助逻辑

### 2. 前端集成测试

重点覆盖：

- 任务列表页
- 任务详情页
- 设置页
- 审校与导出关键交互

### 3. Electron 冒烟测试

在现有 `npm run smoke` 基础上扩展，至少验证：

- Electron 可启动
- Next 页面可加载
- `preload` 桥接 API 可调用
- Python 引擎请求链可跑通

### 4. Python 流程测试

继续保留现有核心链路测试，不因前端迁移而削弱：

- 任务处理
- 审校动作
- 导出结果

这样可以保证前端升级不影响当前最关键的离线处理链。

## 分阶段迁移方案

本次迁移不建议一次性替换，推荐拆为四个阶段。

### 阶段 1：搭建前端工程骨架

目标：

- 新建 Next 工程
- 接入 TypeScript、Tailwind、shadcn/ui
- 打通开发期 `Next + Electron`

验收标准：

- Electron 能在开发环境下稳定加载 Next 页面
- `desktopApi` 在 Next 页面可访问

### 阶段 2：迁移页面骨架与路由

目标：

- 搭建 `/`、`/tasks/[taskId]`、`/settings`
- 迁移任务列表页和详情页基础布局
- 初步引入前端 store

验收标准：

- 能浏览任务列表
- 能进入任务详情页
- 设置页可展示静态或只读信息

### 阶段 3：迁移高交互能力

目标：

- 迁移播放器
- 迁移文本视图切换
- 迁移审校、导出、重命名、删除和处理入口

验收标准：

- 新前端下主工作流可完整跑通
- 体验不低于旧渲染层

### 阶段 4：切换生产构建并移除旧渲染层

目标：

- 接入 Next standalone 生产启动链
- 调整 Electron 打包资源
- 移除旧 `renderer/index.html` 和旧入口依赖

验收标准：

- `dist` 可成功产出桌面安装包
- 生产包内 Next 页面可加载
- Python 引擎和前端均可在打包环境下正常工作

## 风险与约束

当前主要风险如下：

- Electron 生产环境中拉起 Next standalone server 的生命周期管理复杂度高于静态 HTML。
- `preload` 暴露接口重整后，如果类型声明与实现不一致，前端会出现运行时错误。
- 音频播放器从单页切到路由后，当前播放状态与任务详情状态的同步更容易出错。
- 现有 `smoke`、`sample`、`dist` 脚本需要逐步迁移，不应一次性中断当前验证路径。

为控制风险，本次设计明确以下约束：

- 先迁前端结构，再逐步优化协议，不同时重写所有层。
- 保持 `task.json` 与任务目录模型不变。
- 保持 Python 为任务主流程的唯一业务事实来源。
- 保持 Electron 为系统能力的唯一入口。

## 验收标准

本设计落地后，至少应满足以下标准：

- 新前端采用 `Next.js App Router + TypeScript + Tailwind + shadcn/ui`。
- 页面包含 `任务列表 / 任务详情 / 设置` 三类路由。
- 开发期可通过 `Next dev server + Electron` 联调。
- 生产期可通过 `Next standalone + Electron` 打包运行。
- 任务创建、处理、查看、审校、导出主流程在新前端下可跑通。
- 现有 Python 核心流程测试不受影响。
- 现有本地 `tasks/` 数据结构保持兼容。

## 建议的实施顺序

建议按以下顺序推进实现：

1. 先搭建 Next 前端工程与 Electron 开发加载链。
2. 再实现 `desktopApi` 的语义化前端封装和类型层。
3. 然后迁移任务列表页、任务详情页和设置页基础结构。
4. 再迁播放器、审校、导出等高交互能力。
5. 最后切换生产构建和移除旧渲染层。

该顺序的重点是先把工程骨架和运行时链路跑通，再迁业务界面，避免在不稳定的构建基础上同时处理复杂交互。
