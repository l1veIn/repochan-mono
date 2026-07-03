# RepoChan 架构说明

> 本文档定义 RepoChan 的架构本质、分层结构、与同类系统的关系，以及已知的架构缺口。
> 它是后续所有功能决策（候选态、评审 artifact、失效传播等）的共同前提。
> 所有论断都落到具体代码引用上，便于核对。

---

## 一、RepoChan 是什么

**RepoChan 是一个 LLM-native、本地优先的创意生产管线追踪系统（creative production tracking system）。**

它用文件系统做数据库、用 schema 做交付契约、用状态机做流转控制，把"创意素材从需求 → 草案 → 评审 → 定稿"这条传统上由 ShotGrid / ftrack 在云端管人协作的链路，重构成一个由 LLM 在本地执行、可审计、可重入的工作流。

三个限定词逐个拆：

- **LLM-native**：执行者是 LLM（通过 Pi 技能），不是人。这决定了系统必须用 schema 校验交付物形状——因为 LLM 的自然语言输出无法直接被下游消费。
- **本地优先**：所有状态落在项目内的 `.repochan/` 目录，不依赖外部数据库或云服务。`current.json` 是当前真相，`versions/` 是不可变审计日志。人机都能 `cat`、`diff`、`git blame`。
- **创意生产管线追踪**：这是产品品类。它不是"对话 agent"，不是"通用 coding agent"，而是一个管"创意素材如何被需求、生产、评审、定稿"的系统。把 `assetType` 从 `foundation_sheet` 换成 `shader` / `3d_model` / `motion_graphics`，逻辑不变。

### 它解决的问题

LLM 自由对话模式做不了"可追踪、可审计、可重入的批量创意生产"——对话一结束，中间状态就蒸发。下一个角色（或下一次会话）拿不到结构化的上游产物，只能重新读对话历史或重新生成。

RepoChan 给 LLM 提供一套**交付拓扑**：每个角色的工作目标不是"说一段话"，而是"按 schema 产出一个落盘的、被校验过的、可被下游引用的 artifact"。LLM 的自由度被限制在"从一个合法节点走向下一个合法节点"，而不是"自由发挥"。

---

## 二、三层结构

架构核心是一个分层原则：**能被形式化的约束，一律下沉成确定性代码；不能被形式化的判断，才上浮成 prompt（skill）。**

```
┌─────────────────────────────────────────────────────────┐
│  Skill 层（软约束 / prompt）                              │
│  Painter 怎么构图、Interviewer 怎么提问、AD 怎么评判好坏   │
│  packages/pi/skills/*.md                                  │
├─────────────────────────────────────────────────────────┤
│  Business Rules 层（硬约束 / 代码）                        │
│  状态机、依赖门、审批门、破坏性操作显式确认                  │
│  packages/core/src/entities.ts                            │
├─────────────────────────────────────────────────────────┤
│  Protocol 层（载体 / 版本化）                              │
│  current.json + versions/ 双轨制、safe path、依赖链检查     │
│  packages/core/src/protocol/index.ts                      │
├─────────────────────────────────────────────────────────┤
│  Schema 层（契约 / 形状）                                  │
│  artifact 形状、params gate、schemaVersion                │
│  packages/core/src/schemas/index.ts                       │
└─────────────────────────────────────────────────────────┘
```

### 1. Schema 层 — 交付物的"形状契约"

**职责**：定义 agent 最终要交付什么形状的东西。消除 LLM 自由格式输出。

- 入口：`packages/core/src/schemas/index.ts`
- 定义了 `PersonaArtifactSchema`、`OrderResultVersionSchema`、`InterviewArtifactSchema`、`PageArtifactSchema` 等 artifact 形状。
- 每个 artifact 带 `schemaVersion`、`generatedAt`、`provenance`。
- 同时定义写操作的 `*ParamsSchema`（如 `OrderCreateResultParamsSchema`），作为 params gate。
- `WriteOpSchemas` 注册表把 action 名映射到 params schema。

**关键设计**：schema 是 **gate，不是 entity 的镜像**。`schemas/index.ts` 顶部的注释明确写了——schema 只校验"agent 传了正确形状的参数"，业务规则（状态迁移、条件必填如 image-gen prompt）在 `validateInput` 通过**之后**由 entity 函数检查。schema 不 strip 未知字段（`additionalProperties` 不禁），因为 agent 可能传 provenance / meta / 未来字段。

**校验入口**：`packages/core/src/validate.ts` 的 `validateInput(action, schema, params)`，在每个写操作的开头被调用（例如 `analysis/write-artifact.ts:18`）。

### 2. Protocol 层 — 交付物的"存放与版本化"

**职责**：schema 定义了形状，protocol 定义形状写到哪、怎么版本化、怎么防止覆盖、怎么定位。

