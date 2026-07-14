# Web Template 灵感研究

> 状态：RESEARCH（灵感收集，非实施计划）
> 背景：狗粮站第一版（构成主义）已落地，但资产运用仍处初级阶段——图片当卡片展示、纹理只做半透明叠加。需要从社区和获奖站找灵感，建立**网页模板体系**（类似已有的海报模板体系：constructivist / memphis / glitch / risograph）。

---

## 一、当前差距诊断

### 现状（初级资产运用）
| 资产 | 当前用法 | 问题 |
|------|---------|------|
| foundation sheet | gallery 卡片展示 | 只是"看一眼角色" |
| poster | gallery 卡片展示 | 同上 |
| chibi 表情包 | 整张展示 | **应该拆开**，每个表情成为 feature 卡的主体 |
| icon grid | 整张展示 | **应该拆开**，单个 icon 做 favicon / navbar logo / section marker |
| 纹理 (4张) | 半透明叠加在背景 | 只是浮在表面的图层，不是视觉语言的一部分 |
| banner | hero 区一张大图 | 可以更深度融入布局（出血、拼接、视差） |

### 目标（深度融合）
| 资产 | 深度用法 |
|------|---------|
| 纹理 | 全局背景 + 每 section 独立背景 + 边框纹样 + 卡片底纹，纹理是视觉语言骨架 |
| chibi | 拆成单个表情 → feature 卡图标 / loading 动画 / 空状态插画 / 页面转场角色 |
| icon | 拆成单个 → favicon / navbar / section 编号 / 列表 bullet / footer 品牌 |
| 角色 (foundation/poster) | 出血大图 / section 间衔接 / 角落探出 / 视差滚动层 |
| 配色 | 不只是 bg/text，而是 section 间的节奏色块拼接 |

---

## 二、灵感来源分类

### A. 角色深度融合布局（"角色活在页面里"）

