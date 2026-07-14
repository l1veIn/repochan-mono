# RepoChan 架构说明

> 本文档定义 RepoChan 的架构本质、分层结构、包边界、绑定面，以及已知的架构缺口。
> 它是后续所有功能决策的共同前提。
>
> **权威决策基准**：[`.plans/2026-07-09-repositioning.md`](./.plans/2026-07-09-repositioning.md)（2026-07-09 ACCEPTED）。
> 本文描述的是该 ADR **落地后**的代码现实，不是迁移前的 Pi 中心架构。

---

## 一、RepoChan 是什么

**RepoChan 是一个 LLM-native、本地优先、agent-agnostic 的创意生产管线追踪系统（creative production tracking system）。**

它把 git 仓库转译成鲜活的看板娘人格与一致的视觉品牌资产（设定集、图标、贴纸、海报、落地页）。执行者是用户自带的 coding agent（Claude Code / Codex / Pi / Cursor / Hermes 等）；约束在 `@repochan/core`；创作思路在 `@repochan/skill`；唯一绑定面是薄 CLI `repochan`。

三个限定词逐个拆：

- **LLM-native**：执行者是 LLM agent，不是人。系统必须用 schema 校验交付物形状——因为自然语言输出无法直接被下游消费。
- **本地优先**：所有协议状态落在项目内的 `.repochan/` 目录，不依赖外部数据库。`current.json` 是当前真相，`versions/` 是不可变审计日志。人机都能 `cat`、`diff`、`git blame`。
- **agent-agnostic**：RepoChan **不内嵌**任何 agent runtime。大脑永远是用户自带的外部 agent；CLI 没有大脑，只暴露确定性子命令。

### 它解决的问题

LLM 自由对话模式做不了「可追踪、可审计、可重入的批量创意生产」——对话一结束，中间状态就蒸发。下一个角色（或下一次会话）拿不到结构化的上游产物。

RepoChan 给 agent 提供一套**交付拓扑**：每个角色的工作目标不是「说一段话」，而是「按 schema 产出一个落盘的、被校验过的、可被下游引用的 artifact」。LLM 的自由度被限制在「从一个合法节点走向下一个合法节点」，而不是「自由发挥」。

### 一句话定位（ADR TL;DR）

> **core 守约束，skill 出思路，cli（唯一 bin）把 core 操作暴露成子命令；image-gen / image-edit / templates 是 cli 调用的库包；agent 由用户自带。无内嵌运行时，每个包一眼能懂。**

---

## 二、分层结构

架构核心原则：**能被形式化的约束，一律下沉成确定性代码；不能被形式化的判断，才上浮成 prompt（skill）。**

```
┌─────────────────────────────────────────────────────────────┐
│  Agent 宿主（用户自带）                                        │
│  Claude Code / Codex / Pi / Cursor / Hermes …                 │
│  读 skill → 跑 `repochan …` 子命令 → 做创作判断                 │
├─────────────────────────────────────────────────────────────┤
│  Skill 层（软约束 / prompt）                                   │
│  向导怎么串线、Painter 怎么构图、AD 怎么拆 brief                 │
│  packages/skill/skills/*/SKILL.md                             │
├─────────────────────────────────────────────────────────────┤
│  CLI 绑定面（唯一入口）                                        │
│  子命令路由、--json / --data-file、setup 分发 skill              │
│  packages/cli  →  bin: repochan                               │
├─────────────────────────────────────────────────────────────┤
│  Business Rules 层（硬约束 / 代码）                             │
│  状态机、依赖门、审批门、破坏性操作显式确认                       │
│  packages/core/src/entities/                                  │
├─────────────────────────────────────────────────────────────┤
│  Protocol 层（载体 / 版本化）                                   │
│  current.json + versions/、safe path、require*()               │
│  packages/core/src/protocol/index.ts                          │
├─────────────────────────────────────────────────────────────┤
│  Schema 层（契约 / 形状）                                       │
│  artifact 形状、params gate、schemaVersion                     │
│  packages/core/src/schemas/index.ts                           │
└─────────────────────────────────────────────────────────────┘

旁路库（被 CLI 调用，不写协议）：
  packages/image-gen/   prompt → PNG（带凭证，AI SDK）
  packages/image-edit/  切图 / 抠图 / GIF（零凭证，纯本地）
  packages/templates/   资产 YAML 模板（纯数据）
```

