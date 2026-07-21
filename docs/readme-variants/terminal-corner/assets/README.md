# terminal-corner skin assets

README 皮肤变体 `terminal-corner` 的视觉资产。全部入库、相对路径引用，不直链 2K/4K 原图。

| 文件 | 来源 | 导出方式 |
|------|------|----------|
| `hero-terminal.webp` (2400×1000, ~100KB) | 确定性手绘 SVG 终端（真实 repochan 命令序列，装饰性）+ 角标合成 | `node build-hero.mjs`（sharp：SVG 光栅化 + cutout 圆形裁切合成） |
| `corner-badge.webp` (192px, ~11KB) | cutout A `packages/starters/character-game-page/public/assets/hero-cutout.webp` 头部裁切 + 薄荷→粉渐变圆环 | 同上，`build-hero.mjs` 一并导出（正文显示 ≤96px） |
| `gallery-foundation.webp` (800px, ~103KB) | `.repochan/orders/ord-foundation-001/versions/v2026-07-19T13-53-01-958Z/generated-2026-07-19T13-48-41.png` | `repochan image edit compress --format webp --max-width 800` |
| `gallery-stickers.webp` (800px, ~81KB) | `packages/starters/landing-neobrutal-zine/public/assets/stickers/sticker-{0..8}.webp` | sharp 3×3 拼图合成（非生成），`#F7F7F5` matte |
| `gallery-poster.webp` (800px, ~86KB) | `.repochan/orders/ord-poster-001/versions/v2026-07-19T14-02-18-266Z/generated-2026-07-19T13-59-20.png` | `repochan image edit compress --format webp --max-width 800` |
| `gallery-landing-glitch-os.webp` (800px, ~27KB) | `packages/starters/landing-glitch-os/repochan/previews/desktop.webp` 顶部 4:3 裁切 | sharp 裁切 + webp q80 |
| `strip-{landing-glitch-os,caddy,redis,marktext}.webp` (640×360, ≤36KB) | 对应 `packages/starters/<id>/repochan/previews/desktop.webp` 顶部 16:9 裁切 | sharp 裁切 + webp q78 |
| `icon.png` (128px, ~14KB) | `.repochan/orders/ord-icon-001/derived/2026-07-21T01-23-08-674Z--icon/public/icon-192.png` | `repochan image edit compress --format png --max-width 128`（当前正文未引用，备用） |

无 AI 新生成图像（未走 image gen 订单）；合成类资产（SVG 光栅化、裁切、拼图）均为确定性 sharp 操作，脚本即 `build-hero.mjs`。
