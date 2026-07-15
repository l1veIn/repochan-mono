# 输出规格、生成强制与协议保存

## 输出规格解析

在调用 `repochan image gen` 前解析输出规格，并映射到 CLI 支持的宽高比和尺寸参数：

1. 如果用户为本次执行给出了明确的尺寸/宽高比指令，使用它（除非不安全或不可能）。
2. 否则如果有模板，使用模板的 canonical `size`，并采用 `template get` 返回的派生宽高比。
3. 否则使用任务第一个 deliverable 的 `width`、`height`、`aspectRatio`。
4. 将解析出的尺寸映射到 `repochan image gen` 参数：
   - `--size`：精确尺寸字符串，如 `1024x1024`、`1200x800`。
   - `--aspect`：`1:1` 或宽高相等 → `square`；宽大于高 → `landscape`；高大于宽 → `portrait`。

**关键：同时传 `--size` 和 `--aspect`。** `--size` 保留目标像素规格，`--aspect` 为只支持粗粒度比例的 provider 提供降级语义。

调用示例：
```bash
repochan image gen --prompt "<组装的 prompt>" --aspect square --size 1024x1024
```

不要为设定集封面发明特殊宽高比规则。设定集封面和所有其他任务一样遵循其模板。


## 生成：强制工具使用

**你必须调用 `repochan image gen` 来产出图像。**

不要：
- 在生成前向用户确认——用户已经通过启动画师阶段批准了。
- 写了简报就停——没有生成图像的简报是不完整的交付物。
- 描述你"会"生成什么——实际调用 CLI。

调用 `repochan image gen`（每个参考图一个独立的 `--reference` flag）：
```bash
repochan image gen --prompt "<你组装的 persona + order + template prompt>" \
  --reference <resolve出的路径1> \
  --reference <resolve出的路径2> \
  --aspect landscape|square|portrait --size 1024x1024
```

如果是 foundation_sheet 或其他确实没有参考图的任务，省略 `--reference`：
```bash
repochan image gen --prompt "<你组装的 persona + order + template prompt>" --aspect landscape|square|portrait --size 1024x1024
```

写命令用管道 stdin 传 JSON，不要在项目目录创建临时文件；生图默认输出到 `~/.cache/repochan/`，命令会打印路径。在 `repochan order create-result` 的 payload `files` 字段中使用该路径。


### 生成后自检：解剖学错误的处理

图像生成模型（包括 gpt-image-2）会产生解剖学错误——多指、三只手、肢体错位、漂浮的手等。这类错误有**两个主要诱因**：

1. **多手任务堆叠（可在 prompt 层预防，见上方 Pose writing technique 的"单手聚焦"原则）**——这是**最主要、最可避免**的诱因。当 prompt 给两只手各分配独立复杂任务时，模型会"长出"额外的手。遵守单手聚焦原则可以从源头大幅降低三只手发生率。
2. **模型的固有概率错误（无法在 prompt 层消除）**——即使 prompt 完美，仍偶发多指/肢体错位。这是 diffusion 模型的固有性质。

**不要在 prompt 里堆 "no extra hands / correct anatomy" 类否定约束**来消除概率错误——实测表明这类约束效果不稳定，反而引入新问题（让模型过度关注"手"，产生其他异常）。

**处理机制**（按优先级）：
1. **预防（最有效）**：写 pose 时遵守"单手聚焦"原则，从源头避免多手任务堆叠。
2. **交付前自检**：拿到图后，如果模型有多模态能力就用 `read` 看一眼；如果肉眼明显有解剖学错误（且你确信 prompt 没有多手堆叠），**重生成一次**——概率错误重跑通常修复。如果 prompt 确有多手堆叠，先改 prompt 再重跑。
3. **交付后由用户/AD review**：用户指出解剖学问题时，按"处理 review 回流订单"流程走图生图重绘。

简言之：**多手堆叠用 prompt 预防，概率错误用重跑/review 解决，永远不用否定约束。**


## 协议保存规则

当输出被接受时：

1. 使用 `repochan order create-result` 将二进制图像文件保存为新结果版本；通过 heredoc 管道 stdin 传 JSON payload，不要写临时 JSON 文件。payload 参数包括：`{ orderId, files, versionId?, tool?, promptBrief?, generationPrompt?, revisedPrompt?, notes?, meta?, provenance? }`。`files` 必须至少包含一个当前可读、非空的普通文件；core 会在创建版本目录和推进 `delivered` 前预检全部路径，不能用空数组、空文件、缺失路径或 notes 冒充交付物。每个 `versionId` 只能发布一次，修订必须使用新 id。
2. 在 `meta.json` 中记录是否使用了参考图，以及它们来自哪个 foundation/order。
3. **强制——`generationPrompt`**：将 `generationPrompt` 记录为你传给 `repochan image gen --prompt` 的精确完整 prompt。**这是 core 强制执行的硬性要求**——当 `tool` 字段涉及图像生成（任何包含 `image-gen` 的工具名）时，`repochan order create-result` 如果缺少或为空的 `generationPrompt`，将**抛出错误并拒绝保存**。**没有它你无法保存结果。** 不要用 `promptBrief` 替代 `generationPrompt`——`promptBrief` 是简短的人类可读摘要；`generationPrompt` 是逐字的完整 prompt 字符串。如果你组装了一个 500 词的 prompt 并传给了 `repochan image gen --prompt`，那整个 500 词的字符串都进入 `generationPrompt`。
4. **绝不在 `meta` 中存储绝对文件系统路径**（如临时生成路径或 `/Users/.../generated-images/...`）。image-gen 配置缓存位于 `~/.repochan/image.json`，但结果元数据不应依赖本机缓存路径。图像已经被 `repochan order create-result` 复制到版本目录；`meta` 应只包含可移植信息：`referenceImagesUsed`（布尔值）、`references`（orderId/role 列表）、`templateId`、`aspectRatio`、`safetyConstraintsApplied`。
5. `repochan order create-result` 原子创建当前结果并将任务推进为已交付；把交付说明放在 notes。
6. 保留先前版本，绝不在没有用户明确批准的情况下覆盖现有结果版本。
7. 同一 order 的结果发布、候选提升和普通状态修改必须串行。如果 CLI 报告 transaction/recovery 冲突，先运行 `repochan order recovery list <order-id>` 查看；活跃发布仍持锁时等待并重试，崩溃进程的 stale lock 会由 core 自动回收。`prepared` / `recovery_required` 可用 `repochan order recovery recover <order-id> <transaction-id>` 恢复事务前状态；`staging_unprepared` 尚未改写协议目标，只能用 `repochan order recovery abort <order-id> <transaction-id>` 丢弃暂存目录。其他情况下仅在确认接受当前完整状态时使用 `abort`。**禁止手改或删除 `.repochan/` 下的 transaction/recovery 文件。**
8. 所有 order 状态与结果变更都必须调用对应的 `repochan order ...` 命令。结果版本发布后，版本目录与 `meta.json` 字节保持不变；切片、抠图、压缩等派生资产由 Page Designer 通过 `repochan starter asset-apply` 生成到 pulled Starter 的 `public/`，不回写 order result。
