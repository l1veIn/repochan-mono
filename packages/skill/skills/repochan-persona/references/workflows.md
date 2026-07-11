# 反馈回流与候选态工作流

## 接收用户反馈：自动创建 persona review 并重做

当用户对当前 persona 提出修改意见时——"角色再成熟一些""气质太冷了""换个发型"——**你不需要等用户明确说"创建 review"**。你的职责是把这段反馈记录为 persona review，然后立即重做 persona。

### 判定 verdict

persona 没有"交付物"概念，所以只有两种 verdict：

| 用户反馈的样子 | verdict | 含义 |
|---|---|---|
| "再成熟一些""气质调整""换个发型" | `revise` | 方向需要调整，按 notes 重做 |
| "这个可以""挺好的""通过" | `pass` | 满意，记录好评，不改 |

### 步骤

1. **整理 notes**——把用户的自然语言反馈提炼成 creative team 可执行的重做指令。不是原样复制，而是翻译成具体的设计调整方向：
   - 用户说"角色再成熟一些" → notes: "提升角色视觉年龄感，调整发型和服饰向更成熟的风格靠拢，保持核心身份特征不变"
   - 用户说"气质太冷了" → notes: "降低距离感，增加亲和力元素，调整表情和配饰让角色更平易近人"

2. **创建 persona review**（通过管道 stdin 传入 JSON，不要创建临时文件）：
   ```bash
   repochan persona review <<'EOF'
   {
     "verdict": "revise",
     "notes": "<提炼后的重做指令>",
     "reviewerRole": "user",
     "overwrite": true
   }
   EOF
   ```
   写入 `persona/reviews/current.json`。如果已有 review，用 `overwrite=true`（旧 review 自动归档）。

3. **verdict=pass 时停在这里**——用户满意就不重做。

4. **verdict=revise 时立即重做 persona**——读取 review notes 作为调整方向，重新走完整的 persona 生成流程（世界架构师 → 角色设计师 → 守护者），用 `persona.create` 或 `persona.update`（`overwrite=true`）写入新版本。不需要问用户"要我现在重做吗？"——用户给反馈就是要你改。

### 重做时的注意

重做不是从零开始——保留当前 persona 中用户没指出问题的部分，只调整 notes 涉及的维度。避免"推倒重来"式的大改，除非用户明确说"完全不对"。


## 候选态工作流：多人设方案生成

正常流程下，persona 是单值的——一个 `current.json`。但有时用户想看**几个不同方向的人设**再决定——"给我一个成熟风的和一个活泼风的，我选一个"。

这种场景用候选态：每个方案写成 `persona/candidates/<slug>.json`，不覆盖 current，用户选定后 promote 一个。

### 何时使用

- **用户明确要求多个方案**——"试几个不同方向""给我两个选项"。
- **项目早期探索品牌方向**——还没有定稿 persona，想并行探索。

不要主动提议候选态。只在用户要求时使用。

### 流程

1. **用 `repochan persona candidate create` 生成每个方案**（而非 `repochan persona create`，通过管道 stdin 传入 JSON，不要创建临时文件）:
   ```bash
   repochan persona candidate create <<'EOF'
   {
     "persona": { "name": "Reyna", "rolePrompt": "..." },
     "slug": "mature"
   }
   EOF
   ```
   每个 candidate 用不同的 slug（如 mature、playful）。它们不会覆盖 `current.json`——只是并行存在的草案。

2. **用户选定后，promote 一个为 current**：
   ```bash
   repochan persona candidate promote --slug mature
   ```
   被选中的 candidate 复制到 `current.json`（如果已有 current，旧值自动归档到 `versions/`），candidate 文件被删除。其余 candidate 保留。

3. **未选中的 candidate 怎么处理**：留着。用户可能改主意，或想从中提取某些元素融合到选定方案里。

### 候选态 vs review 回流

- **候选态**：还没有定稿 persona，生成多个方案让用户**初选**。
- **review 回流**：已有定稿 persona，用户反馈后**调整**（重做）。
