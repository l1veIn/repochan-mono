# RepoChan Monorepo

[English](./README.md) · [架构说明](./ARCHITECTURE.md)

RepoChan 是一个 **LLM-native、本地优先的创意生产管线追踪系统**。它把 git 仓库转化为鲜活的看板娘人格和一致的视觉品牌资产（主视觉图、图标、贴纸、落地页）。它遵循**手动、用户主导**的创意管线：Analyst → Creative Writer → Art Director → Painter。每个角色是独立的 Pi skill，执行前会检查前置条件，覆盖前会请求用户确认。

架构上，RepoChan 采用 **artifact-centric**（以产物为中心）设计：每个角色的目标不是"说一段话"，而是"产出一个经 schema 校验、版本化、落盘在 `.repochan/` 下的产物"。LLM 的自由度被约束在"从一个合法节点走向下一个合法节点"，而非"自由发挥"。完整设计理念、三层结构（schema / protocol / business rules）、已知架构缺口见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

此 monorepo 包含**五个**共享 `.repochan/` 磁盘协议的包。

## 架构

```
packages/
├── core            @repochan/core              纯 TS 库 — protocol、schema、entity、business rules、确定性分析。零 Pi 依赖。
├── pi              repochan-pi                 Pi 包 — 统一 `repochan` 工具、`/order_panel` 命令、8 个 skill（6 角色 + 总览 + protocol）。
├── image-gen-pi    @repochan/image-gen-pi      Pi 包 — 多供应商图片生成（Codex OAuth, FAL.ai, OpenAI, xAI）。
├── page-renderer   @repochan/page-renderer     Page JSON → 零-JS 静态 HTML 渲染器。
└── cli             repochan                    面向用户的 TUI — 向导、Agent 驱动的角色页面、CLI 命令、i18n（中/英）。
```

### 依赖方向

```
cli ──┬──> pi ──┬──> core
      │         └──> page-renderer ──> core
      └──> image-gen-pi
```

`core` 是叶子节点——绝不 import Pi 或 agent prompt 逻辑。`pi` 从 `core` 复用 protocol/schema/rule 代码，自身只做 Pi 运行时集成和 prompt。完整分层职责矩阵见 [`ARCHITECTURE.md`](./ARCHITECTURE.md) 第四节。

### 包之间的关系

| 层 | 功能 | 加载方式 |
|------|------|-----------|
| `core` | `.repochan/` 读写、schema、entity 操作（状态机、依赖门）、确定性分析引擎 | 一切（纯 JS 库） |
| `pi` | `repochan` 工具（action 式 API）、8 个 skill、`/order_panel` | Pi agent，通过 `settings.json`（由 `repochan setup` 写入） |
| `image-gen-pi` | `image_generate` 工具、`/image_model` 命令 | Pi agent（同一个 settings） |
| `page-renderer` | 把 Page JSON 渲染成静态 HTML（供 `page.create` 使用） | `pi`（库依赖） |
| `cli` | TUI 向导、`repochan analyze/persona/foundation/paint`、`repochan validate`、i18n | 终端用户 |

## `.repochan/` 协议

```text
.repochan/
  analysis/
    current.json
    versions/
  persona/
    current.json
    versions/
  orders/
    <order-id>/
      order.json
      versions/
        <version-id>/
          meta.json
          hero.png
```

- `analysis/current.json` — 确定性扫描 + LLM 增强分析（Analyst 产出）
- `persona/current.json` — 看板娘角色档案（Creative Writer 产出）
- `orders/<id>/order.json` — 委托简报（Art Director 产出）
- `orders/<id>/versions/<vid>/` — 交付的图片结果（Painter 产出）

完整规范：[`packages/pi/skills/repochan-protocol/SKILL.md`](./packages/pi/skills/repochan-protocol/SKILL.md)。架构说明：[`ARCHITECTURE.md`](./ARCHITECTURE.md)。

## 角色管线

