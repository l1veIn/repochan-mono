<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme-variants/museum/assets/hero-museum-dark.webp">
  <img src="docs/readme-variants/museum/assets/hero-museum-light.webp" alt="RepoChan 看板娘——完整入画的角色研究，挂在安静的策展灯箱墙面上，配一枚小号展签：REPOCHAN · Character Study · Exhibit 001" width="100%">
</picture>

</div>

# RepoChan

**把任何 git 仓库变成仓库娘！** ——

角色设定集、图标、贴纸、海报、落地页——由*你自己的* coding agent 驱动。

<p align="center">
<img src="docs/readme-variants/museum/assets/icon.png" alt="RepoChan 图标" width="100">
</p>

<p align="center">
<a href="https://www.npmjs.com/package/repochan"><img src="https://img.shields.io/npm/v/repochan?color=38BDF8&label=npm" alt="npm 版本"></a>
<a href="../../../LICENSE"><img src="https://img.shields.io/badge/license-MIT-111827" alt="许可证：MIT"></a>
<a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%E2%89%A520-34D399" alt="node >= 20"></a>
<a href="../../../packages/skill/"><img src="https://img.shields.io/badge/agent-BYO-F9A8D4" alt="agent：自带"></a>
</p>

<p align="center"><b><a href="https://repochan.com">官网</a> · <a href="./README.md">English</a> · <a href="./README_zh.md">中文文档</a> · <a href="./ARCHITECTURE.md">架构</a></b></p>

---

你已经在用某个 coding agent（Claude Code、Codex、Pi、Cursor、Hermes……）。RepoChan 交给它一条创意产线：**分析 → 人设 → 美术指导 → 绘制 → 落地页**。硬规则在代码里（schema、状态机、依赖门禁），创意判断在 skill 里。**没有内嵌运行时**——你的 agent 负责编排，RepoChan 负责记账。

## 试试看

**前置要求**：Node.js ≥ 20、一个你已在用的 coding agent、（生成图像需要）一个 OpenAI 兼容的 images endpoint。

```bash
npm install -g repochan && repochan setup          # 把 skill 装进你的 agent
# repochan starter sync        # 按需下载 starter 目录（~/.repochan/starters）
# repochan image configure       # 配置图像端点凭证
```

然后在项目里打开你的 coding agent，输入 `/repochan` 运行 RepoChan 工作流。试试：

> 「给这个仓库一个吉祥物和全套品牌资产」  
> 「yolo，全流程」  
> 「只分析这个仓库」

升级 CLI 后再跑一次 `repochan setup` 刷新随包 skill；`repochan status` 会在需要刷新时提示版本漂移。

<details>
<summary><b>从源码构建（贡献者）</b></summary>

```bash
pnpm install
pnpm -r build                 # 构建全部 workspace 包与 Starter
pnpm --filter repochan exec node dist/index.js setup
pnpm test                     # 全量 monorepo 测试
```

包结构、依赖方向、发布合同见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

</details>

---

## 它是怎么工作的

你跟**你的 agent**对话，向导 skill 负责调度团队：

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme-variants/pipeline-comic/assets/hero-comic-dark.webp">
  <img src="docs/readme-variants/pipeline-comic/assets/hero-comic-light.webp" alt="五格漫画版管线：分析、人设（检查点）、美术总监、画师（检查点）、页面（检查点）——每格一个角色 tile 配 caption" width="100%">
</picture>

| 模式 | 何时 | 行为 |
|------|------|------|
| **向导（默认）** | 「给我做吉祥物和网站」 | 全流程，检查点停下确认 |
| **yolo** | 你明确说 `yolo` | 授权范围内用默认创意决策；外部写仍需明确授权 |
| **非交互** | CI / 无 TTY | 自动选本地可逆决策；未授权的外部写之前停 |
| **单团队（高级）** | 「只做分析」「重画这张单」 | 单个团队 skill |

**视觉一致性**由**设定集**（foundation sheet）锚定：下游资产全部引用它，从 icon 到落地页保持同一角色。每个角色产出的是 `.repochan/` 下 schema 校验过的版本化产物——整个创意状态都能 `cat`、`diff`、`git blame`。

---

## 展厅

