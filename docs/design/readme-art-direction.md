# Design：RepoChan README 艺术方向方案

> 状态：设计草案（待实现）  
> 相关：根目录 `README.md` / `README_zh.md` · dogfood 资产 `.repochan/` · starters 预览  
> 日期：2026-07-21  

---

## 1. 目标

把根目录 README 从「合格的工程说明」升级为 **策展级封面 + 可扫读的工具文档**：

1. **第一眼**建立「给仓库一个灵魂」的品牌与角色记忆。  
2. **30 秒内**能完成安装与启动路径（真文本、可复制）。  
3. **用 dogfood 真资产**证明管线产物，而不是空口概念图。  
4. 中英文共用视觉层，文案分叉；本地优先，不依赖第三方动态图服务。

非目标：把 README 做成可交互官网、完整 CSS 网页、或 profile 花活合集。

---

## 2. 平台约束（实现必须遵守）

GitHub README = GFM + **消毒后的有限 HTML**，不是浏览器文档。

| 可用 | 不可用 / 不可靠 |
|------|-----------------|
| Markdown 全文、表格、代码块 | `<style>` / `<script>` / `<iframe>` |
| `<img>`（png/webp/gif/svg） | 外链自定义 CSS |
| 有限 HTML（`div`/`p`/`br`/`details` 等） | 真 flex/grid 网页布局 |
| `align`、img `width`、简单 table 分栏 | 任意 Web 字体（除非画进图） |
| SVG 内嵌样式与轻动画（经 sanitize） | 依赖 JS 的交互 |

**硬规则：**

- 安装命令、链接、关键说明必须是 **可复制 Markdown 文本**，不得只存在于图中。  
- 核心视觉资产 **入库**（`assets/readme/`），不依赖 shields 动态服务作为主视觉。  
- 控制体积：首屏 Hero 建议 ≤ 400KB；整页图片合计建议 ≤ 1.5MB。

---

## 3. 选定主调：Museum Cover（默认）

在多种可行方向中，**默认采用 Museum Cover**，与工具产品气质一致，并与 browse viewer 的「无角色抢戏的工具壳」区分——**README 可以、也应该让角色出场**，因为这里的受众是第一次认识产品的人。

| 维度 | 决策 |
|------|------|
| 气质 | 策展灯箱 · 墨/纸/雾 · 展签感 · 真资产证明 |
| 角色 | Hero 与产物墙 **主角**；不做成游戏 HUD 或摇滚 zine 封面（那些留给 starter 预览条） |
| 信息 | 艺术层与工程层分离：上图下文 / 侧图不挡命令 |
| 对照 | 近 `docs/prototypes/07-museum-white-cube`；远 Frutiger/Zine 花活 |

### 备选皮肤（同一信息骨架可换 Hero）

| ID | 何时用 | 说明 |
|----|--------|------|
| `museum`（默认） | 正式发布 | 静、贵、可信 |
| `character-file` | 强调人设管线 | 立绘 + 档案条，安装仍首屏 |
| `pipeline-comic` | 强调流程故事 | 五格流水线，信息即漫画 |
| `terminal-corner` | 强调 CLI | 终端 SVG + 角标 dig 割 |

实现 Phase 1 只做 **museum**；其它仅保留为后续换皮可能。

---

## 4. 信息架构（中英同构）

```text
┌─────────────────────────────────────────────┐
│ 0. 语言切换 ·（可选）小 badges                 │
│ 1. HERO（全宽艺术图）                          │
│ 2. 一句话价值 + 三个能力点（文本）               │
│ 3. Try it — 前置条件 + 可复制命令               │
│ 4. How it works — 管线简图/表 + 检查点说明      │
│ 5. Gallery — dogfood 产物墙（2×N）             │
│ 6. Starters strip — 链到预览（可选）            │
│ 7. Architecture teaser → ARCHITECTURE.md      │
│ 8. Go deeper 文档表                            │
│ 9. Acknowledgments                             │
└─────────────────────────────────────────────┘
```

### 区块规格

| # | 区块 | 形式 | 要求 |
|---|------|------|------|
| 0 | 语言 | 文本链接 | `README.md` ↔ `README_zh.md` 双向；ARCHITECTURE 链保留 |
| 1 | Hero | 一张主图（+ 可选 dark） | 含角色、品牌名暗示、负空间不挡认知；**alt 必填** |
| 2 | Pitch | Markdown | 现有一句话可润色，不改产品承诺 |
| 3 | Try it | 代码块 | `npm i -g repochan && repochan setup` 等保持准确 |
| 4 | Pipeline | 表 + 可选 SVG/图 | 六角色 + 三检查点；与 skill 一致 |
| 5 | Gallery | 图网格 | 真 dogfood；展签式 caption（资产类型名） |
| 6 | Starters | 小预览条 | 链 `packages/starters/*/repochan/previews` 或 docs；证明多样性 |
| 7–9 | 工程 | 文本/表 | 贡献构建、深链、致谢不删不弱化 |

