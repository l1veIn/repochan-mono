# Phase 2：组装 Astro 页面工程

#### 步骤 6：生成或打开页面工程

```
repochan page generate-project --starter constructivist --output-dir repochan-page
```

如果 `repochan-page/` 已存在，不要覆盖；直接读取它的 README、`src/i18n/*.json`、`src/config/*.ts` 和组件结构。

#### 步骤 7：确定 theme

从 persona 提取配色和视觉品牌，结合项目类型选 style：

```json
{
  "theme": {
    "primary": "<persona.mainColor>",
    "secondary": "<persona.secondaryColor>",
    "accent": "<persona.accentColors[0]>",
    "accent2": "<persona.accentColors[1]>",
    "accent3": "<persona.accentColors[2]>",
    "background": "#FFFFFF",
    "style": "<根据项目类型选择>",
    "darkMode": false,
    "motifs": "<persona.keyMotifs>",
    "patternAsset": { "orderId": "<ord-pattern-001>", "file": "<hero-bg.png>" },
    "textureStyle": "<从 signaturePatterns + artStyle 综合，如 'constructivist' | 'art-deco' | 'botanical'>"
  }
}
```

style 选择：
- `modern` — 技术项目默认
- `minimal` — 工具类、CLI 项目
- `playful` — 创意类、社区项目
- `techy` — 硬核技术项目
- `elegant` — 品牌展示

视觉品牌扩展字段（可选但推荐）：
- `accent2` / `accent3`：persona 多色 accent 全部暴露给模板，用于大胆配色（渐变/色块拼接/多色装饰）
- `motifs`：从 persona `keyMotifs` 带过来，驱动 UI 装饰元素（菱形、徽章、分割线纹样）
- `patternAsset`：引用 `visual_pattern` order 的 2×2 纹理表，切分后的 tile 用于 section 背景/边框/CTA 底纹
- `textureStyle`：综合 `signaturePatterns` + `artStyle` 得出的纹理处理风格标签，指导模板选择对应的视觉语言（如构成主义→硬边粗线色块）

将这些信息写入模板的 theme/config 文件，而不是只写 Page JSON。

#### 步骤 8：填充文案

**从 analysis 填充（主要来源）：**
- `title`：`context.basic.project_name` + 简短定位
- `description`：`preAnalysis.summary`
- `hero headline`：项目名 + 核心价值
- `hero subheadline`：`preAnalysis.summary` 或 `abstract.overall_impression`
- `features items`：从 README `##` 标题 + `tech_stack.frameworks` 提炼
- `stats items`：`total_files`、`total_lines`、测试数量、技术栈统计

**从 persona 填充（仅限视觉）：**
- theme 配色 + 视觉品牌字段（accent2/3、motifs、patternAsset、textureStyle）
- `footer brand`：persona.name（navbar brand 用项目名）

把文案写入 `src/i18n/zh.json` 和 `src/i18n/en.json`。跟随 README 主语言时，仍保留另一个 locale 的可编辑初稿。

#### 步骤 9：image-edit 后处理 + 填充资产 manifest

**page-designer 是 image-edit 的唯一设计层用户。** Painter 交付的是原始 PNG（网格拼图、4K 合成图、matte 底角色图、icon 单图），它们大多不能被网站直接消费——需要先经过 `repochan image edit <op>` 后处理。这一步只有你负责。

**核心原则：派生产物写入 `repochan-page/public/`，绝不回灌 `.repochan/`。** `.repochan/` 只存 Painter 交付的原始版本（invariant #4）；后处理产物是网站工程目录里的派生资产。

##### image-edit 后处理清单（按 op）

下表是 op → 触发条件 → 目标目录的完整映射。不是每张图都要跑全部 op——按资产类别挑需要的。

| op | 何时用 | 目标目录 | 典型资产 |
|---|---|---|---|
| `compress` | 任何 >200KB 的展示图/背景图进 `public/` 前 | `public/assets/` | hero 合成图、poster、gallery |
| `slice` | Painter 交付了网格拼图（chibi 网格、icon 矩阵、pattern 2×2） | `public/assets/<class>/` | chibi_3x3、iconfont_4x4、pattern_2x2 |
| `extract-stickers` | chibi/贴纸网格需要透明背景的独立贴纸 | `public/assets/chibi/` | sticker_sheet、chibi_emojis |
| `chroma-key` | Painter 交付了 matte 底角色图（character-cutout），需要透明角色叠到背景上 | `public/assets/character/` | character_cutout |
| `bg-remove` | 简单背景抠图（ISNet matting），用于非 matte 底的图 | `public/assets/<class>/` | 偶发抠图需求 |
| `resize` | 一个 icon 单图要出多尺寸（favicon/app-icon/og-image） | `public/assets/favicon/` | icon-single |
| `favicon` | 落地页需要 `.ico`（浏览器标签页） | `public/favicon.ico` | icon-single |
| `gif-from-frames` | 有动画帧序列要合成 GIF（少见） | `public/assets/` | 演示动画 |

##### op 详解与示例

**1. compress — 压缩为 WebP（最高频）**

```bash
repochan image edit compress <source.png> \
  --out repochan-page/public/assets/<name>.webp \
  --format webp --quality 82 --max-width 2560 --overwrite
```

压缩规则按资产类别分档：
- 全屏背景图（hero/section 底图）：`--max-width 2560 --quality 82`
- 展示图（gallery/poster/foundation）：`--max-width 1920 --quality 85`
- 表情/icon/小图（<500px）：**不压缩**，直接用 PNG
- 纹理（四方连续）：**不压缩**，直接用 PNG

