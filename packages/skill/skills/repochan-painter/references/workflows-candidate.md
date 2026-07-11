# 候选态工作流：多方案生成

正常流程下，每次 `repochan order create-result` 会直接把新版本设为 current 并交付。但有时用户想看**几个备选方案**再决定——"给我三个不同表情的版本选一个"。

这种场景用候选态（candidate）：每个备选方案写成 `role=candidate` 的 version，不 promote、不交付，用户/AD 选定后再 promote 一个为 current。

### 何时使用

- **用户明确要求多个方案**——"给我几个选项""试两个不同的构图"。
- **图像生成因成本需要用户控制**——不要默认生成多个候选。每次生图都有时间和 API 成本，候选数量由用户决定。

不要主动提议候选态。只在用户要求时使用。

### 流程

1. **用 `order candidate create` 生成每个备选**（而非 `order create-result`）：
   ```bash
   repochan order candidate create <<'EOF'
   {
     "orderId": "<orderId>",
     "versionId": "c1",
     "files": ["<生成图像路径>"],
     "generationPrompt": "<prompt>",
     "notes": "候选方案 A：温暖色调"
   }
   EOF
   ```
   每个 candidate 用不同的 versionId（如 c1、c2、c3）。它们不会改变 order 的 `currentVersion` 或 `status`——order 保持原状态，candidate 只是被记录为备选。

2. **用户/AD 可以对每个 candidate 先 review**（可选）：
   ```bash
   repochan review create <<'EOF'
   { "orderId": "<orderId>", "versionId": "c1", "verdict": "pass", "notes": "..." }
   EOF
   ```
   review 能直接作用于 candidate（`orderResultExists` 通过文件系统找到它）。

3. **用户选定后，promote 一个为 current**：
   ```
   repochan order candidate promote <orderId> <versionId>
   ```
   例：`repochan order candidate promote ord-readme-hero-001 c2`
   被选中的 candidate 变成 current（role=current，currentVersion 指向它）。如果 order 之前已有一个 current version，它会被降为 snapshot。其余未选中的 candidate 保持 candidate 状态。

4. **未选中的 candidate 怎么处理**：留着。它们是"备选方案"的历史记录，用户可能改主意。不需要主动删除或归档。

### 候选态 vs review 回流

这两个工作流解决不同问题：
- **候选态**：还没有定稿，生成多个方案让用户**初选**。
- **review 回流**：已经定稿交付，用户反馈后**修改**（图生图）。

两者可以组合：先候选态选一个，promote 后用户再 review 反馈修改。
