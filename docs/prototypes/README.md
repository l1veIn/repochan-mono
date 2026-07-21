# RepoChan Design Prototypes（风格方向库）

> 设计探索文档，**不是**可运行站点。  
> 在现有 4 套 dogfood 站之外，扩展更多大胆的视觉与信息架构方向。  
> 落地顺序建议：本目录 brief → `web-design/prototypes/` HTML 原型 → Gate 1 → Astro 生产化 → starter 化。

## 已占位（勿重复）

| 现网 / 现 starter | 类型 | 风格槽 |
|-------------------|------|--------|
| `character-game-page` | 角色档案页 | 游戏 HUD · 暗色设定集 |
| `landing-frutiger-aero` | 产品落地页 | Frutiger Aero / Y2K 玻璃 |
| `landing-neobrutal-zine` | 杂志落地页 | Neo-brutal 摇滚 zine |
| `landing-scrollytelling` | 叙事落地页 | 暗夜终端 · 滚动剧场 |

相关但非本批目标的 starter：`sealed-scroll`（孔版卷轴）、`marktext`（Art Deco）、`caddy`（构成主义建筑）、`repochan-harbor`（编辑港口）。新方案需与它们拉开距离。

## 本批 10 个方向

| # | 文档 | 风格 ID | 类型一句话 | 优先级 |
|---|------|---------|------------|--------|
| 01 | [swiss-typographic-machine](./01-swiss-typographic-machine.md) | `swiss-typographic-machine` | 瑞士国际主义纯字体机 | P2 |
| 02 | [memphis-playground](./02-memphis-playground.md) | `memphis-playground` | 孟菲斯几何游乐场落地页 | P1 |
| 03 | [glitch-os-desktop](./03-glitch-os-desktop.md) | `glitch-os-desktop` | 故障艺术伪桌面 OS | P1 |
| 04 | [constructivist-propaganda](./04-constructivist-propaganda.md) | `constructivist-propaganda` | 构成主义海报墙 | P2 |
| 05 | [solarpunk-orchard](./05-solarpunk-orchard.md) | `solarpunk-orchard` | 太阳朋克品牌果园 | P1 |
| 06 | [isometric-toy-city](./06-isometric-toy-city.md) | `isometric-toy-city` | 等距玩具城管线沙盘 | **P0** |
| 07 | [museum-white-cube](./07-museum-white-cube.md) | `museum-white-cube` | 美术馆白盒子资产展 | **P0** |
| 08 | [wireframe-metamorphosis](./08-wireframe-metamorphosis.md) | `wireframe-metamorphosis` | 线框羽化 · 协议长出血肉 | **P0** |
| 09 | [anti-design-chaos](./09-anti-design-chaos.md) | `anti-design-chaos` | 反设计混乱布告板 | 实验 |
| 10 | [cinema-opening-credits](./10-cinema-opening-credits.md) | `cinema-opening-credits` | 电影片头演职员表 | 实验 |

## 风格罗盘

```text
                    冷静 / 系统
                         │
         Swiss Type ─────┼───── Museum Cube
                         │
   协议感 ── Wireframe ──┼── Glitch OS ── 数字感
                         │
         Constructivist ─┼───── Memphis
                         │
                    热情 / 表达

          自然 ← Solarpunk ｜ Toy City → 玩具/空间
                         │
              影院仪式 ← Cinema ｜ Anti-Design → 混乱
```

## 文档约定

每份 brief 包含：

1. **定位** — 类型、情绪、与已有 4 套的差异  
2. **视觉系统** — 色板、字体、材质、布局法则  
3. **信息架构** — section 清单与内容职责  
4. **动效与交互** — 签名交互；reduced-motion 要求  
5. **资产与 slot** — 建议 order / template；可复用 dogfood 资产  
6. **文案语气** — 标题范式与禁忌  
7. **风险与验收** — 何时算「这个方向立住了」

## 推荐落地顺序

1. **P0**：06 Toy City → 08 Wireframe → 07 Museum（架构差异最大）  
2. **P1**：03 Glitch OS → 02 Memphis → 05 Solarpunk  
3. **P2**：01 Swiss → 04 Constructivist（注意与 caddy 海报气质区分）  
4. **实验**：09 Anti-Design、10 Cinema（先 brief 评审，再决定是否做 HTML）

## 与管线的关系

- 这些文档 **不** 写入 `.repochan/`，也 **不** 替代 starter manifest。  
- HTML 原型仍建议落在 `web-design/prototypes/<id>/`（与现有 4 套一致）。  
- 正式 starter 化走 `repochan-starter-designer`，官方收录走 PR。