**不要把原始大 PNG 放进 `public/`**——PNG 留在 `.repochan/orders/` 存档，`public/` 里只放压缩后的 WebP。部署时 `public/` 所有内容都会上传，大 PNG 会浪费带宽。

**2. slice — 网格切片**

当 Painter 交付的是一张网格拼图（chibi 3×3、iconfont 4×4、pattern 2×2），先切片再进 `public/`：

```bash
# chibi 3×3 → 9 张独立表情
repochan image edit slice <grid.png> \
  --rows 3 --cols 3 \
  --out repochan-page/public/assets/chibi \
  --padding 0 --overwrite

# pattern 2×2 → 4 张独立纹理
repochan image edit slice <pattern-grid.png> \
  --rows 2 --cols 2 \
  --out repochan-page/public/textures \
  --overwrite
```

切片产物默认保留 PNG（小图不值得压 WebP）。如果单格 >500px 且数量多，可对每格再跑 compress。

> Painter 被要求画「可切片」的网格（白底、留 gutter、1:1）——见 painter `asset-type-guides.md`。你切的成败取决于 Painter 遵守约束的程度；切片后肉眼检查是否有粘连/截断。

**3. extract-stickers — 透明贴纸（ISNet 抠图）**

贴纸网格要变成**透明背景的独立贴纸**（用于浮动装饰、gallery hover 等），用 extract-stickers（内置 ISNet matting + blob 检测）：

```bash
repochan image edit extract-stickers <chibi-grid.png> \
  --rows 3 --cols 3 \
  --out repochan-page/public/assets/chibi \
  --model small --overwrite
```

首次运行会下载 ~40MB 模型。`extract-stickers` 和 `slice` 的区别：前者抠出透明 PNG（去掉白底），后者只按网格裁切（保留背景）。需要透明贴纸用 extract-stickers，只需裁切用 slice。

**4. chroma-key — matte 底角色抠图**

Painter 的 `character-cutout` 模板用特定 matte 色（`{{matte_color}}`）做底，方便 chroma-key 抠出透明角色，叠到 hero/section 背景上：

```bash
repochan image edit chroma-key <character.png> \
  --out repochan-page/public/assets/character/hero-character.png \
  --matte auto --threshold 28 --softness 34 --spill 0.85
```

`--matte auto` 自动估计底色；也可显式指定 `--matte "#ff00ff"`（模板里渲染了什么色就填什么）。注意：发梢、半透明材质在 chroma-key 下可能有残留——方法论文档（`.plans/2026-07-12-ai-image-web-composition.md` 策略 D）记录了这个限制。

**5. bg-remove — 通用抠图（ISNet）**

非 matte 底的简单背景图，用 ISNet matting 抠图：

```bash
repochan image edit bg-remove <image.png> \
  --out repochan-page/public/assets/<name>.png \
  --model small --overwrite
```

与 chroma-key 的区别：chroma-key 适合**已知纯色底**（速度快、确定性）；bg-remove 适合**任意背景**（ML 抠图，质量取决于背景复杂度）。优先用 chroma-key（Painter 已按 matte 策略出图）；bg-remove 是兜底。

**6. resize — 多尺寸输出**

一个 icon 单图要出多尺寸（favicon、app-icon、og-image）：

```bash
repochan image edit resize <icon-single.png> \
  --sizes 16,32,48,180,192,512 \
  --out repochan-page/public/assets/favicon \
  --fit inside --overwrite
```

**7. favicon — 生成 .ico**

落地页标准资产，从 icon-single 生成多分辨率 `.ico`：

```bash
repochan image edit favicon <icon-single.png> \
  --out repochan-page/public/favicon.ico \
  --sizes 16,32,48,180,256 --overwrite
```

确认 HTML `<link rel="icon" href="/favicon.ico">` 存在。

**8. gif-from-frames — 帧序列合成 GIF（少见）**

```bash
repochan image edit gif-from-frames <f1.png> <f2.png> <f3.png> \
  --out repochan-page/public/assets/demo.gif \
  --fps 12 --loop 0 --overwrite
```

##### 文件命名与 manifest

- 用语义化文件名（`foundation.webp`、`banner.webp`、`poster.webp`），而非 order/version 路径——模板内部通过 `src/config/assets.ts` 的 key 映射到文件。
- 纹理按用途落到 `repochan-page/public/textures/`，文件名必须与 `src/config/site.ts` 的 `textures[].src` 匹配：
  ```
  repochan-page/public/textures/hero-bg.png     # hero section 背景纹理
  repochan-page/public/textures/divider.png      # 边框/分割线纹理
  repochan-page/public/textures/sideband.png     # 侧边装饰纹理
  repochan-page/public/textures/cta-bg.png       # CTA 底纹
  ```
- 后处理完成后更新 `src/config/assets.ts`。未交付的视觉原型保留为 `status: "pending"`，不要伪造图片结果。

##### 决策速查：拿到一张图该跑哪个 op？

```
这张图是网格拼图吗？
├─ 是 → 需要透明贴纸？
│        ├─ 是 → extract-stickers
│        └─ 否 → slice
└─ 否 → 需要透明背景（角色/贴纸）？
         ├─ 是 → 已知 matte 底色？chroma-key : bg-remove
         └─ 否 → 是 icon 单图要出多尺寸？resize（+ favicon 生成 .ico）
                  └─ 否 → 是大展示图（>200KB）？compress
                           └─ 否（小图/纹理）→ 直接复制 PNG，不处理
```

#### 步骤 10：验证

在 `repochan-page/` 内运行：

```
pnpm install
pnpm build
```

检查中英页面、移动端布局、图片 fallback、以及真实图片路径。
