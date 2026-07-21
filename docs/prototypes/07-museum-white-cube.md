# 07 · Museum White Cube（美术馆白盒子 · 资产展览）

| 字段 | 值 |
|------|-----|
| **style ID** | `museum-white-cube` |
| **类型** | 展览型官网 / 作品集式产品站 |
| **优先级** | **P0** |
| **情绪轴** | 静 · 贵 · 策展 · 证据 · 可信 |
| **建议目录名** | `landing-museum` |

---

## 1. 定位

极简白墙 + 聚光灯，**把 foundation / sticker / poster / webstate 当艺术品挂墙**。  
Dogfood 的真实订单 ID 当展签。开幕肖像只出现一次角色，其余是作品。

最强叙事点：**「本馆展品均为流水线真实交付物。」**

### 与已有方向的差异

| 对比 | 已有 | 本方案 |
|------|------|--------|
| 全部 4 套 | 高信息密度或强动效 | **大面积负空间、克制动效** |
| Zine | 嘈杂拼贴 | 单件陈列 |
| Game Page | 角色即界面 | 角色只是开幕 |

---

## 2. 视觉系统

### 色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--wall` | `#F7F7F5` | 墙 |
| `--floor` | `#EDEDE8` | 地（可选渐变暗示） |
| `--ink` | `#1A1A1A` | 字 |
| `--muted` | `#6B6B6B` | 展签次级 |
| `--frame` | `#1A1A1A` 或细灰 | 画框 |
| `--spot` | soft radial shadow | 作品下光晕 |
| `--accent` | 极少，`#38BDF8` 仅链接 | |

### 字体

- **展签**：小尺寸；衬线（Newsreader / Noto Serif SC）标题 + 无衬线元数据
- **序厅大标题**：可衬线大字，字距开阔
- **禁止**：Anton 摇滚大字、终端等宽铺满（可在作品元数据用 mono 写 order id）

### 布局法则

- 每件作品：图 + 下方/侧方标签（题名、材料、年份、order id）
- 节奏：单件全幅 → 双联 → 九宫格墙 → 再次单件
- 大量留白；桌面边距 ≥ 80px
- 灯光：作品下方椭圆阴影 + 顶部暗角可选

---

## 3. 信息架构

1. **Lobby / 序厅** — Manifesto 一段 + 开幕肖像（角色）+ 「展览说明」
2. **Gallery A · Foundation** — 设定集主展品
3. **Gallery B · Character Studies** — cutout / three-view / expressions
4. **Gallery C · Editions** — stickers、webstates 装裱墙
5. **Gallery D · Posters & Patterns** — 平面作品
6. **Studio Notes** — 流水线如何生产（短文 + 示意图，仍克制）
7. **Museum Shop / CTA** — 「带走 starter / 安装 CLI」像商店卡
8. **Colophon** — 字体、生成管线致谢、locale

---

## 4. 动效与交互

- **签名**：极轻 Ken Burns 或入场 fade；lightbox 看大图
- **禁止**：弹跳、glitch、跑马灯、拖拽贴纸墙
- 键盘左右切换展品（加分）
- **reduced-motion**：默认态

---

## 5. 资产与 slot

| Slot | 必要性 | 说明 |
|------|--------|------|
| `opening-portrait` | 必须 | 高质量角色肖像/cutout |
| `exhibit-foundation` | 必须 | foundation sheet |
| `exhibit-cutout` | 必须 | |
| `exhibit-stickers` | 必须 | 可 grid |
| `exhibit-webstates` | 建议 | |
| `exhibit-poster` | 必须 | |
| `exhibit-pattern` | 可选 | |
| `icon` | 必须 | 极简章 |

**全部优先用 dogfood 真图**；展签字段从 order meta 抄：id、template、尺寸、日期。

---

## 6. 文案语气

- 策展体：`作品 03 — 设定集。材料：foundation sheet / 生成管线。藏品号：ord-foundation-001。`
- 序厅一句价值：`一个仓库进入，一组可展出的品牌资产离开。`
- **禁忌**：感叹号狂欢、meme、系统报错玩笑（留给 Glitch）

---

## 7. 风险与验收

| 风险 | 缓解 |
|------|------|
| 太素像空白模板 | 展签信息密度与真图质量撑起权威感 |
| 转化弱 | Shop 区命令与 CTA 足够大，但不破坏展厅调性 |

**验收：**

- [ ] 用户相信「图是真产物」  
- [ ] 与 Zine/Frutiger 并排时最「静」  
- [ ] 展签含至少 3 个真实 order id  

---

## 8. 下一步

1. 列出 dogfood 展品清单与展签文案  
2. 序厅 + 一间 Gallery 的 HTML 白盒原型  
3. 摄影式排版评审（间距、框、光）  
