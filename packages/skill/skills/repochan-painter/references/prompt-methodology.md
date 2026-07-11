# Prompt 方法论

## Avoid → positive transform

Image models treat "not X" as a directional push, not a wall. Each `avoid` entry must be either **converted to a positive anchor** or **dropped** before entering the prompt:

| avoid 条目 | → 正向替换 | 或丢弃 |
|-------------|----------------------|---------|
| not sci-fi / not cyberpunk | contemporary, modern-day | — |
| not too clean | (保留 — 难以正向表达) | — |
| not steampunk | present-day, 21st-century | — |

规则：
1. **【最高优先级·自检强制】禁止生成"避免文字"类约束**：在写 `avoid:` 块之前，先自检——你即将写的 avoid 条目里有没有任何关于"文字/字母/标签/no text/不要文字/无文字/words/letters"的内容？如果有，**全部删除，不要写进 prompt**。这是模型最容易犯的错误：把"避免文字"当成安全默认塞进 avoid，结果让设定图失去所有 callout 标签和配色卡文字。现代图像模型（尤其 codex image-2）渲染文字能力很强，设定图文字是正向价值。**写完 avoid 块后，再读一遍，确认没有任何文字相关的禁令——如果有，删掉。**
2. **优先转化**：如果 avoid 项暗示了期望的正向状态，直接写正向状态。"not shabby" → "well-maintained, tidy"。"not futuristic" → "contemporary, modern era"。
3. **绝不把原始否定传进 prompt。** 最终 prompt 必须读起来是一串正向的、陈述性的视觉描述。如果一个概念只能用否定表达，把它留在 `avoid` 里，让正向替换去做事。
4. **不要过度堆叠限定词。** 每个 avoid 项最多 2-3 个正向替换——更多会导致形容词过载（见下方）。


## Identity boundary before prompting

Before finalizing the prompt, scan persona/order terms for language-to-aesthetic leakage. Natural-language evidence from README/docs/commits/UI copy must not add culture-coded visual tokens to the image prompt. Terms like rice paper, scroll, seal, lantern, bamboo, jade, kimono, shrine, quill, castle, etc. are allowed only when explicitly requested, directly tied to the repository/product domain, or already locked by a user-approved reference image/foundation anchor.

For foundation sheets with no reference image, be stricter: if a culture-coded prop only traces to document language, remove it or replace it with a repo-derived metaphor from `analysis.context.identity`, `preAnalysis`, `abstract`, color palette, product domain, or user request.

旧模板 fallback 的 prompt structure（有 `prompt_template` 时不要套用整段固定结构，而是把需要的信息填入 slot）：

**Asset-type conditional injection note**: `signaturePatterns` / `signatureScenes` are not fixed lines in every prompt. Inject them only when the asset type/template calls for them: texture/pattern assets inject `signature pattern concepts: {signaturePatterns}`; background/poster assets inject `signature scene: {signatureScenes}`. Do not inject either line for `foundation_sheet`.

```
{template layout and technical constraints},
Name: {persona.name} ({persona.nameJa} if anime/manga),
{rolePrompt},
main illustration must use signature pose: {signaturePose — action verb + body part + prop interaction + emotion, e.g. "right foot raised on toes, body leaning forward, left fist clenched at chest, right hand extended palm-up supporting a swirling golden data stream, confident slight smile, sharp gaze"},
show signature action as a small visual cue: {signatureAction — a separate narrative mini-scene depicting the character's signature ability/behavior},
hair color: {hairColor with hex},
eye color: {eyeColor with hex},
outfit: {outfit — layered garment description, each layer with material + color + structural detail},
accessories: {accessories — each named prop with its function/material},
key motif callouts: {keyMotifs — named symbols with parenthetical gloss, e.g. "caduceus (simplified), terminal cursor (▌), memory crystal (hexahedron)"},
expression direction: {personality mapped to expression — how the character's inner state reads on their face},
color palette: {main, secondary, accents with hex},
design notes: {stylistic fusion guidance, e.g. "classical heraldry elements fused with modern flat/tech aesthetic; keep clean lines, avoid excess ornament"},
avoid: {explicit negative list — over-youngified (<16), overly revealing clothing, cluttered background, dark/horror tone, realistic oil-painting style},
{order-specific mustInclude}, {positive-transformed brief elements}
```

**Structured blocks rationale**: Labeled blocks (`outfit:`, `accessories:`, `signature pose:`) give the image model anchored semantic context for each component, producing more coherent and specific renders than undifferentiated comma-separated tag lists. Each block should be a complete, descriptive phrase — do not abbreviate.


## 中英文混排策略（English skeleton + Chinese flesh）

现代图像模型（如 codex image-2）对中文描述的理解力很强。**不要把所有中文细节都翻译成英文 tag——中英文混排能保留更丰富的语义，生成质量更高。** 参考这个经过验证的混排模式：

