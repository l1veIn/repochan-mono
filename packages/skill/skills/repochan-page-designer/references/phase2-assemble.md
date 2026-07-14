# Phase 2：组装 Astro 页面工程

#### 步骤 6：生成或打开页面工程

```
repochan starter pull --starter constructivist --output-dir .repochan/web-starter
```

如果 `.repochan/web-starter/` 已存在，不要覆盖；直接读取它的 README、`src/i18n/*.json`、`src/config/*.ts` 和组件结构。

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

**核心原则：派生产物写入 `.repochan/web-starter/public/`，绝不回灌 `.repochan/`。**

##### 后处理策略：读 starter.json 的 postprocess 数组

**不需要自己判断"该跑哪个 op"**——后处理策略由 starter.json 的 `assets[].postprocess` 声明。每个 asset slot 可能有一个 `postprocess` 数组，每条声明一个 image-edit 操作：

```json
// starter.json 示例
{
  "slot": "hero-composite",
  "postprocess": [
    {"op": "compress", "args": {"format": "webp", "quality": 82, "maxWidth": 2560}, "out": "public/assets/hero-composite.webp"}
  ]
}
{
  "slot": "chibi-grid",
  "postprocess": [
    {"op": "slice", "args": {"rows": 3, "cols": 3}, "out": "public/assets/chibi/"}
  ]
}
{
  "slot": "favicon",
  "postprocess": [
    {"op": "resize", "args": {"sizes": [16,32,48,180,192,512]}, "out": "public/assets/favicon/"},
    {"op": "favicon", "args": {"sizes": [16,32,48,180,256]}, "out": "public/favicon.ico"}
  ]
}
```

**执行规则**：
1. 画师交付图后（`order get-result` 拿到路径），读对应 asset slot 的 `postprocess` 数组
2. 逐条执行：`repochan image edit <op> <交付图路径> --out .repochan/web-starter/<out> <args 转 CLI flags> --overwrite`
3. `args` 的 key 直接映射到 CLI flag（`maxWidth` → `--max-width`，`sizes` 数组 → 逗号分隔）
4. asset 没有 `postprocess` 字段时，直接把交付图复制到 `public/` 对应位置（纹理、小图通常如此）
5. **不要把原始大 PNG 放进 `public/`**——PNG 留在 `.repochan/orders/` 存档，`public/` 里只放后处理产物

##### op 参考手册

| op | 关键 args | 说明 |
|---|---|---|
| `compress` | `format`, `quality`, `maxWidth` | 压缩为 WebP/JPEG/AVIF。大展示图必跑。 |
| `slice` | `rows`, `cols`, `padding` | 网格裁切。chibi/icon/pattern 网格用。 |
| `extract-stickers` | `rows`, `cols`, `model` | ISNet 抠图+裁切，产出透明贴纸 PNG。首次运行下载 ~40MB 模型。 |
| `chroma-key` | `matte`, `threshold`, `softness`, `spill` | matte 底角色抠图。`matte: "auto"` 自动估计底色。 |
| `bg-remove` | `model` | ISNet 通用抠图。非 matte 底的兜底方案。 |
| `resize` | `sizes`, `fit` | 多尺寸 PNG 输出。favicon/app-icon 管线用。 |
| `favicon` | `sizes` | 生成多分辨率 .ico 文件。 |
| `gif-from-frames` | `fps`, `loop` | 帧序列合成 GIF（少见）。 |

##### 文件命名与 manifest

- 用语义化文件名（`foundation.webp`、`banner.webp`、`poster.webp`），而非 order/version 路径——模板内部通过 `src/config/assets.ts` 的 key 映射到文件。
- 纹理按用途落到 `.repochan/web-starter/public/textures/`，文件名必须与 `src/config/site.ts` 的 `textures[].src` 匹配。
- 后处理完成后更新 `src/config/assets.ts`。未交付的视觉原型保留为 `status: "pending"`，不要伪造图片结果。

#### 步骤 10：验证

在 `.repochan/web-starter/` 内运行：

```
pnpm install
pnpm build
```

检查中英页面、移动端布局、图片 fallback、以及真实图片路径。
