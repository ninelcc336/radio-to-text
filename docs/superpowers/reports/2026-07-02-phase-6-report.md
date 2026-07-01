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

## 已知问题

- 当前说话人区分采用启发式聚类，复杂会议场景下可能不稳定
- 当前只验证了短样本，还没有覆盖 1 小时真实会议录音
- 当前未实现摘要、待办项和决策项提取

## 结论

阶段 6 通过。第一版主链路已经形成：用户可以导入本地录音，完成本地转写和匿名分人，并导出结果。后续工作的重点应转向：

- 使用真实长会议录音做压力验证
- 评估是否替换为更强的本地 diarization 模型
- 增加摘要和结构化纪要增强能力
