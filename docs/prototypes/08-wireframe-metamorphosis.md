# 08 · Wireframe Metamorphosis（线框羽化 · 协议长出血肉）

| 字段 | 值 |
|------|-----|
| **style ID** | `wireframe-metamorphosis` |
| **类型** | 概念型滚动叙事（物质化过程，非影院章节） |
| **优先级** | **P0** |
| **情绪轴** | Meta · 工艺 · 从无到有 · 协议哲学 |
| **建议目录名** | `landing-wireframe-morph` |

---

## 1. 定位

Hero 全是 ASCII / 线框 / 灰模；越往下滚，**协议长出血肉**——颜色、角色、纹理、动效逐层注入。  
可视化产品哲学：**core 是纯协议，skill/agent 赋予灵魂，paint 赋予皮肤，page 赋予生命。**

### 与已有方向的差异

| 对比 | 已有 Scrollytelling | 本方案 |
|------|---------------------|--------|
| 场景 | 暗夜画室、霓虹、终端剧场 | 从线框到全彩的 **材质生长** |
| 结构 | 7 幕 pin + 角色旁白 | 连续光谱（wire → flat → render → live） |
| 情绪 | 故事与进度 | 方法论与生成论 |

两者都可滚动，但 **签名体验不同**：一个是「跟我听故事」，一个是「看世界被渲染出来」。

---

## 2. 视觉系统

### 色板（分段演化）

| 阶段 | 色 |
|------|-----|
| Wire | 黑白灰，`#0B0F19` 底 + `#E5E7EB` 线 |
| Schema | 加入 mono 绿/蓝标注（协议字段） |
| Flat | 品牌五色平涂登场 |
| Render | 全彩插画、光影 |
| Live | 完整 UI 组件态（按钮可点） |

### 字体

- **Wire 阶段**：等宽为主（JetBrains Mono），ASCII 装饰
- **Live 阶段**：切换到品牌正文字体
- 标题可从 `REPOCHAN` 空心线字 → 实心彩色字

### 布局法则

- 同一构图骨架贯穿全页（例如左侧文案安全区 + 右侧角色位），**只变完成度**
- 中段可显示「图层开关」：Protocol / Line / Color / Texture / Motion
- 避免换成完全不同的版式（那会变成普通多 section）

---

## 3. 信息架构

| 进度 | 视觉状态 | 文案焦点 |
|------|----------|----------|
| 0% | ASCII 标题 + 线框框 | schema / CLI |
| 15% | 灰模块、标注尺寸 | analysis 字段 |
| 30% | 角色线稿 | persona |
| 45% | 平涂上色 | foundation 色板 |
| 60% | 贴图/网点/材质 | stickers & patterns |
| 75% | 全渲染场景 | painter 交付 |
| 90% | UI 控件「点亮」 | page / starter |
| 100% | 完整品牌世界 + CTA | install |

可选：顶部细进度标为 `RENDER 0–100%`。

---

## 4. 动效与交互

- **签名**：滚动驱动的材质/透明度交叉；颜色通道逐个打开；线框 stroke-dashoffset
- **不是** 多场景 pin 跳切（可轻微 pin 但同一舞台）
- 图层开关可手动 toggle（加分，桌面）
- **reduced-motion**：提供「阶段快照」锚点按钮，静态展示 4 个完成度

---

## 5. 资产与 slot

| Slot | 必要性 | 说明 |
|------|--------|------|
| `lineart-character` | 必须 | 线稿/pose guide（可 `hero-pose-lineart-extract`） |
| `flat-character` | 建议 | 平涂版 |
| `final-cutout` / `final-scene` | 必须 | 全渲染终点 |
| `foundation` | 建议 | 上色阶段揭示 |
| `wire-ui-sprites` | 可选 | 线框按钮/卡片 SVG |
| `icon` | 必须 | 从线框 icon → 彩色 icon |

技术实现提示：同一 dig 割用 CSS `filter`/mask 模拟中段，减少多套生成；关键帧再上真资产。

---

## 6. 文案语气

- 精确、生成论：`先有协议，才有皮肤。` / `RENDERING PERSONA…`
- 可混少量 monologue，但避免 Scrolly 的「画室聊天」口吻重复
- **禁忌**：一上来就全彩英雄图（破坏 meta）

---

## 7. 风险与验收

| 风险 | 缓解 |
|------|------|
| 前半段太素流失用户 | ASCII 要好看；15% 内出现可辨认角色线稿 |
| 与 Scrolly 双线维护 | 明确本页讲「物质化」，Scrolly 讲「流水线故事」 |
| 性能 | 少放大图叠层；用 CSS 阶段切换 |

**验收：**

- [ ] 滚动前后截图对比，完成度差异剧大  
- [ ] 用户能复述「协议 → 皮肤」一句话  
- [ ] reduced-motion 仍可理解全过程  

---

## 8. 下一步

1. 固定「同一构图骨架」线框  
2. 准备线稿 + 终稿两张主资产做 crossfade 试验  
3. 与现 Scrolly 预览并排，确认不重复  