### 1. Schema 层 — 交付物的「形状契约」

**职责**：定义 agent 最终要交付什么形状的东西。消除 LLM 自由格式输出。

- 入口：`packages/core/src/schemas/index.ts`
- Artifact 形状：`PersonaArtifactSchema`、`OrderResultVersionSchema`、`InterviewArtifactSchema`、`AnalysisArtifactSchema` 等。
- 每个 artifact 带 `schemaVersion`、`generatedAt`、`provenance`。
- 写操作 params gate：`*ParamsSchema`；`WriteOpSchemas` 把 action 名映射到 schema。
- 校验入口：`packages/core/src/validate.ts` 的 `validateInput(action, schema, params)`。

**关键设计**：schema 是 **gate，不是 entity 的镜像**。schema 只校验「传了正确形状的参数」；业务规则（状态迁移、条件必填）在 `validateInput` 通过**之后**由 entity 函数检查。

### 2. Protocol 层 — 交付物的「存放与版本化」

**职责**：形状写到哪、怎么版本化、怎么防止覆盖、怎么定位。

- 入口：`packages/core/src/protocol/index.ts`
- **双轨制**：`current.json`（当前真相）+ `versions/<timestamp>.json`（不可变历史）。
- **安全写入**：`writeJson(..., overwrite)` 在 `overwrite=false` 时拒绝覆盖。
- **路径安全**：`safeProtocolPath` 拦截 path traversal，所有写入必须落在 `.repochan/` 内。
- **依赖链检查**：`requireAnalysis` / `requirePersona` / `requireInterview`。

**目录布局**（`initProtocol`）：

```text
.repochan/
  analysis/{current.json, versions/}
  persona/{current.json, versions/, candidates/, reviews/}
  interview/{current.json, versions/}
  orders/<order-id>/{order.json, versions/<version-id>/, reviews/}
  pages/{current.json, versions/}
  templates/          # 可选：项目级资产模板覆盖
```

- Order 的版本更细：每个 `versionId` 是一个目录，内含 `meta.json` + 实际产物（png 等），`order.json.currentVersion` 指向当前选中版本。
- Persona candidate 落在 `persona/candidates/<slug>.json`；promote 后写入 `persona/current.json`。

### 3. Business Rules 层 — 交付的「业务边界」

**职责**：定义「能不能从一个合法节点走到下一个合法节点」。

- 入口：`packages/core/src/entities/`（按实体拆分：`persona.ts`、`orders.ts`、`interview.ts`、`pages.ts`、`review.ts`、`persona-review.ts`）。
- **状态机**：`OrderStatus` 六态（`draft` / `approved` / `in_progress` / `delivered` / `needs_revision` / `cancelled`），非法跳变被拒绝。
- **依赖门**：例如 `createOrders` 要求 analysis + persona；`createOrderResult` 还要求订单已审批。
- **审批门**：`ensureOrderApprovedForExecution` — 默认只有 `approved` / `in_progress` 才能交付结果（`allowUnapprovedOrder` 是显式 escape hatch）。
- **破坏性操作显式确认**：覆盖类写操作硬性要求 `overwrite=true`。
- **可复现性**：`createOrderResult` 强制保存 `generationPrompt` / `revisedPrompt`。
- **候选态**：order 与 persona 均支持 candidate → promote 路径。
- **评审**：order review 与 persona review 均为事后、可选、结构化写入；verdict 判断留在 skill 层。

### 4. Skill 层 — 软约束 / prompt

**职责**：处理无法被形式化的判断——构图审美、提问策略、好坏评判、全流程编排。