- 入口：`packages/core/src/protocol/index.ts`
- **双轨制**：每个 artifact 有 `current.json`（当前真相 / read model）和 `versions/<timestamp>.json`（不可变历史 / event log 的近似）。
- **安全写入**：`writeJson(file, data, overwrite)` 在 `overwrite=false` 时拒绝覆盖已存在文件（`protocol/index.ts:55`）。
- **路径安全**：`safeProtocolPath` 拦截 path traversal，确保所有写入落在 `.repochan/` 内。
- **依赖链检查**：`requireAnalysis` → `requirePersona` → `requireInterview` → `requirePage`（`protocol/index.ts:175-202`），每个写操作调用对应的 require 函数，强制上游 artifact 必须先存在。

**目录布局**（`initProtocol`）：

```
.repochan/
  analysis/{current.json, versions/}
  persona/{current.json, versions/}
  interview/{current.json, versions/}
  orders/<order-id>/{order.json, versions/<version-id>/}
  pages/{current.json, versions/, site/}
```

**版本化策略**：`protocolVersionPath` 把 `xxx/current.json` 映射到 `xxx/versions/<timestamp>.json`。order 的版本更细——每个 versionId 是一个目录，里面放 `meta.json` + 实际产物文件（png 等），`order.json.currentVersion` 指向当前选中的版本。

### 3. Business Rules 层 — 交付的"业务边界"

**职责**：定义"能不能从一个合法节点走到下一个合法节点"。这是最厚的一层。

- 入口：`packages/core/src/entities.ts`
- **状态机**：`OrderStatusSchema` 定义六种状态（`draft` / `approved` / `in_progress` / `delivered` / `needs_revision` / `cancelled`），`isValidStatusTransition` 拦非法跳变（如 `delivered → draft`），在 `setOrderStatus` 中强制（`entities.ts:264`）。
- **依赖门**：`createOrder` 要求 `requireAnalysis + requirePersona`（`entities.ts:180-181`）；`createOrderResult` 要求 `requireAnalysis + requirePersona + ensureOrderApprovedForExecution`（`entities.ts:330-336`）。
- **审批门**：`ensureOrderApprovedForExecution`（`entities.ts:52`）—— order 必须是 `approved` / `in_progress` 才能 create_result。`allowUnapprovedOrder=true` 是 escape hatch，但仅在"用户显式批准"后使用。
- **破坏性操作显式确认**：`persona.update` / `order.update` / `analysis.update` 都硬性要求 `overwrite=true`，且错误信息明确提示"after explicit user approval"（如 `entities.ts:240`）。
- **可复现性**：`createOrderResult` 强制保存 `generationPrompt`（原始）和 `revisedPrompt`（修订），并在缺 prompt 时抛错（`entities.ts:345-354`）——这是 LLM-native 管线特有的"render recipe"要求。

### 4. Skill 层 — 软约束 / prompt

**职责**：处理无法被形式化的判断——构图审美、提问策略、好坏评判。

- 入口：`packages/pi/skills/*/SKILL.md`
- 这一层是**最薄**的：它不重复 schema/protocol/business-rules 已经强制的规则，只补充"怎么把工作做好"的引导。
- 例子：Painter skill 讲构图原则和 prompt 工程技巧；Art Director skill 讲怎么把模糊需求拆成 brief；Interviewer skill 讲怎么从 analysis 信号推导该问什么问题。

**分层原则的体现**：当你发现一条规则既能写成代码又能写成 prompt 时，**优先写成代码**。代码是确定性的、可测试的、不会随 context window 遗忘的；prompt 是概率性的。prompt 越薄、代码层越厚，系统越可靠。

---

## 三、与同类系统的关系

### 范式定位

按"什么是系统的真相来源"分类：

| 范式 | 真相来源 | 代表 | RepoChan 的关系 |
|---|---|---|---|
| Message-centric | 对话历史 | AutoGen / ChatGPT | RepoChan 不用——对话结束状态蒸发 |
| State-centric | 内存 state 对象 | LangGraph (TypedDict State) | RepoChan 不用——state 需要外部 checkpointer 持久化 |
| Task-centric | 任务清单 + 预期产出描述 | CrewAI (Task + expected_output) | RepoChan 的 order 接近，但更严格——order 有状态机 |
| **Artifact-centric** | **磁盘上的版本化产物** | **RepoChan** | **本系统** |

Artifact-centric 在 2025 年已被学术界正式命名（参见 Narajala et al. 2025；Belardinelli et al. 2013 的形式化模型）。RepoChan 独立走到了这条路上。

### 与 LangGraph / CrewAI 的本质分野