**Duolingo (Duo the owl)** — 行业标杆
- Duo 出现在**每个屏幕**：onboarding、课程完成、streak 提醒、空状态、push 通知
- 角色有多种情绪表情（开心/失望/鼓励/睡觉）→ 不同场景用不同表情
- 角色不只在"展示位"，而是**驱动交互**（Duo 推着你往前走）
- 来源：
  - [Apple Behind the Design: Duolingo](https://developer.apple.com/news/?id=jhkvppla)
  - [Why mascots like Duo are powerful UX](https://uxdesign.cc/why-mascots-like-duo-are-powerful-pieces-of-ux-e378f4da327f)
  - [Duolingo Brand Guidelines](https://design.duolingo.com/)
  - [Canny Creative Brand Breakdown](https://canny-creative.com/brand-breakdown/brand/duolingo/)

**Mailchimp (Freddie)** — 从吉祥物到视觉系统
- Freddie 不只是 logo——它的轮廓线条衍生出**整套插画系统的线条语言**
- 2018 rebrand 引入了与 Freddie 风格统一的粗糙手绘插画，铺满整个网站
- 品牌色 "Cavendish Yellow" 从角色延伸到全局背景/CTA/section 分隔
- 来源：
  - [Mailchimp — DIA Studio (rebrand agency)](https://dia.tv/project/mailchimp/)
  - [Mailchimp's new whimsical look — InVision](https://medium.com/inside-design/mailchimps-new-whimsical-look-180f7a0cb65c)
  - [Canny Creative Brand Breakdown](https://canny-creative.com/brand-breakdown/brand/mailchimp-a-brand-breakdown/)

**Toonie Alarm (Tubik Studio)** — mascot in UI interactions
- 角色直接嵌入 UI 控件：闹钟设定、时间显示、提醒弹窗
- 角色姿态随功能变化（睡觉=夜间模式、尖叫=闹钟响）
- 来源：[Case Study: Toonie Mascot Design for UI Interactions](https://tubikstudio.com/blog/case-study-toonie-alarm-mascot-design-for-ui-interactions/)

**关键模式提炼：**
1. **角色有情绪光谱** → 不同 section / 状态用不同表情
2. **角色线条衍生视觉系统** → 不只是贴图，角色的风格定义整站 UI
3. **角色驱动交互** → 不只展示，角色"做"事情（引导、反馈、等待）

---

### B. 纹理/图案作为结构层

**Neo-Brutalism / 构成主义**
- 硬边色块 + 粗黑线 + 重复几何图案 = 结构本身
- 图案不只是背景叠加——它是**色块之间的填充物**，让拼接有质感
- 来源：
  - [Awwwards Brutalism Collection](https://www.awwwards.com/awwwards/collections/brutalism/)
  - [Designlab: Brutalism Best Practices](https://designlab.com/blog/examples-brutalism-in-web-design)
  - [How to design in Neo-Brutalism style](https://medium.com/@sepidy/how-can-i-design-in-the-neo-brutalism-style-d85c458042de)

**Risograph / Zine 美学**
- 双色叠印、颗粒噪点、错位套准 → 每张图自带纹理质感
- 适合做 section 背景 + 卡片底纹，让整个页面有"印刷品"的触感
- 对应已有海报模板：`poster_risograph_pop`
- 来源：[Risograph printing quirks guide](https://splitarrowprints.com/learn/risograph-printing-quirks-an-intro-into-risograph-imperfections-and-their-causes/)

**Maximalism / Anti-Design**
- 浮动贴纸、密集图案背景、碰撞配色、打破网格
- 角色/贴纸在 section 之间"漂浮"，不被卡片框住
- 来源：
  - [Twenty75: Anti-Design 30 Examples](https://www.twenty75.com/projects/movement_050/)
  - [The Case for Maximalism — Paul Twa](https://paultwa.com/the-case-for-maximalism)
  - [Dribbble Maximalism Search](https://dribbble.com/search/maximalism)

**关键模式提炼：**
1. **纹理 = 色块的填充物**，不只是透明叠加——用 `mix-blend-mode: multiply` 让白底纹理成为色块的一部分
2. **每 section 一种纹理身份**——不是全局一种，而是 4 种纹理各有归属
3. **颗粒/噪点叠加**——全局加一层 SVG noise / CSS grain，让整个页面有"印刷质感"
4. **浮动元素**——贴纸/chibi 碎片不被卡片框住，在 section 之间自由漂浮

---

### C. 灵感画廊（持续浏览）

| 来源 | 类型 | 链接 |
|------|------|------|
| Awwwards Texture Collection | 获奖纹理站 | [awwwards.com/websites/texture/](https://www.awwwards.com/websites/texture/) |
| Awwwards Illustration Collection | 获奖插画站 | [awwwards.com/websites/illustration/](https://www.awwwards.com/websites/illustration/) |
| One Page Love Mascot Tag | 71 个吉祥物站 | [onepagelove.com/tag/mascot](https://onepagelove.com/tag/mascot) |
| SaaSPo Mascot Library | SaaS 吉祥物落地页 | [saaspo.com/assets/mascot](https://saaspo.com/assets/mascot) |
| Dribbble Sticker Landing Page | 贴纸风落地页 | [dribbble.com/search/sticker-landing-page](https://dribbble.com/search/sticker-landing-page) |
| GraphicMama 25 Illustration LPs | 插画驱动落地页 | [graphicmama.com/blog/landing-page-examples/](https://graphicmama.com/blog/landing-page-examples/) |
| Design4Users Mascot Guide | 吉祥物 UI 整合策略 | [design4users.com/how-to-use-mascots-in-design/](https://design4users.com/how-to-use-mascots-in-design/) |
| Subtle Patterns (Toptal) | 免费无缝纹理库 | [toptal.com/designers/subtlepatterns/](https://www.toptal.com/designers/subtlepatterns/) |

---

## 三、从灵感到模板：资产整合模式清单

> 这些是可复用的"资产整合模式"——每种模式可以出现在多个网页模板里。

### 模式 1：纹理作为全局背景骨架
- **做法**：body 背景 = 暗底 + 纹理 `mix-blend-mode: overlay` + 极低 opacity；section 之间用不同纹理切换"氛围"
- **当前差距**：现在只在 hero/cta 两个 section 叠了纹理，其他 section 是纯色
- **参考**：Awwwards Texture Collection 里的获奖站几乎都用全局纹理而非局部

### 模式 2：chibi 拆分为功能图标
- **做法**：chibi 3×3 表情包 → `repochan image edit slice --rows 3 --cols 3` → 9 个独立表情 PNG → 每个 feature 卡用一个表情做主体图标
- **当前差距**：chibi 整张展示在 gallery，没拆开
- **参考**：Duolingo 的 Duo 在每个 feature/状态用不同表情

### 模式 3：icon 拆分为 UI 元素
- **做法**：icon 3×3 grid → 拆分 → 单个 icon 做 favicon / navbar logo / section marker / 列表 bullet
- **当前差距**：icon grid 整张展示在 gallery

### 模式 4：角色"探出"布局边界
- **做法**：角色图(foundation/poster)不放在卡片框里，而是绝对定位在 section 边缘"探出"——打破矩形的规整感
- **参考**：Maximalism / One Page Love mascot 站里大量使用

### 模式 5：section 间角色衔接
- **做法**：角色在两个 section 的交界处出现——上半身在上方 section，下半身在下方，或者角色"站"在分割线上
- **参考**：Duolingo onboarding 的角色转场

### 模式 6：配色作为 section 节奏
- **做法**：不是全局一个底色，而是 section 间用 accent 色块交替(primary → accent1 → accent2 → primary)，形成视觉节奏
- **当前差距**：现在大部分 section 都是暗底，没有色彩节奏

### 模式 7：颗粒/噪点全局叠加
- **做法**：全局加一层固定定位的 SVG noise / CSS grain，opacity 0.03-0.05，让整个页面有印刷质感
- **参考**：Risograph 美学 / Awwwards texture 站

### 模式 8：浮动贴纸碎片
- **做法**：chibi 表情/icon 碎片不在卡片里，而是以绝对定位"漂浮"在 section 之间——滚动时有微视差
- **参考**：Anti-design / Maximalism / Dribbble sticker landing page

### 模式 9：纹理边框 / 分割线
- **做法**：不用纯色 border/line，而是用纹理 PNG 做 `border-image` 或 section 分隔条的背景
- **当前差距**：现在分割线是 `3px solid var(--c-base)`

### 模式 10：角色驱动交互（高级，需 JS）
- **做法**：角色表情随滚动位置/交互状态变化（hero 区角色打招呼 → 滚到 features 区角色变成思考表情 → CTA 区角色挥手）
- **参考**：Duolingo / Toonie Alarm
- **注**：这一步需要 JS，可作为模板增强

---

## 四、建议的网页模板体系

> 类比海报模板（constructivist / memphis / glitch / risograph），网页也应有多种风格模板。
> 第一个（构成主义）已落地。以下是候选体系。

### 已有
| 模板 | 风格 | 状态 |
|------|------|------|
| `constructivist` | 硬边色块 + 粗线 + 几何精确 | ✅ 第一版（当前 dogfood） |

### 候选（按灵感来源）
| 模板 | 风格关键词 | 灵感来源 | 特点 |
|------|-----------|---------|------|
| `risograph-zine` | 双色叠印 + 颗粒噪点 + 手绘 | Risograph / zine 美学 | 暖色有限色板、全局 grain 叠加、手绘线条 |
| `maximalist-sticker` | 浮动贴纸 + 密密图案 + 碰撞色 | Anti-design / maximalism | chibi 拆碎片漂浮、密集纹理背景、打破网格 |
| `botanical-soft` | 柔和植物 + 水彩纹理 + 大留白 | GraphicMama 插画落地页 | 纹理做柔和点缀、角色融入自然场景 |
| `cyberpunk-neon` | 霓虹线框 + 故障纹理 + 暗底 | Glitch art / cyberpunk | 纹理做扫描线/故障层、角色做全息投影感 |

### 每个模板应定义
1. **资产整合模式组合**（从上面的 10 个模式中选）
2. **纹理使用规则**（全局 vs 局部 / blend mode / opacity）
3. **角色使用规则**（整图 vs 拆分 / 静态 vs 浮动 / 交互态）
4. **配色节奏规则**（section 间色块交替方式）
5. **CSS 变量映射**（persona → 该模板的 design tokens）

---

## 五、下一步行动建议

1. **先深化当前构成主义模板**：把模式 1/2/3/6/9 应用到现有模板——纹理全局化、chibi/icon 拆分、section 配色节奏、纹理分割线。这是最低成本的提升。
2. **同步开发第二个模板**：选一个与构成主义反差大的风格（建议 `maximalist-sticker` 或 `risograph-zine`），验证模板体系的可复用性。
3. **建立模板 prompt 体系**：像海报模板一样，每个网页模板有一份 prompt skeleton，指导 page-designer agent 如何组装资产。
4. **chibi/icon 拆分纳入标准流程**：在 skill 里明确要求 page-designer 收到 chibi/icon grid 后必须先拆分，再决定怎么用。