- 入口：`packages/skill/skills/*/SKILL.md`（纯 markdown，无构建步骤）。
- **C 位是向导 skill `repochan`**：默认一句话调度全流程；yolo 跳过检查点；逐团队是高级模式。
- 团队 skill：`repochan-analysis` / `repochan-interviewer` / `repochan-persona` / `repochan-art-director` / `repochan-painter` / `repochan-page-designer`。
- 采用 progressive disclosure：精炼 `SKILL.md` + 按需 `references/`。
- skill **不亲自执行代码**——它告诉 agent 该想什么、该跑哪条 `repochan` 子命令、该读哪个上游产物。

**分层原则的体现**：一条规则既能写成代码又能写成 prompt 时，**优先写成代码**。prompt 越薄、代码层越厚，系统越可靠。

### 5. CLI 绑定面 — 唯一入口

**职责**：把 core / image-gen / image-edit / templates 的能力暴露成 shell 可调用的子命令；把 skill 分发给各 agent。

- 入口：`packages/cli`，bin 名 `repochan`。
- **CLI 没有大脑**：不内嵌 agent runtime，不跑模型循环，不做创作判断。
- 大 payload 走 `--data-file` / stdin（`-`），简单操作用 flag；机器可读输出用 `--json`。
- `repochan setup`：检测已装 agent → 安装 skill → 注入顶层指令引用（`AGENTS.md` / `CLAUDE.md` 等）；可选顺带配置 image endpoint。

**约束保护不依赖传输层**：agent 跑 `repochan xxx` → CLI 调 core → core 校验。将来若做 MCP，只能是 MCP-over-CLI 薄壳；CLI 永远是 source of truth。

---

## 三、与同类系统的关系

### 范式定位

| 范式 | 真相来源 | 代表 | RepoChan 的关系 |
|---|---|---|---|
| Message-centric | 对话历史 | AutoGen / ChatGPT | 不用——对话结束状态蒸发 |
| State-centric | 内存 state 对象 | LangGraph | 不用——需要外部 checkpointer |
| Task-centric | 任务清单 + 自然语言 expected_output | CrewAI | order 接近，但更严格（schema + 状态机） |
| **Artifact-centric** | **磁盘上的版本化产物** | **RepoChan** | **本系统** |

一句话：传统框架用 prompt 定义规则，RepoChan 用代码定义规则，prompt 只剩必须靠 LLM 判断的部分。

### 与 OpenWiki 的分野（产品赛道）

| 维度 | OpenWiki | RepoChan |
|---|---|---|
| 本质 | 给代码库**写文档** | 把代码库**变成吉祥物 + 视觉品牌** |
| 产出 | Markdown | 人格 JSON + 图 + 站点 |
| 约束位置 | prompt（软） | schema + 状态机（硬） |
| agent 模型 | 单 agent + 可选 subagent | 多 role skill + 向导编排 |
| 运行时 | 自带 agent | **用户自带 agent** |

**护城河**：不信任 prompt，只信任 schema + 状态机。重构不得削弱它。

### 与 ShotGrid / ftrack 的对应

| RepoChan 概念 | ShotGrid 对应 |
|---|---|
| `order.json` | Task + Version |
| `OrderStatus` 状态机 | Version Status |
| `currentVersion` 指针 | latest published version |
| `brief.*` / `acceptanceCriteria[]` | Task brief / review checklist |
| `generationPrompt` + `revisedPrompt` | render recipe / provenance |
| `.repochan/` | 项目数据库（本地文件系统） |

---

## 四、Monorepo 包结构

