# 03 · Glitch OS Desktop（故障艺术 · 桌面操作系统）

| 字段 | 值 |
|------|-----|
| **style ID** | `glitch-os-desktop` |
| **类型** | 伪桌面 / 窗口叠层落地页 |
| **优先级** | P1 |
| **情绪轴** | 黑客玩笑 · 数字废墟 · 好玩的「坏掉」 |
| **建议目录名** | `landing-glitch-os` |

---

## 1. 定位

页面 = 一台正在 **「把仓库渲染成人设」** 的故障电脑。  
窗口标题栏写真实订单 ID（`ord-foundation-001`），桌面图标对应流水线阶段。

### 与已有方向的差异

| 对比 | 已有 | 本方案 |
|------|------|--------|
| Scrollytelling | 优雅暗夜画室、glow rail、叙事剧场 | 坏掉的 OS UI、窗口堆叠、色差故障 |
| Game Page | 角色档案、干净 HUD | 多窗口重复裁切同一角色 |
| Zine | 纸、手作 | CRT、扫描线、压缩块 |

---

## 2. 视觉系统

### 色板

| Token | 色值 | 用途 |
|-------|------|------|
| `--crt-bg` | `#0B0F14` | 桌面底 |
| `--window` | `#121820` | 窗口面 |
| `--titlebar` | `#1C2430` | 标题栏 |
| `--acid` | `#39FF14` / `#00FF9C` | 成功/终端字 |
| `--hot` | `#FF2A6D` | 错误/强调 |
| `--cyan` | `#05D9E8` | 链接/选中 |
| `--scan` | `rgba(255,255,255,.04)` | 扫描线 |

RGB 色差作为 **瞬时** 效果，不要整页永久无法阅读。

### 字体

- **UI**：Tahoma / Segoe 仿物 或 `IBM Plex Sans`（复古桌面感）
- **终端**：`IBM Plex Mono` / `Share Tech Mono`
- **中文**：Noto Sans SC；窗口内正文保持可读，glitch 只作用于装饰层

### 布局法则

- 桌面层：壁纸（可 pattern 或暗网格）+ 图标网格
- 内容层：2–4 个可叠窗口（分析 / 人设 / 画师 / 部署）
- 任务栏：底部或顶部固定，显示「pipeline progress」
- 角色：在多个窗口内 **错位重复裁切**（同一 dig 割 offset）

### 材质

- 扫描线叠加、轻微噪点、JPEG 块感边（CSS 或 1 张纹理）
- 窗口有最小化/最大化装饰按钮（可不实现功能）
- 模板契合：`official/poster-glitch-art`

---

## 3. 信息架构

1. **Boot Splash**（可选，短）— `REPOCHAN OS v0.x — loading persona...`
2. **Desktop** — 图标：Analysis.app / Persona.app / Painter.app / Deploy.app / Trash
3. **Window: Analysis** — 伪终端输出（可滚动假 log）
4. **Window: Persona** — 人设字段表 + 小头像 glitch
5. **Window: Painter** — 资产缩略图网格（真实 sticker/webstate）
6. **Window: Foundation** — 大图 foundation + 「FILE OK」
7. **BSOD / Success Modal**（幽默）— 实为 CTA：`npm install -g repochan`
8. **Taskbar** — locale、时钟、复制命令按钮

移动端：窗口改为手风琴堆叠，禁止依赖拖拽才能读完。

---

## 4. 动效与交互

- **签名**：窗口打开缩放；偶发 RGB split；图标双击「打开」滚动到对应窗
- **可选装饰拖拽**：桌面可拖窗口（不挡阅读）
- **复制命令** 在任务栏与 Success Modal 双入口
- **reduced-motion**：无 glitch 闪烁；窗口静态排列

---

## 5. 资产与 slot

| Slot | 必要性 | 说明 |
|------|--------|------|
| `wallpaper-pattern` | 建议 | 暗色 pattern 或 glitch poster |
| `cutout` | 必须 | 多窗口裁切源 |
| `foundation` | 必须 | Foundation 窗口主图 |
| `sticker-bundle` | 必须 | Painter 窗口 |
| `webstate-bundle` | 可选 | 状态预览 |
| `icon` | 必须 | 桌面图标可简化 SVG + 一张角色 icon |
| `glitch-poster` | 建议 | `poster-glitch-art` |

Dogfood：把 `.repochan/orders/*/versions` 文件名写进窗口标题，增强真实感。

---

## 6. 文案语气

- 系统消息腔 + 玩笑：`FATAL: no mascot found — generating...` → `OK: 仓库酱 booted`
- 窗口标题用订单 ID / 文件路径
- **禁忌**：真的不可读；无障碍色对比必须过关（glitch 层 `aria-hidden`）

---

## 7. 风险与验收

| 风险 | 缓解 |
|------|------|
| 可读性崩坏 | 正文区永不 glitch；装饰层可关 |
| 与 Scrolly 混淆 | 无 pin 剧场、无 glow rail；隐喻是 OS 不是影院 |
| 拖拽依赖 | 核心路径纯滚动可读 |

**验收：**

- [ ] 3 秒内读出「这是桌面/OS 隐喻」  
- [ ] 关闭动画后内容完整  
- [ ] 至少一扇窗展示真实 dogfood 文件名  

---

## 8. 下一步

1. 线框：桌面 + 3 窗口叠层  
2. 用 cutout 做 RGB 错位 CSS 试验  
3. 一键复制命令放进假「安装向导」窗  
