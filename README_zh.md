# RepoChan

[English](./README.md) · [架构说明](./ARCHITECTURE.md)

**把任意 git 仓库变成鲜活的看板娘人格与一致的视觉品牌**——设定集、图标、贴纸、海报、落地页——由**你自带的** coding agent 驱动。

RepoChan 是一个 **LLM-native、本地优先、agent-agnostic** 的创意生产管线追踪系统。硬约束在 `@repochan/core`（schema + 状态机 + 依赖门）；创作判断在平台无关的 **skill** 里；唯一绑定面是薄 CLI：`repochan`。**不内嵌任何 agent runtime**——Claude Code、Codex、Pi、Cursor、Hermes，或任何能跑 shell 的 agent 均可。

```text
core 守约束   ·   skill 出思路   ·   cli 是唯一入口
agent 用户自带 ·   .repochan/ 是磁盘上的真相源
```

完整设计见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

---

## 包结构

```text
packages/
├── core         @repochan/core         协议、schema、实体、确定性分析
├── skill        @repochan/skill        向导 + 团队 skill（纯 markdown）
├── cli          repochan               唯一 bin — 子命令、setup、无 runtime
├── image-gen    @repochan/image-gen    prompt → PNG（OpenAI-compatible endpoint）
├── image-edit   @repochan/image-edit   切图 / 抠图 / GIF（本地、零凭证）
├── templates    @repochan/templates    内置资产 YAML 模板
└── starters     @repochan/starters     落地页 starter（完整 Astro/Tailwind 脚手架）
```

### 依赖方向

```text
cli ──┬──> core
      ├──> skill
      ├──> image-gen
      ├──> image-edit
      ├──> templates
      └──> starters
```

`core`、`image-gen`、`image-edit`、`templates`、`starters`、`skill` 都是叶子。只有 CLI 聚合它们。图像库从不写 `.repochan/`；协议写入永远经 core。

| 包 | 职责 | 谁加载 |
|----|------|--------|
| `core` | `.repochan/` 读写、schema 门、状态机、分析引擎 | CLI（与测试） |
| `skill` | 管线怎么跑（向导 + 角色） | 你的 agent（经 `repochan setup`） |
| `cli` | 确定性子命令 + skill 安装 | 用户 / agent / CI |
| `image-gen` | 图像生成 + `~/.repochan/image.json`（mode: `auto` / `openai` / `openai-async`） | `repochan image gen\|configure\|status\|probe` |
| `image-edit` | 本地像素操作 | `repochan image edit …` |
| `templates` | 官方资产模板 | `repochan template list\|get` |
| `starters` | 完整落地页 starter 脚手架 | `repochan starter list\|get\|pull` |

---

## 工作原理

### 以产物为中心（artifact-centric）

每个角色产出一份 **经 schema 校验、版本化、落在 `.repochan/` 下的 artifact**。agent 不直接手写协议树——它们调用 CLI；core 负责校验与落盘。

```text
.repochan/
  analysis/current.json          # 分析师
  interview/current.json         # 访谈（可选）
  persona/current.json           # 创意团队
  orders/<id>/order.json         # 美术总监简报
  orders/<id>/versions/<vid>/    # 画师结果（meta + 图）
```

### 默认体验：一句话 → 全套品牌

你对**自己的 agent** 说话。向导 skill（`repochan`）调度各团队：

```text
① 分析师     → analysis
② 访谈〔可选〕 → interview
③ 创意团队   → persona
   ⏸ 检查点：确认人设
④ 美术总监   → 全部订单（foundation + 下游）
⑤ 画师       → 先 foundation，再带参考图做下游
   ⏸ 检查点：确认设定集封面
⑥ 页面设计   → 落地页 / 部署准备
   ⏸ 检查点：部署前
```