```
① Analyst          → .repochan/analysis/current.json
② Creative Writer  → .repochan/persona/current.json
③ Art Director     → 基础设定图订单（视觉锚点）
④ Painter          → 生成基础设定图 → 视觉锚点确立
⑤ Art Director     → 下游资产订单（自动引用基础设定）
⑥ Painter          → 带参考图生成下游资产
```

**角色绝不自动链式执行。** 必须由用户手动调用。CLI 通过 Pi 原生的 `/skill:repochan-analysis` 等命令扩展机制来驱动角色。

---

## 前置条件

- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Pi CLI** (`pi`) — 从 [pi.dev](https://pi.dev) 安装
- **Pi 登录** — `pi login`（选择 Codex OAuth 以使用图片生成功能）

```bash
# 验证环境
node --version   # ≥ 18
pnpm --version   # ≥ 9
pi --version     # ≥ 0.79
```

---

## 快速上手（终端用户路径）

```bash
# 1. 安装依赖
cd repochan-mono
pnpm install

# 2. 向 Pi 运行时注册 pi 包（一次性操作）
pnpm --filter repochan exec tsx src/index.ts setup

# 3. 启动 TUI 向导
pnpm run cli
# 或者: pnpm --filter repochan exec tsx src/index.ts

# 4. 按照向导依次执行：分析 → 设定角色 → 基础设定图 → 绘制
```

`setup` 步骤会读取每个 Pi 包的 `package.json > pi` 清单，将解析后的 extension/skill 路径写入 `~/.repochan/pi/settings.json`。CLI 运行时会自动从那里发现所有资源——无需手动传 `-e` 或 `--skill` 参数。

---

## CLI 命令参考

```bash
repochan                         # 交互式 TUI 向导
repochan analyze                 # 运行 Analyst 角色
repochan persona                 # 运行 Creative Writer 角色
repochan foundation              # 运行 Art Director（基础设定图）
repochan paint [order-id]        # 运行 Painter 执行指定订单
repochan setup                   # 注册内置 pi 包
repochan init                    # 初始化 .repochan/ 协议目录
repochan status [--json]         # 协议总览
repochan inspect [--json]        # 原始检查摘要
repochan validate [--json]       # 验证协议产物
repochan order list [--json]     # 列出所有订单
repochan order get <id> [--json] # 读取某个订单
repochan model                   # 在 TUI 中打开模型/登录设置
```

CLI 支持 **i18n（中文 / English）**。首次启动时选择语言并写入设置，之后可在 TUI 内的语言页修改。语言资源位于 `packages/cli/src/locales/{en,zh}.ts`。

---

## 开发者工作流

### 1. 安装和构建

```bash
cd repochan-mono
pnpm install
pnpm --filter @repochan/core build   # core 必须编译（TS → dist/）
```

其他包使用 `--noEmit`（仅类型检查）——Pi 通过 jiti 直接加载源文件。

### 2. 运行测试

```bash
pnpm --filter @repochan/core test    # 23 个测试，唯一的测试套件
pnpm --filter repochan-pi test       # 仅类型检查
pnpm --filter repochan run test      # 构建 + vitest（CLI）
```

### 3. 开发 Pi 包（`repochan-pi` + `image-gen-pi`）

最快的开发循环是用 `pi -e`（加载扩展文件）配合 `--skill`（加载 skills 目录）：

```bash
# 同时加载两个 pi 包 — 扩展和 skills 自动发现
pi -e ./packages/pi/extensions/repochan.ts \
    -e ./packages/image-gen-pi/extensions/index.ts \
    --skill ./packages/pi/skills

# 进入会话后：
#   /order_panel              → 浏览订单结果 + 内联图片预览
#   /skill:repochan-analysis  → 运行 Analyst
#   /skill:repochan-persona   → 运行 Creative Writer
#   /image_model              → 选择图片生成供应商
```

**只加载 repochan 包**（不加 image-gen）：

```bash
pi -e ./packages/pi/extensions/repochan.ts \
    --skill ./packages/pi/skills
```

**非交互测试**（一次性，适合验证工具是否正确注册）：

```bash
pi -e ./packages/pi/extensions/repochan.ts \
    --skill ./packages/pi/skills \
    --print "/skill:repochan-analysis" \
    --thinking off
```

### 4. 开发 CLI

```bash
# 从源码构建（包括 tsc + chmod）
pnpm --filter repochan run build

# 不构建直接运行（jiti 即时加载）
pnpm run cli:dev
# 或: pnpm --filter repochan exec tsx src/index.ts

# 运行特定阶段
pnpm --filter repochan exec tsx src/index.ts analyze
pnpm --filter repochan exec tsx src/index.ts persona
pnpm --filter repochan exec tsx src/index.ts paint ord-foundation-001

# 检查协议状态
pnpm --filter repochan exec tsx src/index.ts validate --json
```

**CLI 角色页面的工作机制：** 每个页面（AnalysisPage、PersonaPage 等）通过 `startRoleSession()` 创建 Pi agent 会话，然后以 `/skill:repochan-analysis`（或等价命令）作为首条提示发送。Pi 的 `_expandSkillCommand` 会将 skill 展开为完整上下文。`AgentStatus` 组件实时渲染工具调用事件、token 统计和会话状态。

### 5. 测试图片生成

```bash
# 在同时加载了两个包的 Pi 会话中：
/image_model                 # 选择供应商（交互式选择器）
# 然后直接描述需求：
#   > 生成一个像素风剑的图标，32×32，蓝色剑身，金色剑柄

# 或者通过环境变量/配置文件直接配置（详见 packages/image-gen-pi/README.md）
```

### 6. 在另一个项目中运行

```bash
cd /path/to/another-project
pnpm --dir /path/to/repochan-mono --filter repochan exec tsx src/index.ts analyze
# 或者全局安装 repochan 后直接运行：repochan analyze
```

### 7. 验证协议完整性

```bash
# 修改 core 后，务必运行：
pnpm --filter @repochan/core test

# 检查 .repochan/ 结构
repochan validate --json
pnpm --filter @repochan core test  # 验证了同样的逻辑
```

---

## 常用开发任务速查

### 改了 core 协议？跑：
```bash
pnpm --filter @repochan/core build && pnpm --filter @repochan/core test
```

### 改了 skill（SKILL.md）？无需构建——Pi 直接读取 .md。
```bash
# 在活跃的 Pi 会话中重载扩展和 skill：
/reload
```

### 改了 unified.ts 或任何 extension？跑：
```bash
pnpm --filter repochan-pi run lint   # 仅类型检查
```

### 改了 CLI 页面或 runtime？
```bash
pnpm --filter repochan run build     # tsc + chmod
```

### 全量构建：
```bash
pnpm --filter @repochan/core build
pnpm --filter repochan-pi run lint
pnpm --filter @repochan/image-gen-pi run lint
pnpm --filter repochan run build
```

---

## 包详情

| 包 | npm 名称 | 主产物 | 使用方 |
|---------|----------|---------------|----------|
| `packages/core` | `@repochan/core` | `dist/index.js`（编译） | 所有 |
| `packages/pi` | `repochan-pi` | `extensions/repochan.ts`（jiti） | Pi agent |
| `packages/image-gen-pi` | `@repochan/image-gen-pi` | `extensions/index.ts`（jiti） | Pi agent |
| `packages/page-renderer` | `@repochan/page-renderer` | `dist/index.js`（编译） | `pi`（库依赖） |
| `packages/cli` | `repochan` | `dist/index.js`（编译） | 终端用户 |

## 文档

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — 架构设计、三层结构、已知缺口、决策原则。
- [`packages/pi/skills/repochan-protocol/SKILL.md`](./packages/pi/skills/repochan-protocol/SKILL.md) — `.repochan/` 磁盘协议规范。
- [`examples/minimal`](./examples/minimal) — 最小示例（无需运行 AI 即可查看）。
