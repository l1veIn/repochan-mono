# 示例执行流程

### 设定集封面（无引用）

```
1. repochan order get ord-foundation-001 --json
   → assetType: "foundation_sheet", 不需要引用

2. repochan template get official/foundation-sheet
   → prompt_template、size、网格和技术约束

3. 读取 persona current.json
   → rolePrompt, hairColor, eyeColor, outfit, accessories, signaturePose

4. 填充模板的 prompt_template slots，并用 persona 精度字段完善各 slot

5. 从 official/foundation-sheet 解析输出规格。如果是 1:1：
   repochan image gen --prompt "<组装的 prompt>" --aspect square --size 1024x1024
   → 命令输出打印生成图像路径，例如 ~/.cache/repochan/generated-<timestamp>.png

6. 用 heredoc 管道传 payload，然后保存结果：
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-foundation-001",
     "files": ["<repochan image gen 打印的生成图像路径>"],
     "promptBrief": "<简报摘要>",
     "generationPrompt": "<传给 repochan image gen --prompt 的精确组装 prompt>",
     "revisedPrompt": "<供应商修订 prompt（如有返回）>",
     "notes": "基于 persona 生成设定集封面。无引用（首个锚点）。",
     "setCurrent": true
   }
   EOF
```

### 下游任务（带引用）

```
1. repochan order get ord-readme-hero-001 --json
   → references: [{ orderId: "ord-foundation-001", role: "character" }]

2. repochan order resolve-references ord-readme-hero-001 --json
       → [{ role: "character", orderId: "ord-foundation-001", versionId: "v1",
        files: ["<resolve-references 返回的绝对路径>"] }]

3. repochan template get <templateId> + 读取 persona current.json → 组装 prompt
   → 把 foundation 的 resolve 路径作为 `--reference` 传入生成命令，由参考图锚定角色身份

4. 从所选模板/任务解析输出规格，然后调用：
   repochan image gen --prompt "<简报>" --reference "<resolve-references 返回的绝对路径>" --aspect <landscape|square|portrait> --size <WxH>
   → 命令输出打印生成图像路径，例如 ~/.cache/repochan/generated-<timestamp>.png

5. 用 heredoc 管道传 payload，然后保存结果：
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-readme-hero-001",
     "files": ["<repochan image gen 打印的生成图像路径>"],
     "promptBrief": "<简报摘要>",
     "generationPrompt": "<传给 repochan image gen --prompt 的精确组装 prompt>",
     "revisedPrompt": "<供应商修订 prompt（如有返回）>",
     "notes": "已解析设定集封面 ord-foundation-001/v1，并通过 --reference 使用为角色锚点。",
     "setCurrent": true
   }
   EOF
```

### Review 回流（图生图修改）

```
1. repochan order get ord-foundation-001 --json
   → status: "needs_revision", currentVersion: "v1"
   → 进入 review 回流流程

2. repochan protocol read orders/ord-foundation-001/reviews/v1.json --json
   → verdict: "revise", notes: "主色调偏蓝了，persona 要求 #1E3A5F deep navy"
   → criteriaResults: [{ criterion: "配色一致", passed: false, note: "实际偏 #2B4A7B" }]

3. repochan order get-result ord-foundation-001 v1 --json
   → files: ["<resolve-references 返回的绝对路径>"]

4. 正常组装 prompt + 叠加 review 修正指令：
   "...adjust main hair/coat color to #1E3A5F deep navy, keep existing composition, pose, and layout unchanged..."

5. 用上一版产物作为底图生成修订图：
   repochan image gen --prompt "<叠加了 review 修正的 prompt>" --reference "<上一版产物路径>" --aspect square --size 1024x1024
   → 命令输出打印生成图像路径，例如 ~/.cache/repochan/generated-<timestamp>.png

6. 用 heredoc 管道传 payload，然后保存为新版本：
   repochan order create-result <<'EOF'
   {
     "orderId": "ord-foundation-001",
     "versionId": "v2",
     "files": ["<repochan image gen 打印的生成图像路径>"],
     "generationPrompt": "<完整 prompt>",
     "notes": "Review revision of v1: 主色调修正为 #1E3A5F。已用 v1 产物作为 --reference 底图进行图生图修改。",
     "setCurrent": true
   }
   EOF
   → order 回到 delivered，用户可再次 review v2
```
