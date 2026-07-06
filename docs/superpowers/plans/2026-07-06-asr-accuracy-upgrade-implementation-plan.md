# 会后转写准确率提升实施计划

## 目标

在保持“线下会议会后转写”定位不变的前提下，提升纯中文会议录音的最终转写准确率。当前阶段不引入实时转写，不调整产品形态，重点解决以下问题：

- 长音频转写稳定性不足
- 中文关键字词、数字、日期识别错误
- 低置信度片段不可见，复核效率低
- 现有结果难以对比“原始识别”和“清洗后文本”

本计划面向当前仓库已有的 `Electron + Python` 架构，优先复用现有任务目录、处理中间产物和结果展示能力。

## 范围

本次实施只覆盖“高准确度会后转写工具”所需的主链路增强，不包含以下内容：

- 实时录音和实时转写
- 云端摘要、待办项、决策项提取
- 全新说话人分离算法替换
- 批量任务调度
- 大规模 UI 重构

## 实施原则

1. 先提升 ASR 主链路准确率，再处理分人和复杂增强。
2. 先让结果“可调、可比较、可复盘”，再做额外优化。
3. 保留原始中间产物，不用后处理结果覆盖原始识别文本。
4. 优先选择适合普通办公机 CPU 的方案，避免引入重模型依赖。

## 现状基线

当前仓库已经具备以下能力：

- 本地导入音频并复制到任务目录
- 统一转为单声道 `16kHz wav`
- 使用 `faster-whisper` 直接转写整段音频
- 使用轻量聚类方案完成匿名分人
- 展示任务列表、转写结果、音频回放与导出

当前主要短板：

- 转写参数基本固定，缺少“质量档位”
- 长音频没有显式 chunk 切分与拼接策略
- 转写结果结构缺少置信度与 chunk 来源信息
- 后处理未模块化，无法做术语纠错和可疑片段标记
- UI 无法突出需要人工复核的句段

## 阶段拆分

### 阶段 1：ASR 配置分层与结果结构扩展

目标：

- 为转写链路引入可配置的“质量档位”
- 为后续拼接、复核、后处理补齐结果字段

涉及模块：

- `engine/python/radio_to_text/config.py`
- `engine/python/radio_to_text/models.py`
- `engine/python/radio_to_text/cli.py`

实施内容：

- 在 `EngineConfig` 中新增 ASR 相关配置：
  - `accuracy_profile`
  - `beam_size`
  - `language`
  - `chunk_seconds`
  - `chunk_overlap_seconds`
  - `initial_prompt`
- 为 `TranscriptSegment` 新增字段：
  - `confidence`
  - `avg_logprob`
  - `no_speech_prob`
  - `source_chunk_id`
- 在 `health` 响应中暴露关键 ASR 配置，便于联调验证

验收标准：

- 通过 `npm run engine:health` 能看到新增配置字段
- 不传新环境变量时，旧行为保持兼容
- 任务结果序列化时可写出扩展后的 segment 字段

### 阶段 2：长音频切分、转写与拼接

目标：

- 替换“整段音频直接转写”的模式
- 提升 30 分钟以上录音的稳定性和断句质量

涉及模块：

- `engine/python/radio_to_text/transcribe.py`
- `engine/python/radio_to_text/pipeline.py`
- `engine/python/radio_to_text/task_store.py`

实施内容：

- 将 `Transcriber` 重构为三段职责：
  - chunk 切分
  - chunk 转写
  - chunk 结果拼接
- 使用固定窗口 + 重叠区策略处理长音频
- 生成两类中间产物：
  - `working/transcript_raw_chunks.json`
  - `working/transcript.json`
- 拼接时完成：
  - 重叠文本去重
  - 时间轴回写
  - 相邻短句合并

验收标准：

- 对样例音频能生成 raw chunk 结果和最终 segment 结果
- 同一音频在不同精度档位下可重复跑通
- 长音频转写不再依赖单次整段推理
- 导出结果的时间戳连续且无明显重复句段

### 阶段 3：中文后处理与术语纠错

目标：

- 降低纯中文会议中的关键字词误差
- 让输出更接近正式会议转写文本

涉及模块：

- 新增 `engine/python/radio_to_text/postprocess.py`
- `engine/python/radio_to_text/pipeline.py`
- `engine/python/radio_to_text/exporters.py`