**折叠策略：** 过长的架构细节、完整模式表可用 `<details>`，首屏不堆。

---

## 5. 视觉系统

### 5.1 色与材质（Hero / 导出图）

| Token | 建议 | 用途 |
|-------|------|------|
| Wall | `#F7F7F5` / 深色 `#0B0F19` | 灯箱底 |
| Ink | `#1A1A1A` / `#F4F6FB` | 图内必要字（尽量少字） |
| Accent | `#38BDF8` | 细线、焦点、小标签 |
| Spot | 柔光径向 | 角色脚下/身后 |

图内 **尽量少 baked 文字**（GitHub 缩放后糊；中英两套图成本高）。品牌名可极克制出现；口号留给 Markdown。

### 5.2 角色出场规则

| 位置 | 规则 |
|------|------|
| Hero | 允许完整 dig 割 / 半身 / 场景构图；仓库酱 dogfood 身份 |
| Gallery | 以 **产物类型** 为主（foundation sheet、sticker 墙、landing 截图），角色只作为产物内容 |
| 正文旁 | 可用小 sticker（≤96px）点缀 `details` 或章节，不环绕正文挤命令块 |
| Badge 行 | 可用 32px icon，不用立绘 |

### 5.3 排版（Markdown 层）

- 居中：Hero、主 pitch 短句可用 `<div align="center">` / `<p align="center">`。  
- 双栏：仅用 **HTML table**（无边框）做「左文右小图」；移动端接受堆叠。  
- 章节标题保持 AT2 文本，利于目录与搜索。

---

## 6. 资产清单与目录

### 6.1 仓库落点

```text
assets/readme/
  README.md                 # 本目录说明：来源 order、导出命令、尺寸
  hero-museum.webp          # 主 Hero（light）
  hero-museum-dark.webp     # 可选 dark
  pipeline.svg              # 可选：管线示意（轻动画或静态）
  gallery/
    foundation.webp
    stickers.webp
    poster.webp
    landing-museum.webp     # 或 starter desktop 裁切
    landing-aero.webp       # 可选 strip
    landing-zine.webp
    landing-scrolly.webp
  icon.png                  # 与产品 icon 一致，小尺寸
```

不把原始 2K–4K 订单 PNG 直接链进 README；一律 **导出为 README 专用** 压缩件。

### 6.2 尺寸与格式

| 资产 | 画幅 | 格式 | 体积目标 |
|------|------|------|----------|
| Hero | 2400×1000（12:5）或 1920×1080 | WebP q80–85 | ≤ 400KB |
| Gallery 单格 | 800×600 或 1:1 800 | WebP | ≤ 120KB |
| Starter 条 | 640×360（16:9 裁切） | WebP | ≤ 80KB |
| pipeline | 1200×400 viewBox | SVG | ≤ 50KB |
| icon | 64 / 128 | PNG | ≤ 20KB |

### 6.3 来源映射（dogfood）

| 导出 | 优先来源（示例） |
|------|------------------|
| Hero | `ord-cutout` / scene poster + 灯箱合成；或专用 README hero order |
| foundation | `ord-foundation-001` current version → 压缩 |
| stickers | sticker sheet 或 3×3 拼贴导出 |
| poster | `ord-poster-*` |
| landing-* | `packages/starters/<id>/repochan/previews/desktop.webp` 再压一档 |
| icon | `ord-icon-001` favicon/icon-192 |

合成 Hero 时：角色来自项目 foundation 一致性；底用中性 wall，**不要**直接截 Frutiger 整页当唯一 Hero（避免「这是某个 landing」误解）。可用 landing 出现在 Gallery/Starters 条。

### 6.4 Dark mode

优先方案：

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/hero-museum-dark.webp">
  <img src="assets/readme/hero-museum.webp" alt="..." width="100%">
</picture>
```

若 GitHub 对 `picture` 支持异常，回退为单张中性对比 Hero（避免纯白底大闪）。

---

## 7. 文案原则

| 项 | 原则 |
|----|------|
| 中英 | 同构章节；视觉文件同路径；禁止一侧有 Gallery 一侧没有 |
| 语气 | 自信、具体、可验证；少感叹号堆砌 |
| 产品词 | foundation sheet、checkpoint、agent-agnostic、无 embedded runtime — 与 ARCHITECTURE 一致 |
| 角色名 | 中文「仓库酱」/ 英文项目 mascot 名与 persona 一致（dogfood 以当前 persona 为准） |
| 长度 | 英文主 README 建议滚动 1.5–2.5 屏信息密度；细节下沉 ARCHITECTURE |

**Pitch 方向（可微调，实现时定稿）：**

- EN: *Turn any git repository into a living mascot and a consistent visual brand — driven by your coding agent.*  
- ZH: 保持现有核心句，可加半句「本页展品均为管线真实产物」在 Gallery 前。

---

## 8. 组件级线框

### 8.1 Hero

```text
┌──────────────────────────────────────────────────────────┐
│  [ 柔光 wall ]           仓库酱 dig 割偏右或居中           │
│  左或下：大面积安静区（图内尽量无长句）                    │
│  可选极小 label: REPOCHAN / CHARACTER FILE No.001        │
└──────────────────────────────────────────────────────────┘
Markdown 正下方居中：H1 文本标题「RepoChan」（可与图内品牌二选一防重复）
```

注意：若图内已有巨大 wordmark，Markdown 可用次级标题或省略重复 H1 装饰——**可访问性仍需页面级标题**，保留 `# RepoChan`。