```text
packages/
├── core         @repochan/core         协议骨架：schema + protocol + 状态机 + 确定性分析。零凭证、零 agent。
├── skill        @repochan/skill        平台无关 markdown。C 位：向导 + 各团队 skill。
├── cli          repochan               唯一 bin。路由子命令；setup 分发 skill。无内嵌 runtime。
├── image-gen    @repochan/image-gen    库：prompt → PNG（AI SDK，OpenAI-compatible endpoint）。自管凭证。
├── image-edit   @repochan/image-edit   库：切图 / 抠图 / GIF。零凭证、纯本地。
├── templates    @repochan/templates    纯数据：内置资产 YAML 模板。
└── starters     @repochan/starters     纯数据：落地页 starter（完整 Astro/Tailwind 脚手架目录）。

> 落地页 starter 已从根目录 `repochan-page/` 迁入 `packages/starters/`（首个 starter：`constructivist`）。
> `repochan starter pull --starter <id>` 从包内 scaffold 出可编辑实例。
```

### 依赖方向（必须单向）

```text
cli ──┬──> core
      ├──> skill          # setup 时拷贝 skill 资源
      ├──> image-gen      # repochan image gen / configure
      ├──> image-edit     # repochan image edit …
      └──> templates      # repochan template list|get

core          叶子：不依赖任何其他 repochan 包
image-gen     叶子：不写 .repochan/，不知协议
image-edit    叶子：不写 .repochan/，不知协议
templates     叶子：纯 YAML
skill         叶子：纯 markdown
```

### 各包职责边界

| 包 | 能做 | 不能做 |
|---|---|---|
| `core` | 读写 `.repochan/`、校验 schema、执行业务规则、确定性分析 | import agent runtime、写 prompt、持有 API key、做像素处理 |
| `skill` | 告诉 agent 流程与创作判断 | 执行代码、直接写 `.repochan/` |
| `cli` | 路由子命令、setup、调用各库、输出人类/JSON 结果 | 实现业务规则（必须委托 core）、跑模型循环 |
| `image-gen` | 调图像 endpoint、管理 `~/.repochan/image.json` | 写协议目录、知道 order/persona |
| `image-edit` | 切图 / 抠图 / 组 GIF | 联网、持凭证、写协议目录 |
| `templates` | 提供官方 YAML 模板文件 | 含代码或 agent 指令 |

### 已移除 / 降格

| 旧包 | 处置 |
|---|---|
| `packages/pi` | 移除。skill 提为顶层；Pi 仅作为 `repochan setup --agent pi` 的可选宿主之一 |
| `packages/image-gen-pi` | 重构为库 `packages/image-gen`，去 Pi 耦合 |
| `packages/page-renderer` | 删除。落地页改由 agent + Astro 模板二开，不再 JSON→HTML 渲染器 |

---

## 五、绑定模型：agent × skill × CLI

```text
用户
  │ 自然语言（「给这个仓库做个看板娘」/「yolo 全套」）
  ▼
外部 agent（Claude / Codex / Pi …）
  │ 读 skill（setup 安装到约定目录）
  ▼
skill 指挥
  │ 该想什么 / 该跑什么子命令 / 该读哪个上游
  ▼
repochan CLI  （唯一绑定面）
  │
  ├── protocol 写操作 ──► @repochan/core ──► .repochan/
  ├── image gen       ──► @repochan/image-gen ──► 临时/输出路径
  ├── image edit      ──► @repochan/image-edit ──► 临时/输出路径
  └── template        ──► @repochan/templates ──► YAML 内容
```

**铁律**：

1. **`.repochan/` 只有 CLI（经 core）能写。** agent 改模板/产物文件自由，不绕过 core 手写协议。
2. **image 不碰协议。** 生成/处理产物落临时路径；入协议走 `repochan order create-result` 等。
3. **凭证隔离。** API key 只活在 image-gen（`~/.repochan/image.json` + env）；core/cli 无凭证概念。
4. **没有 `repochan run`。** 一键全流程 = 用户对 agent 说一句话 → 向导 skill 调度；CLI 被多次调用，自己不编排。

### 上手路径

```bash
npm install -g repochan          # 或 monorepo 内 pnpm --filter repochan …
cd my-project
repochan setup                   # 检测 agent、安装 skill、可选配置 image
# 打开你的 agent，自然语言驱动
```

