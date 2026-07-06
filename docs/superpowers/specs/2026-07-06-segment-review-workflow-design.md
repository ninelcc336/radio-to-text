# 片段审核闭环设计

## 目标

在现有“重点核对”能力基础上，补齐最小可用的人工审核闭环，使用户可以对单条片段执行：

- 确认无误
- 编辑修正
- 持久保存审核状态
- 让审核后的文本直接成为当前任务的最终文本与导出来源

## 范围

本次只实现片段级审核闭环，不扩展为完整文稿编辑器。

- 审核状态持久写入 `task.json`
- 修正后直接覆盖当前最终结果层
- `raw_*` 原始识别层保持不变
- 重新打开任务后可恢复审核状态与修正文案

## 数据结构

为当前最终片段 `task.results.segments[*]` 增加字段：

- `review_status`
  - `pending`
  - `confirmed`
  - `corrected`
- `reviewed_text`
- `review_updated_at`

默认所有新生成片段都初始化为：

- `review_status = pending`
- `reviewed_text = null`
- `review_updated_at = null`

## 保存策略

审核操作只修改当前最终结果层：

- `segments`
- `speaker_segments`
- `plain_text`
- `speaker_text`
- `full_text`

不修改原始层：

- `raw_segments`
- `raw_speaker_segments`
- `raw_plain_text`
- `raw_speaker_text`

## 审核动作

### 确认无误

- 保持 `segment.text` 不变
- `review_status = confirmed`
- `review_updated_at = 当前时间`

### 编辑修正

- 直接覆盖 `segment.text`
- `review_status = corrected`
- `reviewed_text = 修正后文本`
- `review_updated_at = 当前时间`

## 同步规则

每次审核保存后，后端统一重建：

- `plain_text`
- `speaker_text`
- `full_text`

并同步更新当前最终层对应的 `speaker_segments[*].text`。

## 前端交互

当前最终文本视图下，每条片段提供：

- `确认无误`
- `编辑修正`

编辑态提供：

- `保存修正`
- `取消`

工具栏保留：

- `清洗文本`
- `原始文本`
- `全部片段`
- `仅看重点`
- `仅看未处理`
- `未处理 X`

不显示：

- `上一条/下一条`
- `已确认/已修正` 统计

## 过滤规则

- `全部片段`
  - 展示当前最终文本全部片段
- `仅看重点`
  - 展示 `needs_review = true` 且 `review_status = pending` 的片段
- `仅看未处理`
  - 展示 `review_status = pending` 的片段

## 导出联动

审核保存后，当前任务导出产物自动基于最新最终结果生成。

这意味着：

- 页面展示结果是最新审核版
- 任务目录内导出文件更新为最新审核版
- 前端下载动作读取当前任务结果时也得到最新审核版

## 验收标准

1. 每个新生成的最终片段默认带有 `review_status = pending`
2. 点击“确认无误”后，任务重开仍能恢复该状态
3. 点击“编辑修正”并保存后，片段文本被直接覆盖
4. 修正后 `plain_text`、`speaker_text`、`full_text` 同步刷新
5. `raw_*` 原始结果不被改写
6. `仅看重点` 只展示仍待处理的高风险片段
7. `仅看未处理` 只展示 `pending` 片段
8. `未处理 X` 与当前最终片段中 `pending` 数量一致
9. 审核后重新导出，内容来自最新审核结果
