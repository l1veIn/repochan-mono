# Section composition recipes

Recipes 是起点，不是固定 schema。每个 section 仍需 bake-mask 审计。

## Nav / Footer

- 默认：HTML-first，全部 live。
- Image gen 用途：只提供整页视觉母版。
- 禁止：把导航文字或链接烘焙成图。

## Hero

- 默认：`baked=[L1,L2]`, `live=[L3,L4]`。
- 资产：composition/pose reference + hero composite。
- 条件变体：艺术文字与角色强耦合时烘焙 L3；角色有干净 gutter 且需要动效时独立 L2。
- Safe zone：主要文案区、CTA 区、导航避让区。

## Capabilities / Features

- 默认：L1a CSS + 可复用 L1b pattern，多个独立 L2 chibi/icon，L3/L4 live。
- 资产：可切片表情、角色小姿态或卡片装饰，不使用整张“功能区截图”作为背景。
- 目标：每张卡片真实表达功能，不把角色人设当项目功能。

## Workflow / Architecture

- 默认：共享 L1b pattern 或局部 L1c 装饰，流程节点、连接线、标题和说明 live；连接线优先 SVG/CSS。
- L2：可用一个角色在流程起点/终点引导，不遮挡步骤文本。
- 禁止：把需要响应式重排的流程图整体烘焙。

## Proof / Gallery

- 默认：真实内容和项目资产 live；共享 pattern 可作为低对比 L1，只烘焙必要的背景氛围和边缘装饰。
- L4：筛选、lightbox、链接必须 live。
- 目标：展示可验证产物，不做无来源的装饰图库。

## Narrative band / Section transition

- 默认：独立 L2 cutout 跨越 section 边界，L1/L3/L4 live。
- 适用：角色探出、指向下一段、跨色块衔接。
- 风险：alpha 边缘和移动端遮挡；必须定义窄屏隐藏或替代位置。

## CTA

- 默认：`baked=[L1,L2]`, `live=[L3,L4]`。
- Safe zone：中央或单侧 headline/CTA 区。
- 目标：视觉强度可以高，但按钮、链接和法律信息保持 live。

## 页面节奏

- 连续两个 section 不要都使用全幅 L1+L2 大图。
- 在高图像密度 section 后安排 HTML-first 或低噪声 section。
- 角色不必每屏出现；出现时应承担引导、解释或转场职责。
- Palette 节奏来自 `site.json` token 的组合，不创建 section 私有颜色。
- 共享 pattern 是视觉词汇，不是每个 section 使用相同尺寸、透明度和相位的重复壁纸。
- 每个非平凡 section 都需要独立 design reference 或 HTML-first 决策；不得只从 Hero 外推。
