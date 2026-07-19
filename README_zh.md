# RepoChan

[English](./README.md) · [架构说明](./ARCHITECTURE.md)

**把任意 git 仓库变成鲜活的看板娘人格与一致的视觉品牌**——设定集、图标、贴纸、海报、落地页——由**你自带的** coding agent 驱动。

你已经在用 coding agent（Claude Code、Codex、Pi、Cursor、Hermes、……）。RepoChan 给这个 agent 一条可运行的创意管线：分析 → 人设 → 美术指导 → 绘制 → 落地页。硬约束在代码里（schema、状态机、依赖门）；创作判断在 skill 里。**不内嵌任何 runtime**——你的 agent 负责编排，RepoChan 负责追踪。

---

## 它怎么工作

你对**自己的 agent** 说话。向导 skill 调度各团队：

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

**视觉一致性**靠 **foundation sheet（设定集封面）** 锚定。下游资产都引用它，从图标到落地页品牌保持一致。

每个角色产出一份经 schema 校验、版本化、落在 `.repochan/` 下的 artifact。没有任何东西被手写进协议树——你的 agent 调 CLI 子命令，RepoChan 校验并落盘。整个创意状态都能 `cat`、`diff`、`git blame`。

---

## 试试看

**前置条件：** Node.js ≥ 20、你已经在用的 coding agent、（出图需要）OpenAI-compatible 的 images endpoint。

```bash
npm install -g repochan
repochan setup                 # 把 skill 装进你的 agent
#repochan image configure       # 单独配置图像 endpoint 凭证
```

随后在项目中打开 coding agent，输入 `/repochan` 启动 RepoChan 流程。试试：

> 「给这个仓库做个看板娘和全套品牌资产」  
> 「yolo，全套搞定」  
> 「只分析这个仓库」

升级 CLI 后请再次运行 `repochan setup` 来刷新随包分发的 skills；若需要刷新，`repochan status` 会报告版本漂移。

---

## 从源码构建（贡献者）

```bash
pnpm install
pnpm -r build                 # 构建 core、image-gen、image-edit、cli
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # 全量 monorepo 测试
```

包结构、依赖方向、发布合同见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

---

## 深入了解

| 文档 | 内容 |
|------|------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 分层、包、绑定模型、设计原则、已知缺口 |
| [`docs/releasing.md`](./docs/releasing.md) | 叶子优先的发布合同 |
| [`packages/skill/`](./packages/skill/) | skill 清单（向导 + 团队角色） |
| [`packages/core/`](./packages/core/) | 协议、schema、业务规则 |
| [`packages/starters/`](./packages/starters/) | 落地页 starter 目录 |
