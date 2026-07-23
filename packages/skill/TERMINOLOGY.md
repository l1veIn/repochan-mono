# RepoChan Terminology Table (Chinese → English)

Canonical translations for all domain-specific terms. Use these consistently across all skill files during the i18n pass. **Do not invent alternatives.**

## System & Architecture

| 中文 | English | Notes |
|---|---|---|
| 设定集 | Foundation Sheet | The visual anchor / character reference sheet |
| 设定集封面 | Foundation Sheet (cover) | First image asset, referenced by all downstream assets |
| 视觉锚点 | Visual Anchor | What the foundation sheet serves as |
| 协议状态 | Protocol State | Managed by CLI/core, not by agents |
| 持久状态 | Persistent State | Written by CLI subcommands |
| 落盘 | Write to disk / Persist | CLI's protocol-safe write operation |
| 依赖校验 | Dependency validation | Core enforces upstream→downstream ordering |
| 产物 | Artifact | Output of a pipeline stage |
| 产出物 | Deliverable / Output | Synonym for artifact |
| 版本漂移 | Version drift | Skill version mismatch between CLI and installed skills |

## Pipeline Roles

| 中文 | English | Notes |
|---|---|---|
| 向导 | Wizard | The orchestrator skill (repochan) |
| 总指挥 | Conductor / Orchestrator | Alternative name for the wizard role |
| 分析师 | Analyst | repochan-analysis |
| 访谈专员 | Interviewer | repochan-interviewer |
| 创意团队 | Creative Team | repochan-persona |
| 美术总监 | Art Director | repochan-art-director |
| 画师 | Painter | repochan-painter |
| 模板本地化 | Starter Localizer / Assembler | repochan-page-designer |

## Pipeline Modes

| 中文 | English | Notes |
|---|---|---|
| 引导模式 | Guided Mode | Default: stop at 3 checkpoints |
| 默认体验 | Default experience | One sentence → full assets + deploy |
| 检查点 | Checkpoint | Pause point for user confirmation |
| 三档体验 | Three-tier experience | Guided / Yolo / Non-interactive |
| 逐团队 | Per-team / Single-role | Advanced mode: invoke one skill at a time |
| 非交互执行 | Non-interactive execution | CI / no TTY |
| 有人值守 | Attended (user present) | Can ask questions at checkpoints |
| 无人值守 | Unattended (no user) | Auto-decide creative choices, stop at external writes |
| 双场景 | Dual-scenario | Must support both attended and unattended |

## Persona & Character

| 中文 | English | Notes |
|---|---|---|
| 人设 | Persona | The mascot character definition |
| 看板娘 / 仓库娘 | Mascot | The repo mascot character. Both Chinese terms refer to the same concept. "Repo Girl" appears only in the persona skill's product-name explanation (Repo + -chan), not as a separate term. |
| 世界架构师 | World Architect | Persona sub-agent: builds the character's world |
| 角色设计师 | Character Designer | Persona sub-agent: designs the character |
| 一致性守护者 | Consistency Guardian | Persona sub-agent: anti-overfit + anti-language-leak |
| 防过拟合 | Anti-overfit | Prevent persona from being a copy of the repo |
| 语言泄漏 | Language leak | Prevent Chinese aesthetics when repo has Chinese README |
| 分量匹配 | Project-weight matching | Light repos → grounded persona; heavy repos → high-concept OK |
| 高概念 | High-concept | Elaborate world-building for medium/heavy repos |
| 日常型 | Grounded / Everyday | Simple persona for light repos |
| 叙事字段 | Narrative fields | persona JSON fields describing character |
| 角色书 | Character book | LLM role-context entries for the character |
| 口头禅 | Catchphrase | Character's signature line |
| 座右铭 | Motto | Character's guiding principle |
| 人物小传 | Backstory | Character's history |
| 性格缺陷 | Character flaws | Endearing weaknesses |
| 小趣事 | Fun facts | Character trivia |
| 主色 | Main color | Primary brand color |
| 辅助色 | Secondary color | Supporting brand color |
| 强调色 | Accent color | Pop/highlight color |

## Art & Image