### 8.2 Gallery（展品墙）

```html
<!-- 示意：table 2×2 或 2×3，每格 img + 斜体/小字类型名 -->
| foundation sheet | stickers |
| poster | landing preview |
```

Caption 用资产类型英文/中文，不写虚假博物馆编号除非好玩且两边一致。

### 8.3 Pipeline

Phase 1：保持现有 ASCII/表即可。  
Phase 1.1：替换为 `pipeline.svg`（六节点 + 三 pause 标记），节点用 accent 点，无复杂动画。

### 8.4 Starters strip（可选）

四张 desktop 预览横排或 2×2，链到 `packages/starters/` 或文档；alt 写 starter id。

---

## 9. 实现分期

### Phase A — 资产与目录（不改文案结构也可先合入）

1. 建 `assets/readme/` 与目录 README（来源、导出步骤）。  
2. 从 dogfood 导出 Hero + 4 张 Gallery + icon。  
3. 人工过目：对比度、角色完整、无意外 baked 乱字。

### Phase B — 改根 README

1. `README.md` / `README_zh.md` 按 §4 重排。  
2. 插入 Hero、Gallery；Try it 命令回归测试。  
3. 本地预览 + push 后看 GitHub 实渲染（暗色模式各看一次）。

### Phase C — 抛光

1. `picture` dark Hero。  
2. `pipeline.svg`。  
3. Starters strip。  
4. （可选）极轻 SVG 呼吸/光晕；禁止大 GIF。

### Phase D — 管线化（远期）

- 文档化：从 order 到 `assets/readme` 的 `repochan image edit compress` 命令。  
- 或 skill 片段：「发布前更新 README 展品」。  
- 不在本阶段做自动 CI 覆盖 README 图（避免意外大 diff），除非另开 RFC。

---

## 10. 无 / 不用清单

### 用

- 入库 WebP/SVG、dogfood 真图  
- 居中 Hero、table 画廊、`details` 折叠  
- 真代码块安装  
- 与 persona 一致的角色形象  

### 不用

- 第三方 typing SVG / stats 卡作主视觉  
- foreignObject 整页假网页（维护与 a11y 差；最多以后点缀）  
- 整页 neo-brutal / Frutiger 营销壳当唯一 README 皮肤  
- 图内写长安装教程  
- 未压缩的 foundation 原图直链  

---

## 11. 验收标准

- [ ] 未滚动即可看到：品牌名、一句话、安装命令入口  
- [ ] 安装命令可复制且与 `package.json`/发布名一致  
- [ ] Hero + Gallery 均为仓库内路径，clone 离线可看（相对路径）  
- [ ] 中英章节同构，图片路径一致  
- [ ] GitHub 浅色/深色主题下 Hero 可接受（有 dark 或中性底）  
- [ ] 全页图片合计体积合理（§2）  
- [ ] 读屏：Hero/Gallery 均有有意义 `alt`  
- [ ] Acknowledgments 与 ARCHITECTURE 链接仍在  
- [ ] 与「花里胡哨 profile README」可区分：仍是工具文档，不是贴纸簿  

---

## 12. 开放决策（实现前可默认）

| 决策 | 默认 |
|------|------|
| 主调 | `museum` |
| Dark Hero | Phase C 再做；Phase B 可先单张中性 |
| Starters strip | Phase C |
| 图内是否出现中文口号 | 否（口号用 MD） |
| Hero 是否单独出 order | 优先现有 cutout+合成；不够再下 `ord-readme-hero` |

---

## 13. 实现时文件触点

| 文件 | 动作 |
|------|------|
| `assets/readme/**` | 新建导出资产 |
| `README.md` | 按本方案重排 |
| `README_zh.md` | 同构 |
| `docs/design/readme-art-direction.md` | 本文；保留为已实现 README 视觉方向的设计记录 |

不修改 `packages/skill` 业务协议；README 艺术化与 `.repochan` 协议解耦。

---

## 14. 一句话

> **在 GitHub 允许的画布里，用博物馆封面的方式交出仓库酱与真实管线产物；工程路径保持可复制、可搜索、可访问。**