`setup` 支持 Codex / Claude Code / Hermes / Cursor / Pi 等；可 `--global` 或 `--project`；可 `--list` / `--remove`。

---

## 六、角色管线与产品形态

### 默认：向导一句话全流程

向导 skill（`repochan`）在关键检查点停下，防止级联错误：

```text
① 分析师     repochan-analysis      → analysis/current.json
② 访谈〔可选〕 repochan-interviewer  → interview/current.json
③ 创意团队   repochan-persona       → persona/current.json
   ⏸ 检查点 1：persona 定稿
④ 美术总监   repochan-art-director  → 全部订单（foundation + 下游）
⑤ 画师       repochan-painter       → 先 foundation，再下游（引用 foundation）
   ⏸ 检查点 2：foundation 出图
⑥ 页面设计   repochan-page-designer → 落地页 / 站点
   ⏸ 检查点 3：部署前
```

| 模式 | 触发 | 行为 |
|---|---|---|
| **向导（默认）** | 「生成全套 / 做个看板娘」 | 串全流程，3 个检查点停下 |
| **yolo** | 用户明说 yolo / 非交互 CI | 跳过检查点；订单直接 `approved` |
| **逐团队（高级）** | 「只做 analysis / 微调某张图」 | 只加载对应团队 skill |

### 设定集优先（视觉一致性）

视觉一致性通过 **foundation sheet（设定集封面）** 实现：它是第一个真正的图像产出，作为所有下游资产的视觉锚点。下游订单通过 `resolveOrderReferences` 引用它。

依赖由 core 强制：缺上游 → CLI 非零退出并报错。

---

## 七、图像系统

| 包 / 命令 | 本性 | 凭证 | 协议感知 |
|---|---|---|---|
| `repochan image gen` → image-gen | 联网生成 | 是（自管） | 否 |
| `repochan image configure` → image-gen | 写 `~/.repochan/image.json`（mode 可选） | 是 | 否 |
| `repochan image status` / `probe` | 列出 endpoint / GET models 探测 | 是（只读） | 否 |
| `repochan image edit slice` | 网格切图 | 否 | 否 |
| `repochan image edit bg-remove` | ML 抠图 | 否 | 否 |
| `repochan image edit gif-from-frames` | 帧组 GIF | 否 | 否 |
| `repochan order slice` / `extract-stickers` | 订单上下文下的切图/贴纸 | 否（像素） | 是（经 core 落盘） |

image-gen 把所有后端视为 **OpenAI-compatible** endpoint（`baseURL` + `apiKey` + `model` + `mode`）：

| mode | 用途 |
|------|------|
| `auto`（默认） | 经典提交（不带 `X-Async-Mode`）；响应有 job/task id 则 poll；host 规则可升为 async |
| `openai` | 强制经典 |
| `openai-async` | 强制 `X-Async-Mode` + 异步 poll（仅已知需要的中转） |

用户配置一般只需 URL + key；**不必**懂 sync/async。诊断：`repochan image status`（显示 `mode → effectiveMode`）。客户端从不自动 re-POST 整次生图，也不在 504 后换 mode 重打。

资产模板（构图骨架、尺寸、grid）在 `@repochan/templates`，经 `repochan template list|get` 消费；项目可在 `.repochan/templates/` 覆盖同 id。

---

## 八、架构演进：已落地与剩余缺口

### 已落地

| 能力 | 状态 |
|---|---|
| 四层约束（schema / protocol / rules / skill） | 稳定 |
| 薄 CLI 唯一绑定面、无内嵌 runtime | 已落地（本分支） |
| skill 顶层包 + 向导默认形态 | 已落地 |
| image-gen / image-edit 拆包 | 已落地 |
| page-renderer 删除 | 已落地 |
| Order review + Persona review | 已落地 |
| Order candidate + Persona candidate | 已落地 |
| multi-agent setup + skill version drift 检测 | 已落地 |
| 确定性 analysis 引擎 + LLM enrich 路径 | 已落地 |

### 刻意不解决 / 已知边界

