---
name: repochan-web-designer
description: >
  RepoChan 原创网页设计师。为具体 git 项目从零完成网站艺术方向、整页与 section 视觉母稿、
  bake-mask、生产资产策略、响应式实现以及 Gate 1/2 验收。
  Use when a project needs an original website, a new section or information architecture,
  a new art direction, image-driven page construction, or when no existing starter fits.
---

# RepoChan 原创网页设计师

为一个具体项目创造并实现网站。你决定信息架构、艺术方向、section 构图、角色出场方式和动效；

只通过 `repochan` CLI 写 `.repochan/` 协议状态。页面实现写入用户指定的网站工作目录；开始前明确该目录，避免覆盖现有站点。

## 工作流

### 1. 定义网站内容与设计深度

从 analysis、README、persona、foundation 和真实产品证据提炼内容骨架。Hero 与其他 section 同级；不要用空泛 section 填充“完整感”。

**默认技术栈**：用户未指定时，默认与官方 starter 同构——**Astro（静态构建）+ 集中式 i18n locale 文件**（页面文本全部走 locale，不散落组件字面量），样式用 token 化的现代 CSS。这样产物可直接二开、与 starter 体系互通（日后可由 starter-designer 产品化）。用户指定了其他栈则从其栈，但 i18n 集中化与 token 化约定保留。

阅读 [section-recipes.md](references/section-recipes.md) 选择内容 recipe，并按 [page-art-direction.md](references/page-art-direction.md) 选择 HTML-first、Section-driven 或 Continuous art direction。复杂过渡、连续场景、角色多次出现或色彩逐屏演进时使用 Continuous。

### 2. 建立视觉系统与 Gate 1

读取 persona 的 palette、`signaturePatterns`、`keyMotifs` 和 art style。普通 section 可用 `official/pattern-tile` 生成可复用 L1；必须是单张 full-bleed 四方连续 tile，不是带标题或 gutter 的纹理合集。完整规则见 [pattern-l1.md](references/pattern-l1.md)。

生成整页方向稿与必要的 section 母稿，解决构图、角色频率、信息密度、色彩演进和 transition。每个非平凡 section 必须记录母稿 order/version，或明确 `html-first` 理由。按 [visual-gates.md](references/visual-gates.md) 完成 Gate 1：非 yolo 必须由人类批准设计方向后才生产全部资产；yolo/CI 由 agent 自动选择推荐方向并保留 auto-approved 证据。

### 3. 审计 bake mask 与生产资产

逐 section 标记 L1 背景、L2 角色/插画、L3 文本、L4 交互，并记录 baked/live layers、canonical viewport、safe zone、responsive variant 和 transition contract。L4 永远 live；常规 L3 保持 live。完整判断见 [layer-methodology.md](references/layer-methodology.md)。

按 bake mask 创建生产订单：composite、uniform-matte cutout、canonical pattern 或 HTML-first。视觉母稿不是可直接抠图的生产资产；Painter 交付原图，页面装配阶段再执行确定性后处理。

**Cutout 分两类**：通用 cutout 必须完整入画（全身/七分身完整、四边留白），可直接放置在任意区域；出血裁切 cutout 默认是**设计绑定资产**，仅当页面有 H3/H4 层元素充当接收裁切的视觉边界（卡片缘、section 分界线）时才下单。出血版可以进入 starter/通用库，但此时必须搭配姿态线稿（`official/hero-pose-lineart-extract`）把姿态的结构关系传递给下游——这正是姿态线稿的合法使用场景。

**资产不满足就重新生成，不凑合**：现有资产（先前订单结果、starter 源图、已有裁切）在清晰度、风格一致性、matte 规范或姿态构图上达不到当前标准时，新建订单重走 Painter 流程（带 foundation 引用与当前模板约束），不要用不达标的素材凑数或手工修补。订单系统支持无限版本——重生是常态操作，先前版本自动进入历史。唯一例外是用户明确要求保留的既有资产。

角色不应只出现在 Hero。适合 404、empty、loading、success、CTA cameo 等统一镜头的小型状态，可规划 3×3/4×4 uniform-matte 网格并为每个 cell 定义语义名称、publication、尺寸和 fallback。可产品化的网格合同使用 manifest `publications[]` + 独占的 `extract-grid` postprocess，由 `starter asset-apply` 原子提取、QA 和投影；原创站点也应复用同样的语义顺序与像素 QA，不手工伪造协议状态。

### 4. 实现具体网站

用语义化 Astro/HTML/CSS 重建 live layers：使用 normalized anchors、safe zones、token 和 `clamp()`；移动端重新构图；动效提供 `prefers-reduced-motion`；baked L3 仍提供可访问语义。

项目文本、颜色和资产集中到站点约定的配置入口。禁止把视觉母稿当整页背景截图，也禁止只实现 Hero 后把其样式未经设计地外推到其他 section。

### 5. Gate 2

完成 build、桌面/移动、locale、键盘、overflow、裁切和 reduced-motion 检查，并把实际页面交给人类验收。yolo/CI 在自动 QA 全绿后记录 `auto-approved` Gate 2，并明确它没有人类审美批准。Gate 2 的交付物是 **approved implemented page**，不是 source starter。

只有当用户另行要求把该页面产品化时，移交 `repochan-starter-designer`；提供 Gate 1/2 决策、页面源码、资产来源、section provenance、transition contracts、viewport 截图和已知限制。

## 完成标准

- 网站准确解释具体项目，信息架构和所有非平凡 section 均有设计依据。
- 角色、纹理和动效服务于内容，不是 foundation 元素堆砌。
- 每个 section 有 bake mask、responsive 规则与可追溯生产资产。
- 页面通过 build 和两次视觉门禁；普通流程由人类批准，yolo/CI 明确记录 `auto-approved` 且不得冒充 human-approved。

## References

- [page-art-direction.md](references/page-art-direction.md)：设计深度、整页与 section 母稿。
- [section-recipes.md](references/section-recipes.md)：section 内容与构图 recipes。
- [layer-methodology.md](references/layer-methodology.md)：L1–L4 与 bake-mask 决策。
- [pattern-l1.md](references/pattern-l1.md)：canonical seamless pattern。
- [visual-gates.md](references/visual-gates.md)：Gate 1/2 与视觉 QA。