*常设展。每件展品都是这条产线为 RepoChan 自己生产的真实产物——人设、设定集、网格、抠图、落地页，没有示意模型。*

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/readme-variants/museum/assets/gallery/foundation.webp" alt="展品 001——角色设定集：含表情、色板与关键元素的角色设计封面" width="240"><br/><sub>编号 001 · 角色设定集<br/><code>ord-foundation-001</code></sub></td>
    <td align="center" width="33%"><img src="docs/readme-variants/museum/assets/gallery/cutout.webp" alt="展品 002——纸底裱板上的完整入画角色抠图" width="240"><br/><sub>编号 002 · 角色抠图<br/><code>ord-cutout-001</code></sub></td>
    <td align="center" width="33%"><img src="docs/readme-variants/museum/assets/gallery/poster.webp" alt="展品 003——工作室海报：工作台前的看板娘，复古印刷质感" width="240"><br/><sub>编号 003 · 工作室海报<br/><code>ord-poster-001</code></sub></td>
  </tr>
  <tr>
    <td align="center" width="33%"><img src="docs/readme-variants/museum/assets/gallery/stickers.webp" alt="展品 004——从 chroma 网格图切下的三枚贴纸标本" width="240"><br/><sub>编号 004 · 贴纸标本<br/><code>ord-sticker-001</code></sub></td>
    <td align="center" width="33%"><img src="docs/readme-variants/museum/assets/gallery/webstates.webp" alt="展品 005——三枚网页状态标本：搜索中、错误、惬意" width="240"><br/><sub>编号 005 · 状态标本<br/><code>ord-webstates-001</code></sub></td>
    <td align="center" width="33%"><a href="../../../packages/starters/landing-museum"><img src="docs/readme-variants/museum/assets/gallery/landing-museum.webp" alt="展品 006——museum 落地 starter：为看板娘打造的白盒子展览页" width="240"></a><br/><sub>编号 006 · museum 落地页<br/><code>packages/starters/landing-museum</code></sub></td>
  </tr>
</table>

网格图在统一 matte 上以 layout-guide 为构图参考生成，再由我们自己的 chroma-grid 管线切分（soft-alpha unmix、质心归格、fail-loud QA）——同样的 `repochan image edit` 命令就随 CLI 发布。

---

## Starter 画廊

*二十个展厅中的四间。完整可本地化的 Astro 站点——slot、locale 文件、订单溯源资产齐备。任意 `repochan starter pull`：*

<table>
  <tr>
    <td align="center" width="25%"><a href="../../../packages/starters/landing-neobrutal-zine"><img src="docs/readme-variants/museum/assets/starters/landing-neobrutal-zine.webp" alt="Starter 预览：landing-neobrutal-zine" width="200"><br/><sub>neobrutal-zine</sub></a></td>
    <td align="center" width="25%"><a href="../../../packages/starters/landing-frutiger-aero"><img src="docs/readme-variants/museum/assets/starters/landing-frutiger-aero.webp" alt="Starter 预览：landing-frutiger-aero" width="200"><br/><sub>frutiger-aero</sub></a></td>
    <td align="center" width="25%"><a href="../../../packages/starters/landing-solarpunk"><img src="docs/readme-variants/museum/assets/starters/landing-solarpunk.webp" alt="Starter 预览：landing-solarpunk" width="200"><br/><sub>solarpunk</sub></a></td>
    <td align="center" width="25%"><a href="../../../packages/starters/landing-memphis"><img src="docs/readme-variants/museum/assets/starters/landing-memphis.webp" alt="Starter 预览：landing-memphis" width="200"><br/><sub>memphis</sub></a></td>
  </tr>
</table>

……另有 16 个，见 [starter 目录](./packages/starters/README.md)。

---

## 深入了解

| 文档 | 内容 |
|------|------|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | 分层、包、绑定模型、设计原则、已知缺口 |
| [`docs/releasing.md`](docs/releasing.md) | 叶子优先的发布合同 |
| [`packages/skill/`](./packages/skill/) | skill 清单（向导 + 团队角色） |
| [`packages/core/`](./packages/core/) | 协议、schema、业务规则 |
| [`packages/browse/`](./packages/browse/) | 本地协议浏览器与 Starter 预览服务 |
| [`packages/starters/`](./packages/starters/) | 落地页 starter 目录 |

---

## 致谢

RepoChan 的抠图 / 网格切分管线（`@repochan/image-edit`）借鉴了以下开源项目的成熟技术：

- [`aldegad/sprite-gen`](https://github.com/aldegad/sprite-gen)（Apache-2.0）—— chroma v2 管线移植自其已知背景色 soft-alpha unmix、trapped-spill despill 与 key-depth 分类；centroid 网格几何（连通域归格、跨格劈分、碎屑处理）沿袭其 slice-sheet 设计。见 [`packages/image-edit/NOTICE`](./packages/image-edit/NOTICE)。
- [`0x0funky/agent-sprite-forge`](https://github.com/0x0funky/agent-sprite-forge) —— 生成侧稳定化思路：以 layout-guide 图作为构图参考、fail-loud 质检门驱动重生而非掩盖缺陷。

---

<div align="center">
<img src="./docs/assets/readme/footer-banner.webp" alt="Sugar Riff 工作室——仓库酱在略显凌乱的工作台前，满墙动漫海报与手办，午后暖阳" width="100%">
<br/>
<sub>Sugar Riff 工作室——每张海报和手办都是她世界的真实一角（可乐永远是冰的）。</sub>
</div>
