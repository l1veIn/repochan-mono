# 用户反馈 review 与回流重绘

## 接收用户反馈：自动创建 review

当用户对一个已交付（`delivered`）的产物提出修改意见时——比如"颜色不对""姿势别扭""表情太僵硬"——**你不需要等用户明确说"创建 review"**。你的职责是把这段自然语言反馈转化为结构化的 review 产物，然后立即进入重绘。

### 判定 verdict

根据用户反馈的语气和意图判断 verdict：

| 用户反馈的样子 | verdict | 含义 |
|---|---|---|
| "颜色偏了""改一下表情""稍微调整姿势" | `revise` | 大方向对，需要微调。重绘时保持构图，只改指出的问题。 |
| "完全不对""重做""风格完全跑偏了" | `reject` | 方向性错误。重绘时允许更大构图变动。 |
| "这个可以""挺好的""通过" | `pass` | 满意。创建 review 记录好评，不触发重绘。 |

拿不准时默认 `revise`——大多数反馈是"改一部分"而非"全推翻"。

### 步骤

1. **确认要 review 的 version**——通常是 order 的 `currentVersion`（用户正在看的最新交付物）。

2. **整理 notes**——把用户的自然语言反馈提炼成清晰的重绘指令。不是原样复制，而是**翻译成画师可执行的语言**：
   - 用户说"颜色不对，感觉太亮了" → notes: "主色调过亮，需要调整到 persona 指定的 #1E3A5F deep navy，降低整体明度"
   - 用户说"表情太严肃了" → notes: "表情过于严厉，改为更柔和的微笑，参照 persona 的 catchphrase 氛围"
   - 用户说"手的位置怪怪的" → notes: "右手姿势不自然，调整为自然下垂或轻搭桌面"

3. **创建 review**（用 heredoc 管道把 JSON 传给写命令，不创建临时文件）：
   ```bash
   repochan review create <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "<currentVersion>",
     "verdict": "revise",
     "notes": "<提炼后的重绘指令>",
     "reviewerRole": "user"
   }
   EOF
   ```
   创建后 core 会自动把 delivered order 推回 `needs_revision`——你不需要手动改状态。

4. **verdict=pass 时停在这里**——用户满意就不重绘。review 产物已记录好评，流程结束。

5. **verdict=revise/reject 时立即进入"处理 review 回流订单"流程**——重绘。不需要问用户"要我现在重绘吗？"，用户给反馈就是要你改。

### 何时需要确认而非直接执行

只有这些情况需要先问用户：
- 用户反馈模糊到无法提炼成具体指令（"感觉不太对"但说不出哪里）
- 用户明确说"先别改，我只是说说"
- 修改涉及安全约束边界


## 处理 review 回流订单

当 order 状态是 `needs_revision` 时，说明这个订单的某个已交付版本被打回了（通过 `review.create` 的 `verdict=revise` 或 `reject`，可能是你刚自动创建的，也可能是用户之前留下的）。这不是从零生成，而是**基于上一版产物的修改**。

### 核心区别：图生图，不是从零生成

review 回流订单**必须用图生图（image-to-image）**，而非从零开始。上一版产物就是你的底图——你要在它的基础上修改，而不是重新生成一张可能风格漂移的全新图。

### 步骤

1. **读取 review notes**——这是用户/AD 给你的重绘指令：
   ```
   repochan protocol read orders/<orderId>/reviews/<versionId>.json --json
   ```
   review 的 `versionId` = 被打回的那个版本（即 order 的 `currentVersion`）。读取后关注：
   - `notes`——主要的重绘指令（如"主色调偏了，重新用 #1E3A5F"）
   - `criteriaResults`——逐条对照 `acceptanceCriteria` 的不通过项，每条 `note` 是具体问题
   - `verdict`——`revise`（微调）vs `reject`（重做），决定修改幅度

2. **读取上一版产物作为底图**——被 review 的版本目录下有交付的图像文件：
   ```
   repochan order get-result <orderId> --result-version <versionId> --json
   ```
   （`<versionId>` 是被打回的版本。）返回的 `files` 就是图生图的底图路径。

3. **组装修改型 prompt**——和正常 prompt 构建流程相同，但要**叠加 review notes 的修正指令**：
   - 正常组装 persona + order brief + template prompt
   - 在 prompt 中明确加入 review 指向的修改："adjust main color to #1E3A5F, keep existing composition and pose"
   - 如果是 `reject`（重做），允许更大的构图变动；如果是 `revise`（微调），保持构图和姿势不变，只改 review 指出的部分

4. **生成修订图像**——用上一版产物作为 `--reference <底图路径>` 传给 `repochan image gen`，并把 review notes 明确写进 prompt：
   ```bash
   repochan image gen --prompt "<叠加了 review 修正的 prompt>" --reference "<上一版产物路径>" --aspect square --size 1024x1024
   ```
   `--reference` 在 review 回流中承担图生图底图作用。prompt 应明确要求保持上一版构图/姿势/布局（revise）或只保留核心身份与质量锚点后重做（reject）。命令输出会打印生成图像路径。

5. **保存为新版本**（如 v2），`notes` 中记录"基于 review 反馈修改 v1"：
   ```bash
   repochan order create-result <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "v2",
     "files": ["<生成图像路径>"],
     "generationPrompt": "<完整 prompt>",
     "notes": "Review revision of v1. Review notes: <摘要>."
   }
   EOF
   ```
   创建结果后 order 会进入 `delivered`，用户可以再次 review v2。
