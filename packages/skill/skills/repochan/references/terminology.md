# RepoChan domain language

This is the authoritative glossary for RepoChan's product and domain language. Use it when writing documentation, skills, user-facing labels, or domain interfaces. Definitions describe the product; schemas and CLI help define the exact serialized fields and command arguments.

## Product and execution

| Term | 中文 | Definition |
| --- | --- | --- |
| RepoChan | RepoChan | A repository-to-brand workflow used by an external coding agent to create a mascot, consistent visual assets, and a project website. |
| Agent | Agent | The user's external coding agent that makes creative decisions and runs RepoChan commands. |
| Skill | Skill | Markdown instructions for an Agent's role or workflow. |
| Wizard | 向导 | The Skill that routes the user's request and coordinates the relevant roles. |
| Artifact | 产物 | A persisted output of a workflow stage, such as an analysis, persona, or order result. |
| Protocol State | 协议状态 | The project's authoritative, versioned creative state maintained through RepoChan's entity operations. |
| Asset | 素材 | An image or other usable visual resource; an Asset may be an original result or a derived file. |

Use **Wizard**, not separate roles named Conductor or Coordinator. Use **Artifact** for persisted stage outputs and **Asset** for visual resources; these are related concepts, not interchangeable names.

## Roles

| Role | 中文 | Responsibility |
| --- | --- | --- |
| Analyst | 分析师 | Establishes repository evidence and interprets what the project is. |
| Interviewer | 访谈专员 | Collects the user's preferences and project intent. |
| Creative Team | 创意团队 | Designs the mascot Persona, with World Architect, Character Designer, and Consistency Guardian perspectives. |
| Art Director | 美术总监 | Defines Asset Orders and their visual dependencies. |
| Painter | 画师 | Generates and delivers original images for approved Asset Orders. |
| Starter Localizer | Starter 本地化师 | Adapts an existing Source Starter for a target project. |
| Web Designer | 网站设计师 | Designs and implements an original project website. |
| Starter Designer | Starter 产品化师 | Preserves an accepted project website as a creator-owned Source Starter and Transfer Kit. |

**Page Designer** is not a current role. Name Starter Localizer, Web Designer, or Starter Designer according to the actual responsibility. Starter Designer names the productization role; it does not give the role ownership of official catalog acceptance.

## Character and image production

| Term | 中文 | Definition |
| --- | --- | --- |
| Mascot | 看板娘 / 仓库娘 | The project's personified character. Both Chinese names refer to the same character concept. |
| Persona | 人设 | The mascot's identity, personality, world, appearance, and narrative definition. |
| Foundation Sheet | 角色设定封面 | The first character-design image and visual reference for subsequent character assets. “设定集” and “foundation” are shorthand for this same concept. |
| Visual Anchor | 视觉锚点 | The role a Foundation Sheet plays in preserving character continuity. |
| Asset Order | 素材订单 | An execution brief describing an asset's intent, constraints, expected deliverables, and references. Use Order as its short form. |
| Brief | 创作简报 | The creative intent and constraints within an Asset Order. |
| Deliverable | 交付要求 | A requested output of an Asset Order, distinct from a file that has actually been delivered. |
| Order Result | 订单结果 | A materialized, versioned image-generation output and its provenance. |
| Candidate | 候选 | A persisted proposal that has not been selected as the Current Version. |
| Current Version | 当前版本 | The selected version of an Artifact; selection does not necessarily mean the newest version. |
| Review | 评审 | Feedback about a specific subject or version. A Review is distinct from permission to execute an Order. |
| Reference | 参考 | An Order Result or file used to constrain character identity, style, or composition. |
| Layout Guide | 布局参考图 | A deterministic composition reference that describes grid geometry and safe zones before generation. |
| Derived Asset | 派生素材 | A local pixel-processing output produced from an original image during assembly. It does not replace the original Order Result. |
| Asset Template | 资产模板 | A reusable image brief with output dimensions and constraints. It is not a website Starter. |

## Order lifecycle

These are the six **Order Status** values, not website completion states or aesthetic verdicts.

| Status | 中文 | Meaning |
| --- | --- | --- |
| `draft` | 草稿 | An Order being prepared for execution approval. |
| `approved` | 已批准执行 | An Order authorized for execution within the user's permitted scope. |
| `in_progress` | 执行中 | An authorized Order currently being generated or revised. |
| `delivered` | 已交付 | An Order with a materialized Current Version; delivery alone is not aesthetic acceptance. |
| `needs_revision` | 待修改 | An Order that requires a further revision. |
| `cancelled` | 已取消 | An Order whose execution has been cancelled. |

## Websites and reuse

| Term | 中文 | Definition |
| --- | --- | --- |
| Starter | 网站 Starter | A complete website that can be copied and localized for another project. Avoid the unqualified word Template when a website is meant. |
| Source Starter | 源 Starter | The finished, creator-owned website used as the source for localization, preserving its original project identity and assets. |
| Pulled Instance | 拉取实例 | The target project's editable copy of a Source Starter. |
| Transfer Kit | 迁移套件 | The concentrated configuration, locale, asset-slot, and preview surfaces used to localize a Source Starter. It is part of the full website. |
| Asset Slot | 素材槽位 | A declared place where project-specific visual assets are replaced during localization. |
| Scalar Slot | 单文件槽位 | An Asset Slot with one output file. |
| Bundle Slot | 素材组槽位 | An Asset Slot with multiple named output files produced together. |
| Localization | 本地化 | Adapting a Pulled Instance's content, project identity, and declared assets for its target project. |
| Assembly | 装配 | Applying configuration and generated assets to the target website, including deterministic pixel processing. |
| Productization | 产品化 | Preserving an accepted project website as a reusable Source Starter with a complete Transfer Kit. |
| Gate 1 | 设计验收 | Acceptance of an original website's design before implementation. |
| Gate 2 | 实现验收 | Acceptance of the implemented original website against the design and validation evidence. |

## Completion and authorization

| Term | 中文 | Definition |
| --- | --- | --- |
| Runnable | 可运行 | The website has sufficient dependencies, configuration, and assets to run or build. |
| Source | 原始素材 | A slot still uses its Source Starter's finished asset. It can be Runnable without being Customized. |
| Customized | 已定制 | The required project-specific content and assets have been replaced for the target project. |
| Approved | 已验收 | A specified reviewer accepted an exact subject or version. State whether the reviewer was human or an automatic process. |
| Productized | 已产品化 | An accepted project website has become a creator-owned Source Starter with the required localization surfaces. |
| Deployed | 已部署 | An exact build has been published to a specified target with verifiable evidence. |
| Checkpoint | 确认点 | A point where the guided workflow obtains feedback before continuing. |
| Guided Mode | 引导模式 | The default workflow, with checkpoints for Persona, Foundation Sheet, and deployment. |
| Yolo | 全默认 | The user's explicit request to accept default creative choices within an authorized scope. |
| Non-interactive Execution | 非交互执行 | Execution without an interactive user interface; it does not grant additional external-write authorization. |
| Single-role Execution | 单角色执行 | Execution of the specifically requested role rather than the entire workflow. |

Runnable, Customized, Approved, Productized, and Deployed are distinct claims. A build, a schema check, or an auto-selected design cannot stand in for human aesthetic acceptance or a deployment receipt.
