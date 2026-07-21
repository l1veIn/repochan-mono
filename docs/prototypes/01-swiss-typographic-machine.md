# 01 · Typographic Machine（瑞士国际主义 · 纯字体机）

| 字段 | 值 |
|------|-----|
| **style ID** | `swiss-typographic-machine` |
| **类型** | 字体主导的单页产品站（反角色中心） |
| **优先级** | P2 |
| **情绪轴** | 冷静 · 精确 · 工业文书 · 命令行尊严 |
| **建议目录名** | `landing-swiss-type` |

---

## 1. 定位

在角色资产极其丰富的品牌上，**故意把角色降为点缀**，把「命令 / 协议 / 产物名」做成主视觉。  
传达：RepoChan 首先是 **CLI + 协议工具**，其次才是二次元吉祥物。

### 与已有方向的差异

| 对比 | 已有 | 本方案 |
|------|------|--------|
| Game Page | 角色立绘 + HUD | 几乎无立绘，只有规格数字 |
| Frutiger | 玻璃、气泡、梦幻 | 平面、网格、无装饰光效 |
| Zine | 纸质拼贴、摇滚 | 印刷样张、测量线 |
| Scrolly | 暗夜叙事、终端剧场 | 亮/中性纸色、排印机器 |

---

## 2. 视觉系统

### 色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--ink` | `#0A0A0A` | 正文、主标题 |
| `--paper` | `#F4F1EA` 或纯白 `#FFFFFF` | 背景 |
| `--rule` | `#0A0A0A` 1px | 网格线、分隔 |
| `--accent` | `#38BDF8`（品牌 sky，单色） | 唯一强调：链接、编号、关键命令 |
| `--muted` | `#6B7280` | 次级标注 |

禁止渐变、玻璃、厚投影、纸纹颗粒（与 Zine 划清）。

### 字体

- **Display / 标题**：Neue Haas Grotesk / Helvetica Now / Inter Tight，字重 700–900，极大字号（`clamp(3rem, 12vw, 9rem)`）
- **中文标题**：思源黑体 / Noto Sans SC Black，紧字距
- **正文**：同上家族 Regular/Medium，严格基线网格（4/8px）
- **代码 / 命令**：JetBrains Mono 或 IBM Plex Mono

### 布局法则

- 12 栏瑞士网格；边距慷慨（桌面 ≥ 64px）
- 可见基线 / 栏线可选（设计态打开，生产可减弱）
- 图文比例：**字 ≥ 70%，图 ≤ 30%**
- 角色仅允许：小 icon、页脚小 dig 割、或「Fig. 01」式图注缩略图

### 材质

- 纯平色块；可选极淡纸色，无纹理叠加
- 编号系统：`01 / 02 / 03`，等宽 + accent

---

## 3. 信息架构

1. **Masthead** — 项目名 + 一行协议版本（`repochan · protocol v1`）
2. **Hero Type** — 全屏巨字标题 + 一行 install 命令（可复制）
3. **Thesis** — 三段极短定义（What / How / Output），左编号右正文
4. **Pipeline Spec** — 6 步流水线做成 **规格表**（步骤 | 输入 | 输出 | 命令），非卡片插画
5. **Artifact Index** — 产物清单：foundation / stickers / poster / landing … 像目录页
6. **Evidence** — 1–2 张真实 dogfood 图，严格加图注（`Fig. A — foundation sheet`）
7. **CTA** — 整行等宽命令 + 次要文档链接
8. **Colophon** — 字体名、网格说明、locale 切换（极小）

---

## 4. 动效与交互

- **签名**：变量字体随滚动变字重；字距/行距微动；横向字轨
- **避免**：视差大图、粒子、气泡、角色漂浮
- **交互**：命令一键复制；表格行 hover 仅改变字重或左边 accent bar
- **reduced-motion**：字重动画关闭，内容静态完整

---

## 5. 资产与 slot

| Slot | 必要性 | 说明 |
|------|--------|------|
| `icon` | 可选 | 仅 masthead 16–32px |
| `evidence-a` / `evidence-b` | 建议 | 真实 foundation / poster，带图注 |
| `character-cutout` | **不需要** 或极小 | 若出现必须 ≤ 120px 高 |

可直接引用现有 dogfood：`.repochan/foundation-preview.png`、orders 下 poster。  
模板契合：偏 `readme_banner` / 极简 icon，而非 scene poster。

---

## 6. 文案语气

- 短句、名词化、说明书腔  
- 示例标题：`把仓库变成可交付的品牌规格。` / `PROTOCOL → PERSONA → PAINT → PAGE`
- **禁忌**：口语卖萌、摇滚俚语、水下隐喻、游戏术语（HP/LV）

---

## 7. 风险与验收

| 风险 | 缓解 |
|------|------|
| 角色品牌识别弱 | 保留品牌色 accent + 页脚小 dig 割 + 真实资产图注 |
| 显得「又一个无字 SaaS」 | 坚持命令与协议词作为主视觉，不做通用 startup 模板 |

**验收（方向立住）：**

- [ ] 截屏 3 秒内能读出「这是工具/协议站」而非「角色站」  
- [ ] 与 Frutiger / Zine 并排时风格零混淆  
- [ ] 无 JS 时信息完整可读  
- [ ] 中英巨字排版均不溢出、不断词失控  

---

## 8. 下一步

1. 在 `web-design/prototypes/landing-swiss-type/` 做 1 屏 Hero + Pipeline Spec 表  
2. 用真实 install 命令与 6 步文案填表  
3. Gate 评审：是否值得作为「官方工具入口」身份站  
