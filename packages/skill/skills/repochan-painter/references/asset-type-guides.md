# 按资产类型的特殊引导

### 海报资产特殊引导（assetType=poster）

海报是**艺术释放型资产**——和设定集（信息载体）完全不同。海报的目标是一张有视觉冲击力的角色主视觉，不是展示角色信息。

**海报必须**：
- **让所选模板的设计运动主导**：构成主义、故障艺术、Risograph 波普或孟菲斯的构图语言是海报骨架。读取 persona.artStyle 后，只把与模板兼容的材质、线条和渲染特征融入对应 slot，不要用通用“角色插画风”覆盖已选设计方向。
- **构图自由**：动态姿势、戏剧性角度、环境叙事都鼓励。不受"全身立绘"约束——可以是特写、半身、俯仰角。
- **背景要有氛围**：不是白底，是与模板风格 + 项目气质匹配的设计场域。
- **不含设定集元素**：绝不出现 chibi、表情网格、配色卡、callout 标签。
- **引用 foundation 保证角色一致**：仍先用 `repochan order resolve-references <orderId> --json` 确认 foundation 可解析；把 resolve 出的 foundation 图路径通过 `--reference <path>` 传给 `repochan image gen`，由参考图锚定角色身份，平面设计语言由所选模板决定，不受 foundation 的画风束缚。
- **只借身份、不借设定集版式**：prompt 须写明 *single poster composition only*；**禁止**把 foundation 里的 chibi 网格、表情九宫格、配色卡、callout 标签搬进海报（常见失败：海报里塞满表情包）。

### 品牌纹理 / pattern 特殊引导（assetType=visual_pattern）

Pattern 是**直接消费型资产**。每个 `official/pattern-tile` order 只交付一张 full-bleed 的 1×1 canonical tile；不得生成四格合集、标题板、样张边框或 gutter。你（Painter）负责候选图符合模板，页面侧负责复用与确定性 QA；不要自己跑 image-edit。

**必须**：
- **单张出血到边界**：整幅就是 tile，没有画框、留白或分区。
- **四方连续**：左右与上下均 seamless tileable，无透视、无场景插画。
- **无角色主视觉**：抽象 motif / 几何 / 品牌符号为主。
- **无文字与数字**：语义文本只能抽象为非语义几何节奏。
- 模板 constraints 不削弱。

### 贴纸表特殊引导（assetType=chibi_emojis / sticker_sheet / web_state_stickers）

贴纸表是**网格生产资产**。它既可承载表情，也可为网页批量生产 404、empty、loading、success、CTA cameo 等语义状态。切分质量取决于严格网格、uniform matte、间距和轮廓；你（Painter）只负责原图，不自己切格，也不承诺当前 CLI 已能自动投影多 slot。

**分工边界**：切分、QA、具名投影归 page-designer 的 `repochan starter asset-apply`；Painter **不**对 order 产物运行 `image edit extract*` 作为交付预检，也不把派生 alpha/切片写回 order——交付物始终是原图。asset-apply 的 QA 失败会按缺陷码回流重生请求，改法速查见 [extract-qa-retry.md](extract-qa-retry.md)。

**贴纸表必须**：
- **精简每个 cell 的内容**：每个表情 cell 只保留角色头像/半身 + 表情 + 简单配色。**不要**在 cell 内注入背景配饰、文字标签、复杂场景、额外道具。`{{key_motifs}}` 和 `{{color_palette}}` 只用于角色本身的配色呼应，不要变成 cell 内的装饰物。
- **保证 uniform matte**：严格使用模板/订单指定的单一抠图底色，整张一致、平面、无渐变、纹理、投影或环境光污染；未指定时遵守模板默认，不擅自换色。
- **matte 与主体色相分离**：matte 必须是非白纯色，且远离角色任何部位的颜色。按主体色相选 matte：粉/紫主体 → 绿 matte；绿主体 → 洋红 matte；深红主体 → 绿 matte。
- **保证充足间距**：贴纸之间必须有大量 matte 留白，贴纸不得触碰 cell 边缘或彼此。间距太小会导致切分时贴纸被截断或粘连。
- **cell 内安全边距约 10%**：每个 cell 四边内缩约 10% 作为安全区，贴纸主体（含道具、特效、描边）不进入该边距带。
- **grid 订单使用 layout-guide reference**：先用 `repochan image edit layout-guide --rows R --cols C --out <guide.png>` 生成确定性构图参考，再把它与 foundation 一起作为 `repochan image gen --reference` 传入（多 reference 各传一次 flag）。guide 只约束构图——**不要**把 guide 的框线、安全区线、十字线或 cell 编号画进成图。
- **保持正方形比例**：整体图像必须是 1:1 正方形，否则切分后 cell 比例变形。
- **保持 cell 一致**：3×3/4×4 网格的行列、镜头、角色尺度与安全边距严格一致；每格只表达订单约定的一种状态。
- **控制 alpha 风险**：避免与 matte 接近的角色颜色、大面积半透明、辉光、毛发溢色和跨 cell 元素；高风险状态改用独立 production order。
- **constraints 是硬约束**：模板的 constraints（间距、uniform matte、无边框等）不可削弱或省略。

### 图标矩阵特殊引导（assetType=icon）

**必须**：
- 每个 cell 是完整 app icon，**主体不得溢出 cell 边界**（留安全边距）。
- 严格 3×3 光谱（角色强→弱），勿与贴纸表混淆。

### README 横幅特殊引导（assetType=readme_banner）

横幅是**品牌展示型资产**——必须包含仓库名文字，作为 GitHub README 首屏的视觉锚点。

**横幅必须**：
- **仓库名文字必须在图像内渲染**：不要留空白让后期 CSS 叠加文字。prompt 中的 `render the repository name` 指令要求图像模型直接渲染出可读的仓库名文字。如果模型第一次没渲染出文字，重试时加强文字指令。
- **文字要大且清晰**：仓库名应作为画面的显眼标题元素，字号大、字体设计感强、与画面融合但不被遮挡。
- **不是贴纸表**：不要塞 chibi 表情九宫格；单幅横构图 + 角色 + 标题。

### 设定集封面特殊引导（assetType=foundation_sheet）

设定集是**信息载体型资产**——包含角色立绘、Q版、表情、配色卡、关键元素和图标，各区块需要文字标签。

**设定集封面必须**：
- **渲染文字标签**：角色名、配色卡的颜色名、关键元素的名称都应以可读文字渲染在图中。不要生成无文字的纯图——设定集的信息标注是正向价值。
- **构图均衡**：各区块（全身立绘、Q版、表情、配色卡、关键元素、图标）的视觉权重应大致均衡。不要让单一元素（如全身立绘或某个 callout）占据过大画面。如果某个 keyMotif 是视觉密集型元素（如"调用图""数据流"），在 prompt 里限制其尺寸为小型 callout，不占主视觉。
- **规避手写文字**：如果 persona 的 `signaturePose` 或 `signatureAction` 涉及写字、阅读、手持书本等动作，在 prompt 里改为不展示文字内容的替代姿态（如"holding a closed book/sketchbook"）。AI 图像模型渲染手写文字不稳定，容易写出反向或乱码文字，破坏画面。