| 中文 | English | Notes |
|---|---|---|
| 约稿 / 创作任务 | Asset Order / Creation Order | Brief for an image generation task |
| 订单 | Order | Short for Asset Order |
| 简报 | Brief | The description part of an order |
| 简报描述纪律 | Brief-writing discipline | Rules for writing image gen prompts |
| 正向描述 | Positive description | Describe what you WANT, not what you don't want |
| 护栏 | Guardrail | Lightweight avoid-list, not the main direction |
| 多词限定短语 | Multi-word qualifying phrases | Preferred over single adjectives in English prompts |
| 语义半径 | Semantic radius | Single English adjectives have oversized meaning in image models |
| 参考图 | Reference image | Used for visual continuity |
| 基础图 / foundation | Foundation | First generated image, visual anchor for downstream |
| 下游 | Downstream | Assets that reference the foundation |
| 上游 | Upstream | Earlier pipeline stages |
| 立绘 | Full-body standing pose | Standard character reference illustration |
| 三视图 | Three-view / Turnaround sheet | Front, side, back views |
| 贴纸 | Sticker | Decorative sticker asset |
| 表情包 | Emoji / Reaction pack | Expression variants |
| 头像 | Avatar | Profile-picture asset |
| 横幅 | Banner | Wide header image |
| 海报 | Poster | Promotional poster asset |
| 图标字体 | Icon font | Typography asset |
| 主视觉 | Key visual / Hero image | Main visual for website hero section |
| 色板 | Color palette | Set of brand colors |

## Art Styles

| 中文 | English | Notes |
|---|---|---|
| 孟菲斯 | Memphis | Geometric, bold, 80s-inspired design style |
| 构成主义 | Constructivism | Geometric, structural art style |
| 装饰艺术 | Art Deco | Elegant, ornamental 1920s style |
| 赛璐珞 | Cel-shaded | Anime-style flat coloring |
| 半厚涂 | Semi-thick paint | Between cel and fully rendered |
| 故障美学 | Glitch art | Digital corruption aesthetic |
| 水彩 | Watercolor | Soft, translucent paint style |

## Web & Starter

| 中文 | English | Notes |
|---|---|---|
| 模板 | Starter / Template | Pre-built Astro site |
| 本地化 | Localization | Adapting starter content for a specific project |
| 装配 | Assembly | Plugging assets + data into a starter |
| 母稿 | Master design / Page master | Complete page design with sections |
| 槽位 | Slot | A placeholder in a starter for project-specific content |
| 信息架构 | Information architecture | Site structure and navigation |
| 艺术方向 | Art direction | Visual concept for the website |
| 门控 | Gate | Quality gate (Gate 1 = design, Gate 2 = implementation) |
| 产品化 | Productization | Turning a Gate-2 page into a reusable starter |
| 转换套件 | Transfer kit | Files needed to productize a starter |
| 响应式 | Responsive | Adapts to screen sizes |

## Actions & Behaviors

| 中文 | English | Notes |
|---|---|---|
| 续跑 | Resume / Continue | Pick up from where the pipeline left off |
| 微调 | Tweak / Fine-tune | Small revision to an existing artifact |
| 重绘 | Regenerate | Re-do an image generation |
| 全套资产 | Full asset suite | Complete set of brand assets |
| 全流程 | Full pipeline | End-to-end from analysis to deploy |
| 跑到底 | Run to completion | Run without stopping (yolo mode) |
| 串起来 | Chain together | Orchestrate skills in sequence |
| 一步到位 | One-shot / All at once | Generate everything in one go |
| 全默认 | All defaults | Accept all creative defaults (yolo) |

## CLI & Commands

| 中文 | English | Notes |
|---|---|---|
| 初始化 | Initialize | `repochan init` |
| 状态 | Status | `repochan status` |
| 分析 | Analysis | `repochan analysis` |
| 访谈 | Interview | `repochan interview` |
| 人设 | Persona | `repochan persona` |
| 订单 / 任务 | Order | `repochan order` |
| 基础图查找 | Foundation find | `repochan foundation find` |
| 出图 | Generate image | `repochan image gen` |
| 浏览 | Browse | `repochan browse` |
| 设置 | Setup | `repochan setup` |