#### 失效传播（stale propagation）

改 persona 不会自动标记依赖它的 order / page 为 stale。正向引用解析（`collectAssetRefs` / `checkPageAssets`）存在；反向 stale 图不存在。

**理由**：本地优先、单用户主导规模下，用户可见上游变化并手动重跑。实现 event-sourced dependency graph 成本远超收益。多 agent 并行或重度 CI 时再评估。

#### Schema 的表达力天花板

Schema 保证「合法」，不保证「好看」或命中 `emotionalGoal`。质量靠 skill + review，不靠把审美塞进 schema。

#### 状态机的刚性

强状态机能拦非法跳变，也会挡住「我想跳过 analysis 直接试画」。通过显式 escape hatch（如 `allowUnapprovedOrder`）缓解，不拆除状态机。

#### 待演进

- ~~`repochan-page/` 迁出为独立在线模板仓库（ADR §九）。~~ ✅ 已迁入 `packages/starters/`（2026-07-13）。
- 可选 MCP-over-CLI 薄壳（仅在 CLI 体验证伪时）。
- 远程模板 registry（当前 ~12 个官方 YAML 随包发布足够）。

---

## 九、决策原则（给后续贡献者）

1. **下沉优先**：能写成确定性代码的约束，绝不写进 prompt。
2. **schema 是 gate 不是 mirror**：params schema 只校验 core 主动读取的字段；业务规则在 `validateInput` 之后检查。
3. **破坏性操作必须显式确认**：覆盖/替换硬性要求 `overwrite=true`（或等价 flag）。
4. **版本化优先**：替换 `current.json` 前归档到 `versions/`。
5. **core 保持纯净**：零 agent、零凭证、零像素处理（像素在 image-edit）。
6. **prompt 保持薄**：skill 不重复代码已强制的规则。
7. **CLI 是唯一绑定面**：新能力先做成 `repochan` 子命令；不平行维护 MCP 作为 source of truth。
8. **image 不写协议、凭证不进 core/cli**。
9. **薄工具原子化**：每个子命令只干一件事；组合交给 skill（agent 串）或上层脚本。
10. **没有 `repochan run`**：大脑在外部 agent；CLI 永不内嵌 runtime。

---

## 十、参考实现位置

| 概念 | 位置 |
|---|---|
| Schema 注册表 | `packages/core/src/schemas/index.ts` → `WriteOpSchemas` |
| params 校验 | `packages/core/src/validate.ts` → `validateInput` |
| Protocol 双轨制 | `packages/core/src/protocol/index.ts` |
| 依赖门 | `packages/core/src/protocol/index.ts` → `require*` |
| 实体业务规则 | `packages/core/src/entities/*.ts` |
| 状态机 / 审批门 | `packages/core/src/entities/orders.ts`、`shared.ts` |
| 确定性分析 | `packages/core/src/analysis/` |
| 协议完整性 | `packages/core/src/validation.ts` → `validateProtocol` |
| CLI 入口 | `packages/cli/src/index.ts` |
| setup / multi-agent | `packages/cli/src/commands/setup/` |
| 向导 skill | `packages/skill/skills/repochan/SKILL.md` |
| 团队 skills | `packages/skill/skills/repochan-*/` |
| 图像生成 | `packages/image-gen/` |
| 像素处理 | `packages/image-edit/` |
| 资产模板 | `packages/templates/*.yaml` |
| 重定位 ADR | `.plans/2026-07-09-repositioning.md` |
| 最小协议夹具 | `examples/minimal/` |

---

## 十一、相关文档

- [`README.md`](./README.md) / [`README_zh.md`](./README_zh.md) — 上手与开发者工作流
- [`AGENTS.md`](./AGENTS.md) — monorepo 贡献约束
- [`packages/skill/README.md`](./packages/skill/README.md) — skill 包说明
- [`packages/core/README.md`](./packages/core/README.md) — core API 细节（若与本文冲突，以本文 + 代码为准，并应回写 core README）