- **LangGraph** 把**控制流**下沉成图（node + edge），但交付物语义漂在 state dict 里——它不校验 state 内容的形状。
- **CrewAI** 把**角色**下沉成 Agent，但交付物语义只在 `expected_output` 的自然语言描述里——agent 产出一个差不多的字符串就算交差。
- **RepoChan** 把**交付物语义本身**下沉了——交付物的形状（schema）、存放（protocol）、流转（business rules）全是确定性的，agent 没有糊弄的空间。

一句话：传统框架用 prompt 定义规则，RepoChan 用代码定义规则，prompt 只剩必须靠 LLM 判断的部分。

### 与 ShotGrid / ftrack 的对应

RepoChan 的数据模型是 production tracking 系统的本地化、LLM-native 简化版：

| RepoChan 概念 | ShotGrid 对应 | 说明 |
|---|---|---|
| `order.json` | Task + Version entity | 创作需求 + 版本化产物 |
| `OrderStatus` 状态机 | Version Status (apr / client apr / delivered) | 生命周期流转 |
| `orderAsset.versions[]` | Version entities | 版本化产物历史 |
| `currentVersion` 指针 | "latest / current" published version | 当前真相指针 |
| `brief.intent/mustInclude/avoid` | Task brief / content | 创作需求 |
| `acceptanceCriteria[]` | Review checklist | 评审标准 |
| `generationPrompt` + `revisedPrompt` | render recipe / publish provenance | 可复现性（RepoChan 更精细） |
| `.repochan/` 目录 | 项目数据库 | 本地文件系统 vs 云端 DB |

**RepoChan 做得更精细的地方**：同时保存原始 prompt 和修订 prompt，相当于 render manifest。这是 LLM-native 管线特有的，传统 production tracking 只存最终文件。

**RepoChan 目前缺失的（见第五节）**：候选态（多 version 并行 review）、评审 artifact（review session）、失效传播（dependency graph）。

---

## 四、Monorepo 包结构

```
packages/
├── core            @repochan/core            纯 TS 库：protocol + schema + business rules + 确定性分析。零 Pi 依赖。
├── pi              repochan-pi               Pi 包：repochan 工具 + /order_panel + 角色技能。
├── image-gen-pi    @repochan/image-gen-pi    Pi 包：多 provider 图像生成（Codex OAuth / FAL / OpenAI / xAI）。
├── page-renderer   @repochan/page-renderer   Page JSON → 零-JS 静态 HTML 渲染器。
└── cli             repochan                  用户 TUI：wizard、角色页、CLI 命令、i18n。
```

### 依赖方向（必须单向，不可反向）

```
cli ──┬──> pi ──┬──> core
      │         └──> page-renderer ──> core
      └──> image-gen-pi
```

- `core` 是叶子，**绝不** import Pi / ExtensionContext / agent prompt 逻辑（见根 `AGENTS.md`）。
- `pi` 从 `@repochan/core` 复用 protocol/schema/rule 代码，自身只做 Pi 运行时集成和 prompt。
- `page-renderer` 依赖 `core` 的 `PageArtifactSchema` 类型，是纯渲染库。
- `image-gen-pi` 独立于 `core`，只提供图像生成能力，被 `pi` 和 `cli` 消费。
- `cli` 是最上层，聚合所有包，面向终端用户。

### 各层职责边界

| 层 | 能做 | 不能做 |
|---|---|---|
| `core` | 读写 `.repochan/`、校验 schema、执行业务规则、确定性分析 | import Pi、写 prompt、依赖 ExtensionContext |
| `pi` | 注册工具、定义技能 prompt、Pi TUI 集成 | 重新实现 protocol/schema（必须从 core import） |
| `page-renderer` | 把 Page JSON 渲染成 HTML | 读 `.repochan/`（由调用方传入数据） |
| `image-gen-pi` | 调用图像 provider、管理 config | 知道 `.repochan/` 协议（由调用方编排） |
| `cli` | 编排工作流、TUI 交互、i18n | 实现业务规则（必须委托 core） |

---

## 五、已知的架构缺口

这些是当前架构的边界，按对工业界解法的借鉴顺序列出。每一条都是未来功能的候选入口。

### 缺口 1：候选态（candidate / branching）缺失

**现状**：artifact 是单值的——一个 `persona/current.json`、一个 order 的 `currentVersion` 指针。`versions/` 存的是**时间维度的快照**，不是**候选维度的分支**。

**问题**：创作工作流天然需要"给我三个 persona 草稿让我选"。当前协议处理 A/B 选择很别扭。

**工业界解法**：ShotGrid 用 Playlist + 多 Version 并行 review。RepoChan 需要引入"候选维度"概念——可能是 `persona/candidates/<id>/` 或 order 下多个未指定 current 的 version 同时存在，由用户显式 promote 一个为 current。

