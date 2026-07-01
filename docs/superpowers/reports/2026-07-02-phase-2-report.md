# 阶段 2 测试报告

## 阶段目标

支持导入本地音频，并将录音标准化为后续模型可处理的统一格式。

## 已实现内容

- 音频导入动作 `import_audio`
- 原始音频复制到任务目录
- 基于 `imageio-ffmpeg` 的本地 `ffmpeg` 标准化
- `normalized.wav` 生成与元数据读取
- 本地样本音频生成脚本 [generate_sample_meeting.ps1](/E:/ai-list/radio-to-text/tools/generate_sample_meeting.ps1)

## 验证方式

1. 生成测试音频：

```powershell
& 'E:\ai-list\radio-to-text\tools\generate_sample_meeting.ps1'
```

2. 导入音频：

```powershell
'{"action":"import_audio","payload":{"sourcePath":"E:\\ai-list\\radio-to-text\\tools\\sample-meeting.wav"}}' | python -X utf8 engine/python/main.py
```

3. 检查标准化结果：

```powershell
python -c "import wave; wf=wave.open(r'E:\ai-list\radio-to-text\tasks\20260702-015510-35bf4b2a\working\normalized.wav','rb'); print({'channels': wf.getnchannels(), 'sample_rate': wf.getframerate(), 'sample_width': wf.getsampwidth(), 'frames': wf.getnframes()})"
```

## 验证结果

- 样本音频生成成功
- `import_audio` 返回成功
- 已生成 `normalized.wav`
- 标准化结果为：
  - `channels = 1`
  - `sample_rate = 16000`
  - `sample_width = 2`

## 结论

阶段 2 通过。录音可被导入并转换为后续 ASR 处理所需的单声道 `16kHz wav`。
