# Phase 2：组装 Astro 页面工程

#### 步骤 6：生成或打开页面工程

```
repochan page generate-project --output-dir repochan-page
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

#### 步骤 9：填充资产 manifest

把已交付图片复制到 `repochan-page/public/assets/`，**并压缩为 WebP**：

```bash
# 每张图复制后立即压缩（有损 q82 + 限制最大宽度）
repochan image edit compress <source.png> \
  --out repochan-page/public/assets/<name>.webp \
  --format webp --quality 82 --max-width 2560 --overwrite
```

**压缩规则：**
- 全屏背景图（hero/section 底图）：`--max-width 2560 --quality 82`
- 展示图（gallery/poster/foundation）：`--max-width 1920 --quality 85`
- 表情/icon/小图（<500px）：不需要压缩，直接用 PNG
- 纹理（四方连续）：不需要压缩（已经很小），直接用 PNG

**不要把原始 PNG 放进 `public/`**——PNG 留在 `.repochan/orders/` 存档，`public/` 里只放压缩后的 WebP。部署时 `public/` 的所有内容都会上传，大 PNG 会白白浪费带宽。

推荐用语义化文件名（`foundation.webp`、`banner.webp`、`poster.webp`），而非 order/version 路径——模板内部通过 `src/config/assets.ts` 的 key 映射到文件。

纹理（`visual_pattern` order）每张是独立的 1×1 四方连续 PNG，按用途复制到 `repochan-page/public/textures/`（纹理不压缩）：

```
repochan-page/public/textures/hero-bg.png     # hero section 背景纹理
repochan-page/public/textures/divider.png      # 边框/分割线纹理
repochan-page/public/textures/sideband.png     # 侧边装饰纹理
repochan-page/public/textures/cta-bg.png       # CTA 底纹
```

文件名必须与 `src/config/site.ts` 的 `textures[].src` 匹配。

然后更新 `src/config/assets.ts`。未交付的视觉原型保留为 `status: "pending"`，不要伪造图片结果。

#### 步骤 10：验证

在 `repochan-page/` 内运行：

```
pnpm install
pnpm build
```

检查中英页面、移动端布局、图片 fallback、以及真实图片路径。
