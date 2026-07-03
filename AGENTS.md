# Repository Guidelines

## 项目结构与模块划分
仓库是一个本地优先的桌面转写原型。`app/desktop/` 放 Electron 壳层：`main.js` 负责主进程，`preload.js` 暴露安全接口，`renderer/` 放页面与交互脚本。`engine/python/radio_to_text/` 是 Python 处理引擎，覆盖音频标准化、转写、分人和导出。`tools/` 放样例音频与辅助脚本，`tasks/` 保存运行期任务数据，包含 `source/`、`working/`、`output/`，不要手工改历史任务产物。设计与计划文档集中在 `docs/superpowers/`。

## 构建、测试与开发命令
先执行 `npm install` 和 `pip install -r requirements.txt`。常用命令：

- `npm run dev`：以开发模式启动 Electron。
- `npm start`：以生产模式启动本地桌面应用。
- `npm run smoke`：运行桌面端冒烟脚本，检查主流程是否可启动。
- `npm run sample`：用 `tools/sample-meeting.wav` 跑一次完整样例。
- `npm run engine:health`：直接启动 Python 引擎入口，验证依赖和编码环境。

## 代码风格与命名约定
JavaScript 与 Python 均使用 4 空格缩进。JavaScript 采用 `const`/`let`、双引号、`camelCase` 变量名；Python 模块与函数使用 `snake_case`。目录名保持语义化，任务目录沿用 `YYYYMMDD-HHMMSS-<id>`。优先写短函数，复杂分支前可加一行说明性注释，避免空泛注释。

## 测试规范
当前仓库没有正式单元测试框架，提交前至少运行 `npm run smoke`，涉及转写链路时再运行 `npm run sample`。后续新增自动化测试时，JavaScript 测试建议放在 `app/**/__tests__/` 或同级 `*.test.js`，Python 测试放在 `engine/python/tests/`，文件名使用 `test_*.py`。新增核心流程、导出格式或任务状态变更时，应补对应自动化测试；新功能合并前应保证关键路径至少有一条可重复执行的脚本化验证。

## 提交与合并请求规范
现有提交历史以中文短句为主，例如“优化转写结果处理”或“增加音频播放器功能”。继续使用简洁的中文祈使式摘要，单次提交只描述一个明确目的。PR 需写清变更范围、验证命令、影响界面时附截图；如果修改 `tasks/` 数据结构、导出格式或 IPC 协议，需在描述中点明兼容性影响。

## 安全与配置提示
不要把真实会议音频、导出文本或模型缓存提交到仓库。路径处理优先复用现有的仓库内校验逻辑，避免越界访问 `tasks/` 之外的文件。涉及本地文件选择、导出或播放能力时，优先放在 Electron 主进程或 preload 暴露的受控接口中实现。
