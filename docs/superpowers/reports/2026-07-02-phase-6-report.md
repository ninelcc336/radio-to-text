# 阶段 6 测试报告

## 阶段目标

完成一轮端到端验证，确认第一版核心链路已经成立，并整理已知风险。

## 测试样本

- 本地生成中文双说话人样本：`E:\ai-list\radio-to-text\tools\sample-meeting.wav`
- 时长约 `25.9` 秒

## 端到端验证方式

执行：

```powershell
npm run sample
```

样本任务目录：

- [task.json](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/task.json)
- [normalized.wav](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/working/normalized.wav)
- [transcript.json](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/working/transcript.json)
- [speaker_segments.json](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/working/speaker_segments.json)
- [transcript.txt](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/output/transcript.txt)
- [transcript.md](/E:/ai-list/radio-to-text/tasks/20260702-015510-35bf4b2a/output/transcript.md)

## 验证结果

- 音频导入成功
- 音频标准化成功
- 本地转写成功
- 匿名分人成功
- 文本导出成功
- 任务日志完整落盘

## 前端迁移补充

- 桌面渲染层已新增 `app/desktop/web/`，采用 `Next.js App Router + TypeScript + Tailwind + shadcn/ui`
- Electron 开发模式改为等待 `http://127.0.0.1:3000`，生产模式改为拉起 `Next standalone` 本地服务
- `preload.js` 继续作为桌面能力边界，前端统一通过 `window.desktopApi` 访问任务、设置、导出和健康检查
- 旧 `app/desktop/renderer/` 已降级为迁移说明页，只作为 Next 渲染层失效时的回退提示

## 当前验证命令

执行：

```powershell
npm run build:web
npm run smoke
npm run sample
npm run build:engine:verify
```

说明：

- `npm run build:web`：验证 Next 前端可生成生产 standalone 产物
- `npm run smoke`：以生产模式拉起 Electron，并断言实际加载的是 Next 页面与 `desktopApi`
- `npm run sample`：验证 Python 主链路仍可完成导入、转写、分人和导出
- `npm run build:engine:verify`：校验 `engine.exe`、Next standalone `server.js` 与静态资源是否齐全

## 已知问题

- 当前说话人区分采用启发式聚类，复杂会议场景下可能不稳定
- 当前只验证了短样本，还没有覆盖 1 小时真实会议录音
- 当前未实现摘要、待办项和决策项提取

## 结论

阶段 6 通过。第一版主链路已经形成：用户可以导入本地录音，完成本地转写和匿名分人，并导出结果。后续工作的重点应转向：

- 使用真实长会议录音做压力验证
- 评估是否替换为更强的本地 diarization 模型
- 增加摘要和结构化纪要增强能力