实施内容：

- 独立实现后处理模块，先覆盖：
  - 中文标点补全
  - 数字、日期、金额规范化
  - 常见口语冗余清理
  - 术语替换表
- 同时保留两类文本结果：
  - 原始识别文本
  - 清洗后文本
- 导出时支持明确区分导出策略

验收标准：

- 处理完成后，任务结果中同时存在原始文本与清洗文本
- 导出内容与所选文本版本一致
- 术语替换表修改后，无需改代码即可影响输出

### 阶段 4：低置信度标记与复核入口

目标：

- 让用户快速定位最值得人工复核的句段

涉及模块：

- `engine/python/radio_to_text/pipeline.py`
- `app/desktop/renderer/renderer.js`
- `app/desktop/renderer/index.html`

实施内容：

- 在后端生成 segment 级复核标记：
  - `needs_review`
  - `review_reasons`
- 初版标记规则包括：
  - 低置信度
  - 高 no-speech probability
  - 数字密集片段
  - 极短但含高信息量片段
- 在前端列表中高亮需要复核的句段
- 复用现有音频跳转能力，支持点击后直接定位到句段

验收标准：

- 已标记句段在页面中有明确视觉区分
- 用户可从可疑句段直接跳转到对应音频位置
- 无需重新设计主界面结构即可完成复核闭环

### 阶段 5：轻量音频前处理增强

目标：

- 在不引入激进降噪的前提下，提高 ASR 输入稳定性

涉及模块：

- `engine/python/radio_to_text/audio.py`
- `engine/python/radio_to_text/pipeline.py`

实施内容：

- 在现有标准化基础上增加可选轻量增强：
  - 响度统一
  - 轻量静音裁剪
  - 适度高通
- 保留预处理前后的音频产物，方便回放对比

验收标准：

- 预处理增强可以通过配置开关控制
- 开启增强后不会破坏现有任务链路
- 样例音频可稳定完成预处理和后续转写

## 实施顺序

建议按以下顺序落地：

1. 阶段 1
2. 阶段 2
3. 阶段 3
4. 阶段 4
5. 阶段 5

其中阶段 1 和阶段 2 必须先完成，阶段 3 和阶段 4 可在此基础上顺序推进，阶段 5 放在最后做增益验证。

## 代码改动映射

第一阶段最先改动的文件：

- `engine/python/radio_to_text/config.py`
- `engine/python/radio_to_text/models.py`
- `engine/python/radio_to_text/transcribe.py`
- `engine/python/radio_to_text/pipeline.py`
- `engine/python/radio_to_text/task_store.py`

第二阶段新增或扩展的文件：

- `engine/python/radio_to_text/postprocess.py`
- `engine/python/radio_to_text/exporters.py`
- `app/desktop/renderer/renderer.js`
- `app/desktop/renderer/index.html`

## 验证方案

开发验证至少覆盖以下命令：

- `npm run engine:health`
- `npm run sample`
- `npm run smoke`

建议准备两组验证音频：

- 仓库内样例音频：验证主链路不回退
- 一段 30 分钟以上纯中文会议录音：验证长音频切分与拼接质量

每阶段至少记录以下结果：

- 是否成功完成任务
- 是否生成预期中间产物
- 最终文本是否出现明显重复、断裂或句段丢失
- 页面是否可正常查看和跳转到复核片段

## 总体验收标准

当以下条件同时满足时，可认为本轮“准确率提升”目标达成：

- 可以通过配置切换至少两档转写质量模式
- 长音频处理链路具备显式 chunk 切分与拼接能力
- 任务目录中保留 raw chunk 结果和最终转写结果
- 输出文本同时保留原始版和清洗版
- 页面中可以识别并跳转到需要复核的低置信度片段
- 现有样例音频主流程可继续跑通
- 不引入实时转写依赖，不改变当前本地离线产品定位

## 非目标提醒

即使本轮全部完成，也不代表以下问题已经解决：

- 说话人分离达到高精度产品级表现
- 重叠说话场景显著改善
- 复杂远场噪声环境大幅提升
- AI 摘要、待办项等会后整理能力补齐

这些内容不在本轮范围内，避免实现过程中扩散。