| 模式 | 何时 | 行为 |
|------|------|------|
| **向导（默认）** | 「做个看板娘和网站」 | 串全流程，检查点停下 |
| **yolo** | 你明确说 `yolo` | 在已授权范围采用默认创意决策；外部写仍需明确授权 |
| **非交互执行** | CI / 无 TTY | 自动选择本地可逆决策；在未授权的外部写之前停止 |
| **逐团队（高级）** | 「只做 analysis」/「重画这张」 | 只加载对应团队 skill |

**视觉一致性**靠 **foundation sheet（设定集封面）** 锚定。下游资产引用它。core 强制依赖顺序——缺上游 → CLI 失败。

---

## 前置条件

- **Node.js** ≥ 20
- 你已经在用的 coding agent（Claude Code、Codex、Pi、Cursor、Hermes …）
- 出图需要：OpenAI-compatible 的 images endpoint（直连 OpenAI、中转站或本地 reverse-proxy）

```bash
node --version   # ≥ 20
```

只有从本 monorepo 构建的贡献者还需要 **pnpm** ≥ 9。

---

## 快速上手

### 从 npm 安装

```bash
npm install -g repochan
repochan --version
repochan setup
#随后在项目中打开 coding agent，输入`/repochan`启动 RepoChan 流程。
```

升级 CLI 后请再次运行`repochan setup` 来刷新随包分发的 skills；若需要刷新，`repochan status` 会报告版本漂移。

### 从本 monorepo 构建（贡献者）

```bash
cd repochan-mono
pnpm install
pnpm --filter @repochan/core build
pnpm --filter repochan build

# 把 skill 装进你的 agent，可选配置 image
pnpm --filter repochan exec node dist/index.js setup
# 或全局/link 之后：
repochan setup
```

### 日常使用

```bash
cd /path/to/your-project
repochan setup                 # 每个 agent/范围做一次
# 打开 Claude Code / Codex / … 用自然语言：
#   「给这个仓库做个看板娘和全套品牌资产」
#   「yolo，全套搞定」
#   「只分析这个仓库」
```

`repochan setup` 从 `@repochan/skill` 拷贝 skill 到 agent 约定目录（如 `.claude/skills`、`.codex/skills`），并在 `CLAUDE.md` / `AGENTS.md` 等注入简短引用。可用 `--agent claude,codex`、`--global` / `--project`、`--list`、`--remove`。

配置图像生成（交互或 flag）：

```bash
repochan image configure
# 写入 ~/.repochan/image.json（密钥可用 ${ENV_VAR} 展开）
```

---

## CLI 参考

协议 / 巡检：

```bash
repochan init
repochan status [--json]
repochan inspect [--json]
repochan validate [--json]
```

实体（agent 主要用这些；大 JSON 走 `--data-file` 或 stdin）：

```bash
repochan analysis run|get|update|enrich|versions
repochan interview get|create|append
repochan persona get|create|update|review|candidate …
repochan order list|get|create|update|set-status|add-revision|…
repochan order create-result|list-results|get-result
repochan order resolve-references <id>
repochan order candidate create|promote
repochan foundation find
repochan starter list [--tag] | get <id> | pull [--starter <id>]
repochan starter configure [--content-file <path>] [--repository-url <url>]
repochan starter create-order <slot> --intent <text> [--foundation <order-id>]
repochan starter asset-apply <slot> --order <order-id> [--result-version <id>]
repochan starter asset-import <slot> --file <path> [--overwrite]
repochan starter validate <id> | --all | --output-dir <dir>
repochan review create
repochan order recovery list <order-id>
repochan order recovery recover <order-id> <transaction-id>
repochan order recovery abort <order-id> <transaction-id>
repochan protocol inspect|read
```

图像与模板：