**用户决策已记录**：图像 order 因成本高，候选态由用户显式控制开启与否；persona 档案支持多草稿候选（创意团队设计多个差异化人设供用户选择）。

### 缺口 2：评审 artifact（review）缺失

**现状**：Art Director 存在（skill 层），但 review 是纯 prompt 行为，不是协议行为。agent **可以跳过 review 直接 deliver**——`order.create_result` 只要求 order 是 approved，不要求存在已批准的 review。

**问题**：质量审查没有硬锚点。deliver 的质量完全依赖 Painter 自觉和 prompt 约束。

**工业界解法**：ShotGrid 用 Notes + Approval 流转。RepoChan 应引入 `review` artifact（评审报告 schema），让 `markDelivered` 前要求一个已批准的 review。这把审查从软约束升级成硬约束。

### 缺口 3：失效传播（stale propagation）缺失

**现状**：persona 改了 → 依赖它的 order brief 可能过时 → page 又引用了 order 的 result。`collectAssetRefs` / `checkPageAssets`（`entities.ts:607` / `642`）能正向解析 page 对 order result 的引用，但**没有反向 stale 标记**——改上游不会让下游自动失效。

**问题**：长期项目累积"幽灵不一致"。用户以为下游是最新的，其实引用了过时上游。

**工业界解法**：ShotGrid 用显式 dependency graph + cross-project asset linking，改上游触发下游 stale 标记。RepoChan 的 `collectAssetRefs`（`entities.ts:607`）能正向解析引用，但缺反向失效标记。

**技术选型待定**：当前 versions/ 存的是快照（整个 JSON），要实现 stale 传播，可能需要从 snapshot 模型升级到 event log 模型（事件溯源），否则只能 diff 两个大 JSON，语义模糊。这是较大的架构演进，需单独设计。

### 缺口 4：Schema 的表达力天花板

**现状**：`PageArtifactSchema` 能保证 sections 结构合法，但保证不了页面"好看"或命中 brief 的 `emotionalGoal`。

**性质**：这是 schema 的固有局限，**不是 bug**。schema 是合格线，不是优秀线。这层 gap 永远无法用 schema 消除，只能靠 Art Director skill（软约束）+ 人类审批（缺口 2 的 review artifact）补。

**原则**：别试图把质量塞进 schema——那是死路。质量靠审查流程，不靠形状校验。

### 缺口 5：状态机的刚性反噬

**现状**：强状态机能拦非法跳变，但遇到"用户就是想跳过 analysis 直接画测试图"时变阻力。`allowUnapprovedOrder=true` 这个 escape hatch（`entities.ts:52`）是对模式纯粹性的妥协。

**性质**：每个 escape hatch 都是对"理想模型"的承认——现实比状态机脏。这类缺口通过提供显式 escape hatch（并要求显式确认）来缓解，而非拆除状态机。

---

## 六、决策原则（给后续贡献者）

1. **下沉优先**：能写成确定性代码的约束，绝不写进 prompt。
2. **schema 是 gate 不是 mirror**：params schema 只校验 core 主动读取的字段，业务规则在 validateInput 之后检查。
3. **破坏性操作必须显式确认**：所有覆盖/替换操作硬性要求 `overwrite=true`。
4. **版本化优先**：替换 current.json 前必须把旧值归档到 versions/。
5. **core 保持纯净**：protocol/schema/rule 代码留在 core，prompt 和 Pi 集成留在 pi。
6. **prompt 保持薄**：skill 不重复代码已强制的规则，只补"怎么做好"的引导。

---

## 参考实现位置

| 概念 | 文件 |
|---|---|
| Schema 注册表 | `packages/core/src/schemas/index.ts` → `WriteOpSchemas` |
| params 校验入口 | `packages/core/src/validate.ts` → `validateInput`（在 `write-artifact.ts:18` 等处调用） |
| Protocol 双轨制 | `packages/core/src/protocol/index.ts` → `writeJson` / `protocolVersionPath` |
| 依赖链检查 | `packages/core/src/protocol/index.ts` → `requireAnalysis` / `requirePersona` / `requireInterview` / `requirePage` |
| 状态机 | `packages/core/src/entities.ts` → `isValidStatusTransition` / `setOrderStatus` |
| 审批门 | `packages/core/src/entities.ts` → `ensureOrderApprovedForExecution` |
| 破坏性操作确认 | `packages/core/src/entities.ts`（多处 `overwrite=true` 检查） |
| 可复现性强制 | `packages/core/src/entities.ts` → `createOrderResult` 的 generationPrompt 检查 |
| 引用解析（正向） | `packages/core/src/entities.ts` → `collectAssetRefs` / `checkPageAssets` |
| 角色技能（软约束） | `packages/pi/skills/*/SKILL.md` |
