# 会议录音转文字任务协议

## 目标

定义桌面壳与本地 Python 引擎之间的最小通信协议，用于阶段 1 的本地联调。该协议只覆盖请求动作、响应结构、状态字段和错误结构，不涉及具体模型实现。

## 请求结构

请求为一个 JSON 对象：

```json
{
  "action": "health | create_mock_task",
  "payload": {}
}
```

字段说明：

- `action`：请求动作名
- `payload`：动作负载，允许为空对象

## 当前支持动作

### 1. `health`

用途：

- 检查 Python 引擎是否可用
- 返回运行环境和任务目录信息

请求示例：

```json
{
  "action": "health",
  "payload": {}
}
```

### 2. `create_mock_task`

用途：

- 创建一个模拟任务
- 验证任务目录结构、状态回传和结果落盘逻辑

请求示例：

```json
{
  "action": "create_mock_task",
  "payload": {
    "sourceFile": "mock-meeting.m4a"
  }
}
```

## 响应结构

响应为一个 JSON 对象：

```json
{
  "ok": true,
  "status": "completed | failed",
  "action": "health | create_mock_task",
  "data": {},
  "error": null
}
```

字段说明：

- `ok`：布尔值，表示请求是否成功
- `status`：当前动作执行状态
- `action`：回显动作名
- `data`：成功时的结果载荷
- `error`：失败时的错误对象

## 错误结构

失败响应中的 `error` 结构如下：

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable error"
}
```

当前错误码：

- `UNSUPPORTED_ACTION`
- `ENGINE_ERROR`

## 任务目录约定

模拟任务和后续真实任务都遵循同一目录布局：

```text
tasks/
  <task-id>/
    source/
    working/
    output/
    task.json
```

其中：

- `source/` 保存原始输入
- `working/` 保存中间产物
- `output/` 保存最终导出结果
- `task.json` 保存任务元数据和阶段结果

## 后续演进方向

下一阶段在不破坏整体结构的前提下，继续扩展：

- `import_audio`
- `preprocess_audio`
- `transcribe_audio`
- `diarize_audio`
- `export_transcript`

阶段 1 不需要一次性引入全部动作，先保证协议稳定即可。