```bash
repochan image gen --prompt "…" [--reference path] [--out path] [--endpoint id] [--mode auto|openai|openai-async]
repochan image configure [--provider openai|custom|skip] [--base-url …] [--api-key …] [--endpoint-id …] [--mode auto|openai|openai-async]
repochan image status
repochan image probe [--endpoint id]
repochan image edit slice <image> --rows N --cols M [--out dir]
repochan image edit bg-remove <image> [--out path]
repochan image edit gif-from-frames <frame…> [--out path] [--fps N]
repochan template list [--tag poster]
repochan template get official/foundation-sheet
```

Setup：

```bash
repochan setup [--agent claude|codex|cursor|pi|hermes|opencode|gemini|kiro|antigravity|auto|all] [--global|--project] [--overwrite]
repochan setup --list
repochan setup --remove --agent claude
```

项目级 setup 默认绝不会覆盖已有的非 RepoChan Cursor/Kiro 指令文件。请先移动或
手动合并该文件；只有明确希望替换这个专用路径时才传入 `--overwrite`。

多数命令支持 `--json`。写操作 payload：`--data-file path`、`--data-file -`（stdin），或在非 TTY 下直接 pipe JSON。

---

## 开发者工作流

### 安装与构建

```bash
pnpm install
pnpm --filter @repochan/core build
pnpm --filter repochan build
pnpm --filter @repochan/image-gen build
pnpm --filter @repochan/image-edit build
```

`skill` 与 `templates` 是纯数据——无需编译。

### 测试

```bash
pnpm --filter @repochan/core test     # 主套件（协议 + 规则）
pnpm --filter @repochan/image-gen test
pnpm --filter @repochan/image-edit test
pnpm --filter repochan test
pnpm test                             # 根目录：先 build core，再跑各包 test
```

**改 core 协议或业务规则后，务必运行** `pnpm --filter @repochan/core test`。

### 不装全局时的开发 CLI

```bash
pnpm run cli:dev -- status
pnpm --filter repochan exec tsx src/index.ts validate --json
pnpm --filter repochan exec tsx src/index.ts analysis run
```

### 改了 skill？

无需构建。重新跑 `repochan setup`（或依赖 `repochan status` 的版本漂移检测），让 agent 拿到新 markdown。

### 改了 core？

```bash
pnpm --filter @repochan/core build && pnpm --filter @repochan/core test
```

### 全量构建

```bash
pnpm -r build
pnpm -r test
```

### 发布前验证

发布前先用 `pnpm release:pack-smoke` 验证 pack 后的依赖图与 clean-room
用户路径，再用只读的 `pnpm release:preflight` 对照 npm，检测不可覆盖的
版本冲突。叶子包优先、CLI 最后的完整合同见
[`docs/releasing.md`](./docs/releasing.md)。
两条路径都会执行当前 runtime 与 Skill 合同。

---

## 设计原则（摘要）

1. **约束在代码，判断在 prompt**——能形式化的绝不上浮到 skill。
2. **CLI 是唯一绑定面**——agent shell out；MCP（若有）只能是 CLI 的薄外套。
3. **无内嵌 runtime**——没有会「思考」的 `repochan run`；向导 skill + 你的 agent 负责编排。
4. **图像库不写 `.repochan/`**——只出字节；入协议只经 core。
5. **凭证只在 image-gen**——`~/.repochan/image.json` + env；core/cli 不见 key。
6. **设定集优先**——一张视觉锚点，下游带参考图生成。

完整论证与已知缺口：[`ARCHITECTURE.md`](./ARCHITECTURE.md)。

---

## 文档索引

| 文档 | 内容 |
|------|------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 分层、包、绑定模型、缺口、原则 |
| [`packages/skill/README.md`](./packages/skill/README.md) | skill 清单 |
| [`packages/core/README.md`](./packages/core/README.md) | core API |
| [`packages/image-gen/README.md`](./packages/image-gen/README.md) | 出图配置 |
| [`packages/image-edit/README.md`](./packages/image-edit/README.md) | 像素 API |
| [`packages/templates/README.md`](./packages/templates/README.md) | 资产模板包 |