**用英文的部分（骨架——画风/构图/角色身份 tag）：**
- 质量与风格标签：`masterpiece, best quality, anime style, detailed hair, dynamic pose`
- 构图与布局：`single clean character concept sheet layout, full-body, chibi, expression headshots`
- 角色身份骨架 tag：`1girl, long golden hair fading to silver gray, amber eyes`（发色/瞳色/性别等核心 tag 用英文，因为 Danbooru tag 体系对这些有精确映射）
- 颜色 hex 值：`#FFD700`、`#1E293B`（与语言无关）

**可以用中文的部分（血肉——细节描述/姿势/心理/设计说明）：**
- 角色名：`character name: 赫米亚`（中文名直接用，比音译保留更多身份感）
- 年龄外观：`age appearance: 18`
- 整体外貌细节：`overall appearance: 身高165cm，纤细匀称，姿态干练...`（中文描述比英文 tag 能承载更多细节层次）
- 姿势动作：`main illustration must use signature pose: 右脚微踮，身体前倾，左手握拳在胸前，右手向前伸展...`（动作的连贯叙事用中文更精准）
- 表情心理：`expression direction: 严谨可靠的外表下藏着灵活的思维...`
- 设计说明：`design notes: 古典信使元素与现代扁平/科技感融合...`
- avoid 列表：`avoid: 过度幼态, 暴露服装, 杂乱背景...`

**原则**：tag 类信息（短、离散、有 Danbooru 映射）用英文；描述类信息（长、连贯、有叙事性）用中文。如果一个信息既能用英文 tag 又能用中文描述，优先中文描述——它承载的细节更丰富。最终 prompt 是中英混合的自然文本，不是纯英文 tag 列表，也不是纯中文。

**Pose writing technique** (critical for dynamic images): a good pose names 3-4 body parts + a facial/emotional cue, and **聚焦一只手的主要动作**。

**关键原则：单手聚焦，避免多手任务堆叠（防三只手）。** 实测证实：当一个 pose 描述里**两只手各有独立复杂任务**时（如"右手食指点下巴 + 左手抱胸 + 左手夹笔"），模型为了满足所有约束会"长出"第三只甚至第四只手。根因是模型把复合动作拆解成独立任务后无法用两只手完成。

规则：
- **一只手做"主要动作"**（拿道具/施法/指向/托举），描述要具体（手型 + 道具 + 位置）。
- **另一只手做"自然状态"**（垂在体侧/轻搭桌面/自然摆放），描述要模糊简短。
- **绝不让两只手都拿不同道具或都做精细动作。**
- BAD: "右手食指轻点下巴，左手环抱胸前，指尖夹一支银色钢笔"（双手都精细 + 抱胸与夹笔被拆成两个动作 → 三只手）
- GOOD: "右手持银色钢笔悬于脸颊旁作思考状，左手自然垂在体侧"（单手聚焦 → 双手正常）
- GOOD: "右脚微踮，身体前倾，右手向前伸展掌心向上托起一团旋转的金色数据流，左手自然握拳轻搭腰侧，嘴角含笑"（主手拿数据流，副手简短状态）

BAD: "standing at a workbench". Always convert static verbs ("standing", "sitting") into kinetic descriptions——但动态描述也要遵循上面的单手聚焦原则。

**Do NOT describe layout positions** (no "TOP-LEFT:", "CENTER:"). Image models don't follow spatial instructions well — use descriptive tags for content, not spatial coordinates.


## Adjective precision control

Single English adjectives carry oversized semantic radius in image models — far larger than Chinese intuition suggests. A word that means "slightly worn" to you can mean "decaying ruin" to the model.

| risky single adjective | model interpretation | safer multi-word phrase |
|----------------------|---------------------|------------------------|
| shabby | dirty, cheap, abandoned | well-worn but maintained |
| disheveled | unkempt, messy, wild | slightly tousled, casual |
| worn | tattered, broken | with signs of everyday use |
| aging building | century-old ruin | older building, established structure |
| leather-bound notebook | medieval manuscript | professional leather notebook |
| tuning fork + oscilloscope | 19th-century physics lab | modern measurement instruments |

Rules:
1. **Never use a single adjective where a 2-3 word phrase carries tighter meaning.** "worn" → "with signs of everyday use". "shabby" → "lived-in, well-maintained".
2. **Anchor nouns to a contemporary frame by default.** "notebook" alone can drift to scroll/manuscript; "modern notebook" or "spiral-bound notebook" pins it down. "building" → "contemporary building".
3. **Pair era-sensitive nouns with an era qualifier.** Any noun with historical range (building, instrument, book, tool, workshop, laboratory) gets an era word: "contemporary", "modern", "present-day", "21st-century".
4. **When in doubt, describe function over aesthetic.** "measuring tool" is safer than "instrument" because the model has less room to wander into antique territory.

**重要平衡（不要过度压缩）**：上面的规则是为了避免**单个模糊形容词**漂移，**不是**让你把所有描述压缩成最简短语。对于**角色定义要素**（signature pose、signature action、key motif callouts、expression direction、核心道具的功能叙事），要写得**丰富、具体、有画面感**——多个精确短语的组合远好于一个干瘪标签。压缩只针对**有漂移风险的模糊形容词**（shabby/worn/disheveled 这类），不是针对所有描述。判断标准：pose 和 action 块应该读起来像一段电影分镜，而不是一个标签。
