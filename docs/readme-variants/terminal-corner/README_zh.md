<div align="center">

<img src="./assets/hero-terminal.webp" alt="深色终端窗口里跑着一段真实的 RepoChan 会话——npm install、repochan setup、analysis run、persona create、image gen、starter pull——右下角叠着圆形角标看板娘" width="100%">

<br/>

**把任何 git 仓库变成有生命力的吉祥物人设和统一的视觉品牌** ——

角色设定集、图标、贴纸、海报、落地页——由*你自己的* coding agent 驱动。

<br/>

[![npm](https://img.shields.io/npm/v/repochan?color=38BDF8&label=npm)](https://www.npmjs.com/package/repochan)
[![license](https://img.shields.io/badge/license-MIT-111827)](../../../LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-34D399)](https://nodejs.org)
[![skills](https://img.shields.io/badge/agent-BYO-F9A8D4)](../../../packages/skill/)

**[English](./README.md) · [中文文档](./README_zh.md) · [架构](../../../ARCHITECTURE.md)**

</div>

# RepoChan

> 皮肤：**terminal-corner** —— CLI 优先的 README 变体（终端 Hero + 角标看板娘）。正式 README 在[仓库根目录](../../../README.md)；本页工程内容与之等价。

你已经在用某个 coding agent（Claude Code、Codex、Pi、Cursor、Hermes……）。RepoChan 交给它一条创意产线：**分析 → 人设 → 美术指导 → 绘制 → 落地页**。硬规则在代码里（schema、状态机、依赖门禁），创意判断在 skill 里。**没有内嵌运行时**——你的 agent 负责编排，RepoChan 负责记账。

产线做的每件事都是一条你可以自己跑、自己读、自己 diff 的命令：

```console
$ repochan analysis run        # ① 分析师扫描仓库
$ repochan persona create      # ② 创意团队起草吉祥物      ⏸ 确认人设
$ repochan order create        # ③ 美术总监建齐全部创作订单
$ repochan image gen           # ④ 画师出图，设定集优先    ⏸ 确认设定集
$ repochan starter pull        # ⑤ 页面设计装配落地页      ⏸ 部署前
```

## 试试看

**前置要求**：Node.js ≥ 20、一个你已在用的 coding agent、（生成图像需要）一个 OpenAI 兼容的 images endpoint。

```bash
npm install -g repochan && repochan setup          # 把 skill 装进你的 agent
# repochan image configure       # 配置图像端点凭证
```

然后在项目里打开你的 coding agent，输入 `/repochan` 运行 RepoChan 工作流。试试：

> 「给这个仓库一个吉祥物和全套品牌资产」  
> 「yolo，全流程」  
> 「只分析这个仓库」

升级 CLI 后再跑一次 `repochan setup` 刷新随包 skill；`repochan status` 会在需要刷新时提示版本漂移。

| 模式 | 何时 | 行为 |
|------|------|------|
| **向导（默认）** | 「给我做吉祥物和网站」 | 全流程，检查点停下确认 |
| **yolo** | 你明确说 `yolo` | 授权范围内用默认创意决策；外部写仍需明确授权 |
| **非交互** | CI / 无 TTY | 自动选本地可逆决策；未授权的外部写之前停 |
| **单团队（高级）** | 「只做分析」「重画这张单」 | 单个团队 skill |

**视觉一致性**由**设定集（foundation sheet）**锚定：下游资产全部引用它，从 icon 到落地页保持同一角色。每个角色产出的是 `.repochan/` 下 schema 校验过的版本化产物——整个创意状态都能 `cat`、`diff`、`git blame`。

<details>
<summary><b>从源码构建（贡献者）</b></summary>

```bash
pnpm install
pnpm -r build                 # 构建 core、image-gen、image-edit、cli
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # 全量 monorepo 测试
```

包结构、依赖方向、发布合同见 [`ARCHITECTURE.md`](../../../ARCHITECTURE.md)。

</details>

---

## 狗粮：我们自己的品牌就是 RepoChan 做的

<table>
  <tr>
    <td>本页的一切都是这条产线为 RepoChan 自己生产的——人设、设定集、贴纸网格、海报、落地 starter。网格图在统一 matte 上以 layout-guide 为构图参考生成，再由我们自己的 chroma-grid 管线切分（soft-alpha unmix、质心归格、fail-loud QA）——同样的 <code>repochan image edit</code> 命令就随 CLI 发布。</td>
    <td align="center" width="120"><img src="./assets/corner-badge.webp" width="96" alt="仓库酱圆形角标——银发粉薄荷挑染、异色瞳、三角发夹、耳机"></td>
  </tr>
</table>

<table>
  <tr>
    <td align="center"><img src="./assets/gallery-foundation.webp" width="360" alt="设定集——角色设计封面，含色板、表情、关键道具与装备"><br/><sub>设定集 · <code>ord-foundation-001</code></sub></td>
    <td align="center"><img src="./assets/gallery-stickers.webp" width="360" alt="chroma-grid 管线切出的 3×3 贴纸格——挥手、搜索、庆祝、睡觉等"><br/><sub>贴纸网格 · <code>image edit extract</code></sub></td>
  </tr>
  <tr>
    <td align="center"><img src="./assets/gallery-poster.webp" width="360" alt="海报——看板娘在工作台前画画，risograph 质感"><br/><sub>海报 · <code>ord-poster-001</code></sub></td>
    <td align="center"><img src="./assets/gallery-landing-glitch-os.webp" width="360" alt="landing-glitch-os starter 预览——桌面 OS 页面，每扇窗口都在跑真实 repochan 命令"><br/><sub>落地页 · <code>landing-glitch-os</code></sub></td>
  </tr>
</table>

### Starter 画廊

完整可本地化的 Astro 站点——slot、locale 文件、订单溯源资产齐备。任意 `repochan starter pull`：

<table>
  <tr>
    <td align="center"><a href="../../../packages/starters/landing-glitch-os"><img src="./assets/strip-landing-glitch-os.webp" width="220" alt="landing-glitch-os starter——RepoChan OS 桌面与终端窗口"></a><br/><sub>glitch-os</sub></td>
    <td align="center"><a href="../../../packages/starters/caddy"><img src="./assets/strip-caddy.webp" width="220" alt="caddy starter——HTTPS 服务器落地页，深底青绿"></a><br/><sub>caddy</sub></td>
    <td align="center"><a href="../../../packages/starters/redis"><img src="./assets/strip-redis.webp" width="220" alt="redis starter——实时数据平台落地页"></a><br/><sub>redis</sub></td>
    <td align="center"><a href="../../../packages/starters/marktext"><img src="./assets/strip-marktext.webp" width="220" alt="marktext starter——markdown 编辑器落地页，墨色衬线"></a><br/><sub>marktext</sub></td>
  </tr>
</table>

……另有 16 个，见 [starter 目录](../../../packages/starters/README.md)。

---

## 深入了解

| 文档 | 内容 |
|------|------|
| [`ARCHITECTURE.md`](../../../ARCHITECTURE.md) | 分层、包、绑定模型、设计原则、已知缺口 |
| [`docs/releasing.md`](../../../docs/releasing.md) | 叶子优先的发布合同 |
| [`packages/skill/`](../../../packages/skill/) | skill 清单（向导 + 团队角色） |
| [`packages/core/`](../../../packages/core/) | 协议、schema、业务规则 |
| [`packages/starters/`](../../../packages/starters/) | 落地页 starter 目录 |

---

## 致谢

RepoChan 的抠图 / 网格切分管线（`@repochan/image-edit`）借鉴了以下开源项目的成熟技术：

- [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen)（Apache-2.0）—— chroma v2 管线移植自其已知背景色 soft-alpha unmix、trapped-spill despill 与 key-depth 分类；centroid 网格几何（连通域归格、跨格劈分、碎屑处理）沿袭其 slice-sheet 设计。见 [`packages/image-edit/NOTICE`](../../../packages/image-edit/NOTICE)。
- [`0x0funky/agent-sprite-forge`](https://github.com/0x0funky/agent-sprite-forge) —— 生成侧稳定化思路：以 layout-guide 图作为构图参考、fail-loud 质检门驱动重生而非掩盖缺陷。
