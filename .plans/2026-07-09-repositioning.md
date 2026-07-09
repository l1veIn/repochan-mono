# 决策：RepoChan 重定位 —— 以 core+skill 为中心，agent 由用户自带（2026-07-09）

> 状态：**ACCEPTED** — 本文件是后续所有重构的基准。边写边拆，任何偏离需回到本文件修订。
> 作者：Jack Yang（与 ZCode 讨论得出）
> 上游输入：2026-07-09 关于 OpenWiki 对比、LangChain 取舍、MCP vs CLI、包结构、图像处理分层、模板系统的完整讨论。
> 关联：**部分推翻** `.plans/archive-decisions/2026-07-runtime-refactor.md` 的"5 包结构是稳定基线、不要再讨论架构"结论。冲突见 §十一。

---

## 一、TL;DR（一句话）

> **core 守约束，skill 出思路，cli（唯一 bin）把 core 操作暴露成子命令；image-gen / image-edit / template 是 cli 调用的库包；agent 由用户自带（Pi / Claude Code / Codex）。无内嵌运行时，每个包一眼能懂。**

---

## 二、背景：为什么需要重定位

2026-07-09，作者对比了 [langchain-ai/openwiki](https://github.com/langchain-ai/openwiki)（一个给代码库写文档的 agent CLI）后，表达了三个痛点：

1. **"我自己作为用户不会用"** —— 入口门槛高（装 Pi → `pi login` → setup → TUI 向导），作者本人都嫌烦。
2. **"packages 下的包错配，core/cli/image-gen 都在变复杂"** —— 认知负荷。
3. **"核心应该是那几个 skill，现在 skill 埋在 pi 包底下"** —— 灵魂（prompt）被塞进具体宿主的子目录。

经一晚讨论，发现这三个痛点**根上是同一个结构性问题**：RepoChan 当前是"以 Pi 为中心"的架构（CLI 内嵌 Pi runtime），而作者想要的是"以 core+skill 为中心、Pi 只是座上客之一"。

---

## 三、OpenWiki 对比的事实基础

### 3.1 相似（模式撞车，非赛道撞车）

| 维度 | 两者共有 |
|---|---|
| 专属目录协议 | OpenWiki 用 `openwiki/`，RepoChan 用 `.repochan/`，都"项目内、可 git、可 diff" |
| 反哺 coding agent | OpenWiki 往 `AGENTS.md`/`CLAUDE.md` 注入指令；RepoChan 协议给 Pi 读 |
| git 做增量 | OpenWiki 用 `.last-update.json`+gitHead；RepoChan 用 `versions/` 审计日志 |
| 多 provider | 两者都支持多家模型商 |
| dogfood 自己 | 两者仓库里都自带自己的产物 |

### 3.2 核心不同（不在一个赛道）

| 维度 | OpenWiki | RepoChan |
|---|---|---|
| 本质 | 给代码库**写文档**（知识压缩） | 把代码库**变成吉祥物 + 视觉品牌**（美学转译） |
| 产出 | Markdown 文档 | 人格 JSON + 图 + 站点 |
| agent 模型 | 单 DeepAgent + 可选 subagent | 多 role skill，手动链 |
| **约束位置** | **prompt（软约束，~200 行 system prompt）** | **schema+状态机（硬约束，四层结构）** |
| 运行 | CI 定时 + 交互 TUI | 用户手动逐角色推进 |
| 独有能力 | 文档规划、AGENTS.md 注入 | 图像生成、贴纸抽取、人格建模 |

**最关键的架构分野**：OpenWiki 信任 prompt（产出自由 Markdown，无 schema 校验）；RepoChan 不信任 prompt，只信任 schema+状态机（写操作过 `validateInput` + 依赖门 `require*`）。**这是 RepoChan 的护城河，重构不得削弱它。**

### 3.3 两个可借鉴的工程细节（仅借鉴，不抄技术栈）

1. **AGENTS.md 注入 + CI 自动开 PR** 的分发模式（RepoChan 可用 `pi --print` 或薄 CLI 实现等价物）。
2. **SHA-256 内容快照防 no-op 刷盘**（`versions/` 已是审计日志，但"判断这次 run 到底改没改"可借鉴此写法）。

---

## 四、决策一：不重构成 LangChain

**结论：否。**

### 4.1 事实依据

经代码审计（2026-07-09）：

- `packages/pi` **零次直接调用模型**（grep `ChatOpenAI|langchain|openai(|invoke(` 全空）。所有推理委托给 Pi runtime。
- pi 层只做两件事：① `unified.ts` 把 core 写操作暴露成工具（30+ action）；② `skills/*.md`（2611 行 prompt）。
- CLI 通过 `startRoleSession()` → `session.prompt(...)` 驱动，**不直接调模型**，是往 Pi session 喂 prompt，由 Pi 跑模型 + 工具循环。

即：RepoChan 的"模型调用 + agent 循环"这一整层是 Pi 的，不是 RepoChan 的。而 LangChain/deepagents 想替代的恰恰是这一层。

### 4.2 论证

- OpenWiki 用 LangChain **是因为它自己就是那个 agent**（无宿主运行时，必须自建循环）。
- RepoChan 已有 Pi 作宿主。换 LangChain = 重写整个 agent 运行层 + 丢掉 Pi 的开箱能力（skill 展开、`/order_panel`、ask_user_question UI、session 持久化、Codex OAuth）。
- core 更不该碰 LangChain：违反 AGENTS.md 第一条（core 必须是纯库、零 agent 依赖）。LangChain 是 agent 编排框架，与 core 的"确定性代码"职责冲突。
- 净效果：**净增复杂度，不降反升**。认知负荷痛点不在 agent 编排层（那层已经很薄），换框架治不了病。

---

## 五、决策二：CLI 是唯一绑定面，不做 MCP

**结论：不做 MCP server。core 经 CLI 暴露，CLI 是唯一绑定面。MCP 仅作为"以后可选的薄外套"，source of truth 永远是 CLI。**

### 5.1 约束保护：CLI 与 MCP 等价

纠正一个早期讨论中的错误论断（"要保住约束得走 MCP"）。**约束活在 core 里，不在传输层。**

- MCP 路径：agent 调 `mcp__repochan__xxx` → server 转发 core → core 校验，非法返回错误。
- CLI 路径：agent 跑 `repochan xxx` → CLI 转发 core → core 校验，非法非零退出 + 报错。

**两条路对约束的保护一模一样**，core 该挡的都挡，与管道无关。

### 5.2 工程基本面对比

| | CLI | MCP |
|---|---|---|
| RepoChan 本来就要做 CLI | ✅ 已存在 | ❌ 额外维护第二绑定面 |
| 能被哪些 agent 用 | 所有有 shell 的（Claude/Codex/Cursor/Aider/脚本/CI） | 仅 MCP 客户端 |
| 出问题怎么查 | `2>&1` 手跑即看 | 黑箱 |
| 用户/CI 怎么跑 | 直接跑命令 | 先配 server、管进程生命周期 |

RepoChan 五项 CLI 全赢，仅"MCP 参数 schema 自动发现"一项 MCP 小胜。杀手锏：**反正要做 CLI，MCP 是纯增量维护成本。**

### 5.3 对"MCP 是失败设计"的精确表述

作者认为"MCP 是失败设计"。讨论收敛为更精确的判断：**不是 MCP 失败，而是 MCP 对"约束型状态机后端 + 偏好透明度"的场景是错配。** MCP 有其地盘（工具自动发现、复杂 JSON Schema 参数、封闭 agent），但 RepoChan 不属于那里。

### 5.4 CLI 的已知代价与对策

1. **发现成本**：靠 skill 文档告知 agent 命令表 + 参数（一次性写作成本，skill 本来就要写）。
2. **参数转义**：复杂 JSON 从 shell 过可能乱引号。对策：大 payload 走 `--data-file`/stdin，简单操作用 flag。
3. **不焊死**：将来若需 MCP，做 MCP-over-CLI 薄壳（几十行，内部 shell out 到 CLI），CLI 永远是 source of truth。

---

## 六、决策三：skill 提为一等公民

**结论：skill 从 `packages/pi/skills/` 提升为顶层包 `packages/skill/`，平台无关的 markdown，C 位。**

### 6.1 依据

- skill（Analyst 怎么看性格、Creative Writer 怎么造人格、Painter 怎么构图）是 RepoChan 的灵魂。
- 现状：`packages/pi/skills/repochan-painter/SKILL.md` —— 灵魂被塞进具体宿主（Pi）的子目录，被 Pi 的 `/skill:` 展开 + SKILL.md 格式绑定。
- skill 提级后成为跨平台 markdown：Claude Code 用户读 CLAUDE.md 风格的 md，Codex 用户同理，Pi 用户亦然。

### 6.2 skill 不亲自执行，只指挥

skill 是 markdown 指令，不能执行代码。它告诉 agent："这一步该想什么、跑什么 `repochan` 子命令、读哪个 `.repochan/` 文件"。真正动手的是 agent 的编辑/执行能力。

**关键边界**：agent 改的是模板/产物文件，不是 `.repochan/`。`.repochan/` 只有 cli（经 core）能写。约束边界只守在 `.repochan/`，不扩散。

### 6.3 交互的跨平台降级

Pi 的 `ask_user_question`（结构化问卷）、`/order_panel`（带图预览）在 Claude Code 里降级为"Claude 直接在聊天里对话问问题"。能用，视觉不如 Pi 精致。**取舍：默认薄 CLI（普适跨平台轻量），把"要精致交互的人"导向 Pi。** 大多数用户要的是"能跑起来"。

---

## 七、决策四：摘除 CLI 内嵌的 Pi runtime

**结论：CLI 不再内嵌 Pi runtime。CLI 通过自己的 SDK 调用 + agent loop 跑全流程；Pi 降级为"可选的 agent 宿主之一"，与 Claude Code / Codex 平级。**

### 7.1 事实依据（CLI 内嵌 Pi 的结构性证据）

经代码审计（2026-07-09）：

- `packages/cli/package.json` 依赖 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-tui`。
- `runtime.ts` 顶部 import 一整串 Pi runtime API：`AuthStorage`、`createAgentSessionFromServices`、`createAgentSessionRuntime`、`ModelRegistry`、`SessionManager`、`SettingsManager`...
- `createRepoChanRuntime()`（~30 行）本质是**在 CLI 进程里手工搭一个 Pi 运行时**。
- `session.prompt(...)` 是 Pi 在 CLI 进程内跑模型 + 工具循环 + skill 展开。
- **CLI 对 `repochan-pi` 的依赖，源码层面是零**（grep 无 import）；pi 包仅作为"文件资源"被 setup.ts 读路径写入 Pi 的 settings.json。

即：CLI 把 Pi 整个 runtime 嵌进自己进程。"CLI 有点大"的真凶不是 pi 包，是内嵌的 Pi runtime。

### 7.2 三个痛点的同根

- **CLI 大** ← 内嵌整个 Pi runtime。
- **skill 埋在 pi 下** ← 因为 skill 要被内嵌 Pi 的 `/skill:` 展开，必须住 pi 包。
- **我不会用** ← CLI 全流程能力 = 内嵌 Pi，用户被迫进 Pi 世界。

三病同根：CLI 与 Pi 是"进程内内嵌"的紧耦合，而非"CLI 驱动独立后端"的松耦合。

### 7.3 两种形态 → 收敛为"一个薄 CLI + 复用已有平台"

作者最初提出"两种形态"：① core 代理形态（薄，不内嵌 Pi，配合 codex/claude 的 skill 跑）；② 完整形态（内嵌 Pi，类似 OpenWiki）。

讨论收敛（**这是关键澄清**）：**不要建第二个二进制。** 业内"薄工具 + 富代理"分离模式（ripgrep + Cursor、gh + Copilot、stripe CLI + Dashboard）的规律是：发布**一个薄 CLI**，富体验要么是已有平台，要么是另一个独立产品。

映射到 RepoChan：

| 形态 | 落地 |
|---|---|
| 薄形态 | 新的 `repochan` CLI：无 Pi，纯 core，`--json` 子命令 |
| 富形态 | **Pi 本身 + 你的 skills**（现成，Pi 是独立产品，不需重造） |

**只建薄 CLI。** Pi 用户走"Pi + skill + CLI"，Claude Code 用户走"Claude + skill + CLI"，共用同一个 CLI 和同一套 skill。

### 7.4 为什么不照抄 OpenWiki 的"单二进制自带 agent"

OpenWiki 单二进制成立，因为它是**单职责轻 agent**（只写文档），loop 轻塞进包无负担。RepoChan 是多角色 + 重约束 + 图像生成，agent 运行时（Pi）是大块头，塞进 CLI 正是"CLI 大"的病因。**单二进制适合轻 agent，不适合挂大平台。**

### 7.5 过渡策略（待执行时细化，今天不定）

两条出路：
- **完全拆掉**：CLI 用 SDK 自驱（openai / @anthropic-ai/sdk），自写轻 agent loop。最干净，重写 `runtime.ts` 那 290 行。
- **过渡保留**：命令用 SDK 跑，交互式 wizard 暂借 Pi 的 TUI/ask_user_question。

⚠️ 本条是所有决策中**最大的一刀**，动的是整个执行架构。今天锁定方向，执行细节待启动时单独规划。

---

## 八、决策五：图像拆成两类包 —— image-gen（生成，带凭证）与 image-edit（处理，零凭证）

**命名说明**：曾考虑 `image`/`imaging`，但二者只差一个字母、视觉几乎一样，违反"一眼能懂"。最终选 `image-gen`/`image-edit` + cli 子命令 `repochan image gen`/`repochan image edit`，共用 `image` 前缀、用二级动词（gen/edit）区分，对齐 OpenAI API 的 `images/generations` vs `images/edits` 心智模型。

**结论：当前混在"图像"名下的东西，本性二分。生成（image-gen）与像素处理（image-edit）是两个物种，各自独立成库包，被 cli 调用。**

### 8.1 事实依据（两类本性截然不同）

经代码审计（2026-07-09）：

**类一：零凭证、零网络、纯本地像素计算**
- `core/src/slicing/`（213 行）—— 切图
- `core/src/stickers/`（276 行）—— 抠图
- 未来：GIF 组帧、九宫格、背景替换、调色板提取……
- grep `API_KEY|fetch|provider|https?://` **零命中**。只用 sharp 做像素运算。

**类二：要 key、要配通道、要联网**
- `image-gen-pi` 的 fal / openai / xai / openrouter / codex-oauth 五个 provider。

这俩**唯一共性是"都跟图片有关"**，本性完全不同。

### 8.2 拆包方案

```
image/     库,被 cli 调。prompt+参数 → PNG,落临时路径。自带凭证(读 ~/.repochan/image.json + env),自带 provider 注册/缓存/重试。
imaging/   库,被 cli 调。切图/抠图/GIF/九宫格,零凭证纯本地。从 core 挪出。
```
（注：上图为决策讨论时的过渡叫法，最终命名为 `image-gen`/`image-edit`，见本节开头命名说明。）

image-edit 本性与 core 同类（纯函数、可测、零凭证），但职责是像素而非协议骨架，故独立成包，**不留在 core**。这也治好"core 变重"——core 现在背着 slicing/stickers 这两坨与协议无关的像素能力。

### 8.3 铁律：image-gen/image-edit 都不碰 `.repochan/` 写入

产物落临时路径，入协议（写进 `orders/<id>/versions/`）永远走 cli（经 core 校验）。**image 只管出字节，不知道 `.repochan/` 长什么样。** 这样图像工具可被任何场景复用（不画吉祥物、只想生成张图的人也用），协议纯洁性由 core 单独守。

### 8.4 凭证管理：业界标准，工具自管

image 的 key 不污染 core/cli。参照 `gh`（读 `~/.config/gh/`）、`aws`（读 `~/.aws/credentials` + env）：image 读 `~/.repochan/image.json`（provider + 默认模型）+ `FAL_API_KEY` 这类 env。**core 和 cli 连凭证概念都没有。** 不画图的用户不需配。

### 8.5 provider SDK 按需加载

核心包不带 fal/openai 实际代码。provider SDK 用动态 import / optionalDependencies。不画图的用户 `npm install repochan` 不下载图像 SDK；要画图的用户多一步 `repochan image gen setup`。参照 gh / aws CLI 的"核心轻、重能力按需启用"。

### 8.6 image-edit 原子化原则

`repochan image edit slice` / `bg-remove` / `gif-from-frames` —— 每个只干一件事（输入路径 → 输出路径）。组合交给 skill（agent 串）或 page 层（代码串）。需求清单会一直长，原子化 = 加一个子命令不影响已有能力。

---

## 九、决策六：网站是可 fork 的在线模板，page-renderer 砍掉

**结论：网站模板是独立在线 git 仓库，cli 负责 list/search/pull，agent（被 skill 指挥）负责信息替换 + 二开。`packages/page-renderer` 整包砍掉（793 行 legacy）。**

### 9.1 作者的愿景（产品冲击力的来源）

用 core/cli/image-gen/image-edit 产出的各种资产（人格、hero 图、贴纸、GIF），给用户**一键生成一个网站**。网站是**可 fork 的模板**：agent 拉取、替换信息、用户可继续二开。

### 9.2 连锁收益：page-renderer 被判死刑（且死得其所）

事实：`packages/page-renderer`（793 行）干的是"Page JSON → 固定 HTML"（渲染函数范式）。作者要的新范式是"agent 拉 Astro 模板项目，改配置，二开"。两者完全不同：

| | 旧 page-renderer | 新形态 |
|---|---|---|
| 谁干活 | 渲染函数编译 JSON 成固定 HTML | agent 读模板改配置 |
| 模板在哪 | 无，HTML 写死在渲染器里 | 在线仓库，可 list/搜索/拉取 |
| 输出 | 不可改静态文件 | 活的 Astro 项目，用户继续编辑 |

新范式里"渲染"动作被 agent + Astro 自己的构建器接管。**page-renderer 这 793 行整个不需要。** 这同时解决了"page-renderer 是否 legacy"的悬案：**是，且新架构不要它。**

### 9.3 模板能力并入 cli 子命令，不单独成包

`repochan template list/search/pull` 与 `repochan image gen`（生成 PNG）同类——都不碰 `.repochan/` 写入，都与协议无关。模板能力是 cli 的一个子命令组，不配单独成包。

### 9.4 分工

```
repochan template list           → cli 干(纯网络/缓存,像 git/npm)
repochan template search <kw>    → cli 干
repochan template pull <name>    → cli 干(下载模板项目到当前目录)
  ↓
agent 接管                        → skill 干(指挥 agent 读 .repochan/ 产物,替换模板里的占位)
  ↓
用户二开                          → 用户自己的 Astro 项目,与 repochan 无关
```

边界重申：agent 改的是**模板自己的文件**（用户资产），不是 `.repochan/`（协议真相源，只有 cli 经 core 能写）。

### 9.5 模板仓库独立于 monorepo

模板仓库是独立在线 git 仓库（或一组），类似 Astro 官方 themes、Vercel templates。当前 `repochan-page/`（dogfood 站）**搬出去**当模板仓库的第一个模板。

### 9.6 占位符机制（待执行时定，今天不定）

两条候选：
- **约定路径**：skill 告诉 agent "hero 图放 `public/images/hero.png`，人格名读 `.repochan/persona/current.json` 的 name 字段"。简单，模板守约定。
- **显式 slot**：模板里有 `{repochan:hero}` 标记，agent 找标记替换。灵活，要定标记语法。

当前 `repochan-page` 走 Astro 组件 + i18n JSON，介于两者之间。执行时再定，不影响包结构。

---

## 十、最终包结构（基准）

```
packages/
  core/        协议骨架(schema + protocol + 状态机)。纯库,零凭证,零 agent。
               [变更] slicing/、stickers/ 挪出到 image-edit。
  skill/       markdown。C位,平台无关。指挥 agent 跑 repochan 子命令 + 读 .repochan/。
               [变更] 从 packages/pi/skills/ 提升为顶层包。
  cli/         唯一 bin。路由所有子命令。无 agent、无图。
               [变更] 摘除内嵌 Pi runtime;image-gen/image-edit/template 作为库被调。
               子命令:repochan analyze / persona / paint ...
                     repochan image gen ...(调 image-gen 库)
                     repochan image edit slice ...(调 image-edit 库)
                     repochan template list/search/pull(纯 cli)
  image-gen/   库,被 cli 调。prompt→PNG,带凭证,自带 provider。
               [变更] 从 image-gen-pi 重构为库,去 Pi 耦合。
  image-edit/  库,被 cli 调。切图/抠图/GIF/九宫格,零凭证纯本地。
               [变更] 从 core 的 slicing/stickers 挪出,新建包。

[砍掉]
  page-renderer/   整包删除(793 行 legacy,新范式不需要)。
  pi/(现有形态)    降级为"可选适配层"(让 Pi 用户也能用),与 mcp 平级;不再是核心。
                   重命名建议:adapters/pi。

[独立于 monorepo]
  templates/       在线模板 git 仓库,repochan-page 搬过去当首个模板。

[可选适配层]
  mcp/             MCP-over-CLI 薄壳(将来若需),source of truth 仍是 cli。
```

**核心包数量**：core / skill / cli / image-gen / image-edit = 5（后两者是被 cli 调的库）+ 可选适配层。相比原 5 包结构（core / pi / image-gen-pi / page-renderer / cli），删了 page-renderer，降格了 pi，新建了 skill/image-gen/image-edit。

### 10.1 发布形态（用户视角）

```
用户只装一个:npm install -g repochan
  → 内部把 core+image-gen+image-edit 全拉下(库,不发独立 bin)
  → 用户只面对一个 repochan 命令,全部能力是子命令
  → image 的 provider SDK 按需加载(不画图不下载)

agent 加载:丢几个 skill markdown 进 Claude/Codex/Pi
  → skill 指挥 agent 敲 repochan xxx
  → repochan 内部路由到对应库
```

**内部解耦（开发者认知清晰）与外部聚合（用户只装一个）不冲突。** 这是 ripgrep+Cursor、gh+Copilot 的通用模式。

---

## 十一、与既有 ADR 的冲突处理

`.plans/archive-decisions/2026-07-runtime-refactor.md`（2026-07-06）结论：**"当前 main 的 5 包结构是稳定的基线……不要再讨论 runtime 架构。"**

本文件（2026-07-09）**推翻该结论的"5 包结构是稳定基线"部分**。理由：该 ADR 归档时的前提是"RepoChan 尚未发布、零外部用户、单人维护"且"下一步是产品完整性不是架构演进"。三天后（07-09）作者对照 OpenWiki 后发现核心痛点是**产品形态与入口门槛**（"我自己不会用"），这恰恰是架构问题，无法靠产品完整性解决。

但本文件**保留**该 ADR 的以下有效结论：
- **不复活 `@repochan/runtime` 包结构**（worker / 文件锁 / 生命周期 / task 系统）——本文件同样不引入这些。
- **stale 传播 / config 模块若真需要，写进 core，不新建包**——本文件遵循此原则（image-edit 是像素能力出 core，不是 runtime 能力回 core）。
- **目录边界能表达的模块性，零包管理负担**——本文件新建 image-gen/image-edit 是因**凭证/依赖图本性不同**（image-gen 要 provider+key，image-edit 零凭证），满足该 ADR 自己列的"独立依赖图"拆包正当理由。

执行时应在 runtime-refactor ADR 顶部追加一条指针："⚠️ 5 包稳定基线结论已被 `.plans/2026-07-09-repositioning.md` 推翻，以新文件为准。"

---

## 十二、被否决的备选（防止下次重新讨论）

| 备选 | 否决理由 |
|---|---|
| 重构成 LangChain | 治不了认知负荷（痛点不在 agent 编排层）；净增复杂度；违反 core 纯库约束 |
| 做 MCP server 作为主绑定面 | 约束保护与 CLI 等价；五项基本面全输；反正要做 CLI，纯增量维护 |
| 建两个二进制（薄版 + 内嵌 Pi 版） | 维护两套运行时；用户困惑装哪个；依赖体积没省；业内不这么做 |
| 照抄 OpenWiki 单二进制自带 agent | RepoChan 是重 agent 场景，塞进 CLI 正是"CLI 大"病因 |
| image-gen/image-edit 合一个包 | 凭证/依赖图本性不同（image-gen 要 key+provider，image-edit 零网络），合并=错配 |
| 让 agent 直接写 `.repochan/`（纯 prompt 不经 core） | 绕过 schema+状态机，丢失护城河，降级成 OpenWiki 那种"规矩全在 prompt" |
| 保留 page-renderer 作渲染器 | 新范式（agent + Astro 模板）接管渲染，渲染函数无用武之地 |
| image-gen 留在 core | core 是协议骨架，图像生成是带凭证能力，污染 core 边界 |

---

## 十三、执行策略（启动重构时照此走）

### 13.1 仓库策略：就地重构，不开新仓库

**就在 `repochan-mono` 改，不新开仓库。**

依据：
- **core 几乎不动**（只挪 slicing/stickers 出去），且有 2749 行测试当安全网。新仓库等于丢掉这层保护重新落盘协议代码，风险远大于收益。
- **git blame 是重构的生产力工具**（如 `stickers/index.ts:24-32` 解释"为何动态 import imgly 的 sharp"）。新仓库 `git blame` 全是 "initial commit"，"为什么这么写"的历史断了。
- **"清爽感"不需要新仓库**：那 1.5GB archive 目录全在 gitignore 里，`rm -rf test-repos-archive-* chibi-review` 一条命令就清爽。别拿"重建一整套代码"换一个 `rm` 能解决的问题。
- **产品身份未变**：还是 RepoChan，还是 monorepo，还是 `.repochan/` 协议。只换骨架，不换身份 → 留原仓库。

唯一会改口的情况：产品改名 / 定位变成完全不同的东西（届时新仓库顺便换身份）。当前不满足。

### 13.2 分支策略：main 作基线，按风险分两条长分支

```
main              基线，不动，全程可验证可回退
  ├─ repositioning/safe     低风险线：砍/挪/提，每个 PR 保 core 测试绿
  └─ repositioning/pi-removal  高风险线：摘除内嵌 Pi runtime（§七）
```

- `main` 是安全网。每个改动用独立 PR / commit，每步 `pnpm --filter @repochan/core test` 保绿。
- 高风险线（§七）**单独分支隔离**，因为动的是整个执行架构，影响面最大。
- 不要 `repositioning/pi-removal` 和 `safe` 互相 merge 直到 safe 稳定后；两条线先并行、后合流。

### 13.3 执行顺序（低风险 → 高风险）

**Phase 0（回归基线保护，立即做）：保留并整备回归测试矩阵**

⚠️ **纠正早期讨论的失误**：曾把 `test-repos-archive-*` 当"噪音"建议 `rm -rf`。这是错误判断。这些目录不是垃圾，是**回归测试基线**——同一批被测仓库带上各自的 `.repochan/` 产物，跨多轮（round1→round4）记录了 code change 对输出的影响。重构后必须重跑全量并对比，才能证伪"迁移导致输出偏移"。

基线现状（2026-07-09 审计）：
- `test-repos-archive-20260705-round3-final`、`-round4`：**最新稳定基线**，同一批仓库集（2048/caddy/click/marktext/redis/ripgrep/samples/tauri-starter/wasm-pack），重构后对比以此为准。
- `test-repos-archive-20260705`（round1）：早期形态，含 `_baseline_v1`/`_results`/`before-rerun` 等探索目录，已被取代。
- `test-repos-archive-20260705-{rerun,round2,round3}`：迭代轨迹，保留供回溯。

Phase 0 行动（**不是删除，是整备**）：
1. `test-repos/` 下的被测仓库源（含本次 clone 的 openwiki）保持不动，作为重跑输入。
2. 确认 `test-repos-archive-20260705-round4`（或 round3-final）为**黄金基线**，重命名/标记使其不会被误删（如 `test-repos-baseline-20260705`）。
3. 在 ADR 补充一份"回归验证 SOP"（见 §13.6）。
4. 可清理的仅限真正的临时垃圾：`chibi-review/`（评测脚本输出，非基线）、轮次间重复的早期探索目录（确认无引用后）。

**Phase 1（低风险线 `repositioning/safe`，每步可独立 PR）：**
1. 砍 `packages/page-renderer`（793 行 legacy，无人引用则删；先 grep 确认无 core 测试依赖）。
2. 从 core 挪 `slicing/` + `stickers/` 到新包 `packages/image-edit`；core 只剩协议骨架。挪完 core 测试必须绿。
3. 提 `packages/skill/` 为顶层包，从 `packages/pi/skills/` 迁 markdown（暂保留 pi 下的副本以免 break 现有 Pi 用户，迁移完成再删副本）。

**Phase 2（高风险线 `repositioning/pi-removal`）：**
4. 摘除 CLI 内嵌 Pi runtime（§七）。这是支点，单独详细 task 拆解，先设计后写码。
5. image-gen-pi 重构为库 `packages/image-gen`（去 Pi 耦合，provider 保留待业务决定是否砍数量）。

**Phase 3（合流 + 上层）：**
6. `repochan-page/` 迁出到独立模板仓库。
7. `packages/pi` 降格为 `packages/adapters/pi`（可选适配层）。

### 13.4 CLI vs MCP：CLI now，MCP 可选且以后（附验证路径）

**决定：现在只写 CLI。不现在写 MCP。** 不是"永远不做 MCP"，是"MCP 的代码现在不写、推迟到真有人需要时"。

依据：
- §五 已立：约束保护 CLI/MCP 等价，基本面 CLI 全赢。
- "只 MCP" 几乎不存在——cli 必须有（薄 CLI、TUI wizard、`repochan render`）。真实选项是"现在写 1 份" vs "现在写 2 份"。选 1 份。
- CLI 是 source of truth，MCP 永远是外套：将来若需 MCP，做 MCP-over-CLI 薄壳（几十行，内部 shell out 到 CLI）。

**可证伪的验证路径（用事实定，不靠预测）：**
> 在 Phase 2 完成后，用 Claude Code 把 `analysis → persona → image` 这条链跑通。
> - **跑顺** → §五 结论坐实，不碰 MCP。
> - **跑不爽**（Claude 拼参数老出错 / 读 stdout 解 JSON 崩 / 体验糙）→ 推翻 §五，补 MCP 外套。这不是打脸，是工程务实。

验证触发条件明确化：以"作者本人在 Claude Code 里实际跑一次完整链路"为判定基准。

### 13.6 回归验证 SOP（重构必跑）

重构（尤其 §七 摘除 Pi、§八 挪 slicing/stickers 出 core）完成后，必须证伪"迁移导致输出偏移"。用既有基线做全量回归：

**输入**：`test-repos/` 下的被测仓库集（2048/caddy/click/marktext/redis/ripgrep/samples/tauri-starter/wasm-pack）。

**基线**：`test-repos-archive-20260705-round4`（黄金基线），每个仓库的 `.repochan/` 产物。

**流程**：
1. 用重构后的 repochan 对 `test-repos/` 全量重跑（analysis → persona → image gen → image edit → ...）。
2. 逐仓库 `diff` 新产物 vs 黄金基线的 `.repochan/`：
   - **结构层**（schema/protocol/状态机）：必须**零偏移**。任何 schemaVersion、依赖门、状态迁移的差异 = 阻断，必须修。
   - **内容层**（LLM 生成的 persona 文案、图像）：允许语义等价的差异（LLM 本身有随机性），但需人工抽样确认质量未退化。
3. 结构层零偏移 + 内容层人工抽检通过 = 迁移成功，可合流。
4. 结构层有偏移 = core 被误改，定位回退，不得合流。

**判据来源**：core 的 schema+状态机是确定性代码（§三 护城河），对相同输入应产出相同结构。结构偏移唯一来源是迁移改动了 core，故**结构零偏移是硬门槛**。

**附录**：round1→round4 的迭代轨迹保留在原位，可用于回溯"历史上某次 code change 如何影响输出"，是调试时的参考。

### 13.7 贯穿全程的硬约束（不变）

1. **边写边拆，有据可依**：以本文件为基准，偏离需回本文件修订，不口头改。
2. **约束不得削弱**：core 的 schema+状态机+依赖门是护城河，重构全程保 `pnpm --filter @repochan/core test` 绿。
3. **薄工具原子化**：cli/image-gen/image-edit 每个子命令只干一件事，组合交给 skill 或 page 层。
4. **image 不碰协议**：产物落临时路径，入协议走 cli/core。
5. **凭证隔离**：key 只活在 image 一侧，core/cli 无凭证概念。
6. **延迟决策、留可逆路径**：仓库（旧+分支可回退）、绑定面（CLI 先行 MCP 可补）——别在能推迟时提前下注。

---

## 十四、遗留待决（执行时定，今天不阻塞）

1. CLI 摘除 Pi 后的 agent loop 形态：完全自驱（SDK + 自写 loop）还是过渡保留（命令自驱 + wizard 借 Pi TUI）。见 §7.5。
2. 模板占位符机制：约定路径 vs 显式 slot。见 §9.6。
3. pi 包重命名：`adapters/pi` 与 `mcp` 是否同期落地，还是先留 pi 待定。
4. 现有 `.repochan/` 协议是否需要 schemaVersion bump（若 image-gen/image-edit 拆出影响 order result 落盘路径）。
5. `repochan-page/` 迁出到模板仓库的时机（是先在 monorepo 跑通新结构，还是立即迁）。
6. **产品形态（已决，2026-07-09）**：原"6 角色手动管线是否改为一键"。决定：**外部 agent 驱动，向导 skill 调度各团队串全流程 + 关键检查点；用户对 agent 说"yolo"可全默认跳过检查点；逐团队变为高级模式。无 `repochan run` 命令（CLI 无大脑）。** 详见 §十七。

---

## 十五、用户上手流程（cli setup 子命令设计基准）

本节解决"我自己不会用"痛点：把上手流程从"装 Pi → pi login → 学 TUI 向导"降到"两步命令 + 自然语言"。本节是 §六（skill 一等公民）+ §五（cli 唯一绑定面）的落地，也是 cli `setup` 子命令的设计基准。

### 15.1 分发：skill 随 cli 打包

**决定**：skill markdown 随 cli npm 包一起发布，不发独立仓库、不远程拉取。

依据：
- 一个 `npm install -g repochan` 同时拿到 cli + skill，零额外步骤。
- setup 从本地安装目录拷贝/链接，**离线可用**，不依赖网络。
- skill 迭代跟着 cli 版本走，**版本一致性自动保证**（不会出现 cli v2 跑着 v1 的 skill）。
- skill 体积可忽略（纯 markdown），打包不增加负担。
- 否决"独立 skill 仓库"：多一个仓库维护 + 用户多一步，无收益（skill 目前无外部贡献者）。
- 否决"setup 时远程拉取"：依赖网络，离线不可用，且版本飘移风险。

### 15.2 上手流程（以 Codex 用户为例）

```
①  npm install -g repochan          # 装 cli（包里自带 skill markdown）
②  cd my-project
③  repochan setup --agent codex     # cli 把 skill 放到 codex 读的位置 + 注入 AGENTS.md 引用
④  打开 codex，自然说话："给我的项目生成个吉祥物"
⑤  codex 读到 AGENTS.md 里的 repochan 引用 → 读 skill → 跑 repochan analyze ...
```

**两步人类动作（装 + setup），之后全是用户在自己熟悉的 agent 里用自然语言。** 对比现状"学一个新平台"，门槛骤降。

### 15.3 各 agent 的 setup 目标位置

`repochan setup --agent <x>` 干两件事：① 把 skill markdown 放到目标 agent 的约定位置；② 在顶层 agent 指令文件注入 repochan 引用段。

| agent | skill 放哪 | 指令注入到 | flag |
|---|---|---|---|
| Codex | `.codex/skills/`（或约定位置） | `AGENTS.md` | `--agent codex` |
| Claude Code | `.claude/skills/` | `CLAUDE.md` | `--agent claude` |
| Pi | `skills/` + `settings.json` 注册 | （Pi 原生 skill 机制） | `--agent pi` |
| Cursor | `.cursor/` / `.cursorrules` | `.cursorrules` | `--agent cursor` |

注入的引用段对齐 OpenWiki 的 AGENTS.md 模式（见 §三.3），但**由 cli 写入而非 agent 写入，更可靠**：

```markdown
## RepoChan

本项目用 RepoChan 创意管线，产物在 .repochan/。开始前先读 skill：
- [repochan-analysis skill](.codex/skills/repochan-analysis.md)
- [完整流程](.codex/skills/repochan.md)
```

### 15.4 关键设计原则：cli 是入口，不反向依赖 skill

**依赖方向**：cli → 把 skill 分发出去。不是 skill → 让 agent 装 cli。

- `repochan setup` 是人类显式跑的入口命令，负责环境准备（装 skill、注入引用）。
- skill 是"怎么用工具"的指令，不承担"装工具"的职责。
- **不让 agent 自动装 cli**：agent 装包不可靠（权限/版本/网络），debug 困难。`git`/`gh` 不会让 agent 装自己，工具是入口，工具分发指令，方向如此。
- 避免鸡生蛋：agent 要先读到 skill 才知道 repochan，但 skill 到 agent 那里仍需用户 setup——既然用户都要动手，不如直接装 cli（入口）而非放 skill（下游）。

### 15.5 setup 是幂等的、可重入的

- 重复跑 `repochan setup --agent codex` 不重复注入、不覆盖用户手改（检测已有引用段则跳过/更新）。
- 换 agent：`repochan setup --agent claude`，skill 同时存在于多个位置（不同 agent 共存）。
- `repochan setup --list`：显示当前项目已配置哪些 agent。
- `repochan setup --remove --agent <x>`：清理某 agent 的注入。

### 15.6 skill 的"指挥"内容（对齐 §6.2）

setup 放出去的 skill markdown 告诉 agent：
- 每一步该想什么（创作判断，prompt）。
- 该跑什么 cli 子命令（`repochan analyze` / `repochan image gen` / `repochan image edit slice` ...）。
- 该读哪个 `.repochan/` 文件拿上游产物。
- **边界**：agent 改模板/产物文件自由，`.repochan/` 写入只有 cli（经 core）能做。

### 15.7 对"我自己不会用"的彻底回应

痛点拆解（见 §二）：
- **入口门槛**（装 Pi/学 TUI）→ §15.2 两步搞定。
- **流程学习曲线**（6 角色要按顺序）→ 取决于 §十四.6（一条命令 vs 逐角色）。setup 让 agent 自动读流程，但"流程有多长"是产品形态问题，本节不替代 §十四.6。

两节配合：§十五 解决"怎么进入"，§十四.6 解决"进去后跑多长"。

---

## 十七、向导 skill：外部 agent 驱动的一键全流程（产品默认形态）

**决定（2026-07-09）**：默认提供"一句话完成全部工作"通道。**大脑永远是用户自带的外部 agent（Claude/Codex/Pi），CLI 没有大脑。** 形态为**向导 skill + 外部 agent 串线 + 关键检查点 + yolo 心态**。逐角色从"必学流程"降为"高级操作"。

本节把原 §十四.6（最高优先待决项）转为已决，是 §六（skill 一等公民）+ §七（摘除内嵌 runtime）+ §十五（上手流程）的产品形态收口。

### 17.1 关键纠正：没有 `repochan run`（CLI 没有大脑）

⚠️ **设计纠正**：曾提出 `repochan run [--yolo]` 命令。**这是错误，已废弃。**

矛盾：§七 摘除了 CLI 内嵌的 Pi runtime，CLI 不再自己跑模型循环。"一键串全流程"需要大脑（会思考、会判断、会对话），而 CLI 摘除 runtime 后**没有大脑**。`repochan run` 若要真能"run"，必须偷偷把 agent runtime 请回来——那 §七 就白做了。

**正确模型**：大脑永远是外部 agent。用户对 agent 说一句话，agent 读向导 skill，**agent 自己**串起 `repochan analyze` → 审 → `repochan persona` → ... → 部署。CLI 是被动被调用的确定性工具，从不"自己跑流程"。

"一键"的准确含义：**用户只对 agent 说一句话**（感受上一键），CLI 角度是**被 agent 调多次**。

### 17.2 多 skill = 多团队角色

核心心智（作者原话精准定义了产品）：
- **多个 skill 扮演不同团队角色**（Analyst/Creative Writer/Art Director/Painter...）。每个 skill 职责单一，是一等公民。
- **用户逐个拜访团队**推动流程 = 高级操作（繁琐但精细，用于调试/微调单步）。
- **一句话总指令**让向导 skill 调度所有团队，一键完成 = 默认体验。

团队 skill 与向导 skill 的关系：
```
用户对 agent 说:"/repochan 帮我生成全套资产并部署到 GitHub Pages"
  ↓
agent 读向导 skill(总指挥)
  ↓ 向导 skill 是"全流程步骤说明书",引用各团队 skill
  ├─ 第1阶段:按 repochan-analysis 团队 skill → repochan analyze
  ├─ 第2阶段:按 repochan-persona 团队 skill → repochan persona
  ├─ 第3阶段:按 repochan-painter 团队 skill → repochan image gen ...
  ├─ 第4阶段:repochan template pull → agent 填充 → astro build
  └─ 第5阶段:(检查点)→ gh-pages 部署
```

向导 skill 不取代团队 skill，是站在它们上面的总指挥。各团队 skill 保持职责单一。

### 17.3 一键的完整终点（产品演示级链路）

⚠️ **扩展**：原设计只写到"生成资产"就停。作者明确链路终点是**部署上线**。完整一键链路：

```
生成全套创意资产(人格/hero/贴纸/GIF)
  → repochan template pull 拉 Astro 模板
  → agent 读 .repochan/ 产物,填充模板信息
  → astro build 构建静态站点
  → (部署前检查点)
  → 部署到 GitHub Pages(git push / gh-pages)
```

用户输入一句话，输出一个上线网站。这是 RepoChan 的"冲击力"所在（§9.1）。

### 17.4 核心纠正：roles never auto-chain 不是铁律

现有 `ARCHITECTURE.md` 写"Roles never auto-chain. Each must be user-invoked."——这是一条**产品设定，不是物理约束**，且它服务的场景（防错误级联）在新形态下有更优解（检查点 + yolo）。

**ARCHITECTURE.md 随重构重新闭环**（§十八已覆盖）：重写时这条改为"默认向导 skill 调度各团队串全流程；检查点保护关键节点；yolo 心态可全默认；逐团队访问为高级模式"。它跟 README 一样，是重构闭环的一部分，不是不可动的圣旨。

### 17.5 三档体验（触发方式重新定义）

| 模式 | 怎么触发 | 行为 | 面向 |
|---|---|---|---|
| 向导（默认） | 用户对 agent 说一句话（如"生成全套资产并部署"） | agent 读向导 skill 串全流程，关键节点停下来问用户 | 普通用户 |
| yolo | 用户对 agent 说"yolo，全默认别问我" | agent 按向导 skill 跳过所有检查点，一路推进到底 | 熟练用户/CI |
| 逐团队（高级） | 用户对 agent 说"只做 analysis" / 手动跑 `repochan analyze` 等 | 只做单步，手动 gate | 精细控制/调试 |

⚠️ **关键变化**：yolo 不再是 CLI flag（~~`repochan run --yolo`~~），而是**用户对 agent 说的自然语言指令**。因为"要不要检查点"是 agent 的行为，CLI 根本不知道"流程"这回事，只认单条命令。印证"大脑在 agent 侧"。

### 17.6 检查点设计

**关键检查点**设在错误级联风险最高的节点：
- **persona 定稿后**：人格是后续所有创作的灵魂，错了全废。必须停。
- **foundation（视觉锚）出图后**：下游所有图引用的基准，丑 foundation→废十张下游图。必须停。
- **部署前**（新增）：部署是外向不可逆操作（push 上线），必须给用户最后确认机会。必须停。
- analysis/interview 等上游步骤：风险低，向导模式下自动过。

检查点形态：向导 skill 指示 agent "到这里，把产物展示给用户，问是否继续或要修改"。agent 用其原生对话能力问（Claude 在聊天里问，Pi 用 ask_user_question）。yolo 跳过这些指示。

### 17.7 安全 vs 效率的取舍依据

为什么默认带检查点：
- RepoChan 产出是**创意物**（人格/图），不是确定性输出。上一步错了，下游级联放大。
- foundation 被十张下游图引用——一个丑 anchor 污染整个产出。
- 部署是外向不可逆操作，错了要回滚线上。
- 检查点代价低（用户点几下"继续"），收益高（拦住级联错误 + 拦住误部署）。

为什么仍提供 yolo：
- 熟练用户已信任管线，或 CI 场景需无人值守。
- yolo 是**用户主动承担风险**的显式选择（对 agent 明说），不是默认行为。
- "默认安全 + opt-in 激进"是业内成熟模式（如 `git push --force`、`--no-verify`）。

### 17.8 向导 skill 的双场景要求（有人/无人）

⚠️ **向导 skill 必须同时处理两种场景**，否则 CI 会卡住：

- **有人值守**（用户在 agent 旁）：检查点停下，问用户，等回答。
- **无人值守**（CI / yolo）：全部默认推进，不停。

实现：向导 skill 写明"遇到检查点时，若用户已说 yolo 或环境为非交互（CI），则全部默认继续；否则停下问用户"。这是 prompt 设计要求，不是架构问题。写 skill 时不得漏掉 CI 场景。

### 17.9 与 setup 的配合（§十五）

setup（§15.2）放出去的 skill 包含：
- **向导 skill** —— 默认体验的总指挥。
- 各团队 skill（analysis/persona/painter...）—— 高级模式逐团队访问用。
- 顶层引用（AGENTS.md 注入段）优先指向**向导 skill**，并示范一句话指令（"想生成全套资产并部署，直接说 `/repochan 帮我生成全套资产并部署`"）。

即：普通用户 setup 后说一句话 → agent 读向导 skill → 一键走完（带检查点）。想逐团队的人，setup 的 skill 文档里写明高级玩法。

### 17.10 对 §十五.7 的更新

§15.7 写"进去后跑多长取决于 §十四.6（待决）"——现已决（本节）。更新为：进去后**默认一句话让 agent 经向导 skill 串全链（带检查点），yolo 可全默认，逐团队为高级**。"我不会用"的两层（入口 + 流程长度）至此全解。

---

## 十八、文档收敛（重构闭环的最后一环）

重构合流时如果 README 还指着旧结构，新用户照着旧流程操作一定撞墙——等于重构白做。文档收敛不是可选的收尾，是重构的定义性闭环环节：**代码变了，文档没跟上，重构不算完成。**

### 18.1 现状文档债（2026-07-09 审计）

当前 `README.md`（298 行）与 ADR 目标形态的冲突：

| README 现状 | ADR 目标 | 冲突 |
|---|---|---|
| "manual, user-controlled creative pipeline" + 6 角色 | §十五 两步上手 + 自然语言 | 上手流程整个过时 |
| 架构图：core / pi / image-gen-pi / page-renderer / cli 五包 | §十 core/skill/cli/image-gen/image-edit | 包结构过时 |
| Prerequisites："Pi CLI (`pi`) — install from pi.dev" | §十五 agent 自带，不强制 Pi | 门槛性陈述过时 |
| CLI 表：`repochan analyze/persona/foundation/paint` | §八/§九/§十五 `setup`/`image gen`/`image edit`/`template` | 子命令过时 |
| Developer workflow 大段 `pi -e ... --skill ...` | §七 cli 不内嵌 Pi runtime | 开发流程过时 |
| `.repochan/` 协议章节 | 协议本身不变（core 没动） | **保留** |

`README_zh.md`（同源中文）需同步。`ARCHITECTURE.md`（三层结构）的协议层叙述仍有效，但涉及包结构处需对齐 §十。

### 18.2 收敛时机：分阶段，不是一次性

**铁律：文档只在对应代码合流到 main 后才改，不提前改。** 过早改指向不存在的结构 = 误导（重构中途有人照 README 操作会撞墙）；过晚改 = 重构期文档失真。所以 README 按代码合流节奏分段更新：

| 触发节点 | 改什么 |
|---|---|
| Phase 1 合流（砍 renderer/挪 imaging/提 skill） | 架构图改为 5 包新结构；移除 page-renderer 章节 |
| Phase 2 合流（摘 Pi runtime） | Prerequisites 去掉"强制 Pi"；CLI 表换新子命令；Developer workflow 重写 |
| Phase 3 合流（template 迁出） | 新增 template 章节（`repochan template`） |
| 全部合流 + §13.6 回归绿 + §13.4 Claude Code 实跑验证通过 | README 终态定稿，移除顶部所有"重构中"提示 |

**重构进行期间**：README 顶部保持一个醒目提示块（类似 AGENTS.md 现在的那个），指向本 ADR，声明"README 反映重构后目标，进行中部分以 ADR 为准"。这样重构期读者不会误信，也不至于完全无指引。

### 18.3 README 终态结构（合流后定稿基准）

```
# RepoChan
  一句话定位（LLM-native 创意管线，agent 自带，CLI 唯一绑定面）
  
## Quick start（最前面，解决"我不会用"）
  npm install -g repochan
  cd my-project && repochan setup --agent <codex|claude|pi>
  在你的 agent 里说"给我的项目生成个吉祥物"
  → 指向 §15.2 流程

## Architecture
  5 包结构图（§十）+ 依赖方向（cli → core，image-gen/image-edit 被 cli 调）
  
## .repochan/ 协议
  （保留——协议没变）
  
## CLI 参考
  setup / image gen / image edit / template / analyze ...
  （§八/§九/§十五 子命令表）
  
## Developer workflow
  按新结构（cli 不内嵌 Pi；core build + test）
  
## Docs
  指向 ADR / ARCHITECTURE.md / skill 文档
```

原则：**Quick start 置顶**（旧 README 把 Getting started 埋在中间，加重"不会用"）。协议章节保留（core 没动，这部分文档仍准）。

### 18.4 文档清单与同步责任

| 文档 | 处理 | 节奏 |
|---|---|---|
| `README.md` | 终态重写（§18.3） | 分阶段（§18.2） |
| `README_zh.md` | 同步中文 | 与 README 同步 |
| `ARCHITECTURE.md` | 协议层保留；包结构段对齐 §十；**改写"Roles never auto-chain"为向导+检查点+yolo（§17.2）** | Phase 1 合流时 |
| `AGENTS.md` | 已加指针块（本次），保留直到重构完 | 已做 |
| 各 `packages/*/README.md` | 砍掉 page-renderer 的；新增 image-gen/image-edit/skill 的 | 随包变动 |
| 本 ADR（`.plans/2026-07-09`） | 重构全程基准，不动 | 不变 |

### 18.5 验收标准（重构"完成"的定义）

重构不算完成，直到以下全部满足：
1. §13.6 回归验证通过（结构零偏移）。
2. §13.4 Claude Code 实跑验证完成（决定 MCP 去留）。
3. **README/README_zh 终态定稿**，无任何指向旧 5 包结构 / 强制 Pi / 旧子命令的内容。
4. README 顶部"重构中"提示块移除。
5. 一名"新用户"（作者本人或他人）**照 README 从零走一遍能跑通**——这是"我自己不会用"的终极验收。

第 5 条是回归基线（§13.6）在产品层面的对应物：代码回归靠 diff，产品回归靠"真人照文档跑通"。两者都过，重构才算闭环。

---

## 给下个会话的指示

本文件是 RepoChan 重定位的基准。照 §十三 执行策略走：

1. **先定 §十四.6**（产品形态：一条命令 vs 逐角色）——它影响 cli 子命令设计，不定则 cli 重构没方向。
2. **Phase 0**：**保护回归基线**——确认 `test-repos-archive-20260705-round4` 为黄金基线并标记防误删；`test-repos/` 被测源保持不动；§13.6 回归 SOP 备好。仅清理真正的非基线临时垃圾（chibi-review 等）。
3. **Phase 1 低风险线**（`repositioning/safe` 分支）：砍 page-renderer → 挪 slicing/stickers 到 image-edit → 提 skill 包。每步 core 测试绿。**Phase 1 完成后跑 §13.6 回归验证**（结构零偏移）。
4. **Phase 2 高风险线**（`repositioning/pi-removal` 分支）：摘除内嵌 Pi runtime，先设计后写码。完成后**再跑 §13.6 回归验证**。
5. **§13.4 验证**：Phase 2 完成后用 Claude Code 实跑，决定是否补 MCP。
6. **§十八 文档收敛**：每个 Phase 合流后按 §18.2 同步对应文档；全部合流后 README 终态定稿（§18.3）；最终按 §18.5 验收标准逐项核对（含"真人照 README 跑通"）。**文档没收敛 = 重构未完成。**

注：§十七（向导 skill）原为 §十四.6 最高优先待决项，**已决**——外部 agent 驱动，一句话总指令，向导 skill 调度各团队，带检查点 + yolo。**无 `repochan run` 命令**（CLI 无大脑，§17.1 已纠正）。

**不要重新讨论**：LangChain（§四）、MCP 作主绑定面（§五）、建两个二进制（§7.3）、新开仓库（§13.1）、skill 让 agent 自动装 cli（§15.4 已否决，cli 是入口，setup 人类显式跑）。这些已定，除非出现 §13.4 的验证反证。

**已明确设计的 cli 子命令**（重构时照此实现，不需重新设计）：
- `repochan setup --agent <codex|claude|pi|cursor>`（§十五：装含向导+各团队的全部 skill + 注入引用，幂等可重入）
- `repochan analyze / persona / paint ...`（§十七：逐团队高级模式，保留现有）
- `repochan image gen ...` / `repochan image edit slice|bg-remove|gif-from-frames ...`（§八）
- `repochan template list|search|pull`（§九）

**注意**：无 `repochan run` 命令（§17.1 已纠正）。"一键全流程"由外部 agent 读向导 skill 驱动，不是 CLI 命令。

**不要删除**：`test-repos-archive-*` 是回归基线（§13.6），不是噪音。曾误判为垃圾建议 `rm -rf`，已纠正。
