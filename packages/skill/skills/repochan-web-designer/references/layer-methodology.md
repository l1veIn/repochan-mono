# Bake-mask 分层方法论

## 核心模型

完整设计稿包含四个逻辑层：

| 层 | 内容 | 默认策略 |
|---|---|---|
| L1 | 背景、空间、纹理、氛围 | CSS/live 或与 L2 合成 |
| L2 | 角色、插画、项目视觉资产 | 合成或透明独立资产 |
| L3 | 标题、正文、艺术文字 | 默认 HTML；强耦合时可烘焙 |
| L4 | 按钮、卡片、导航、交互 UI | 必须 HTML/live |

用 `bakedLayers` 表示生产图片包含哪些层，用 `liveLayers` 表示网页重建哪些层。不要把策略名称当成固定模板；每个 section 单独决定 bake mask。

L1 可进一步区分基础色面 L1a、共享 seamless pattern L1b、section 局部氛围/转场 L1c。它们可以分别由 CSS、共享 tile、mask/SVG/atmosphere asset 实现，不必合并成一张固定背景图。

## 决策顺序

1. L4 是否交互？是则保持 live。
2. L3 是否需要 i18n、SEO、频繁修改？是则优先 live。
3. L3 是否与角色发生遮挡、穿插、极端透视或字形互动？是则考虑烘焙。
4. L2 是否有干净 gutter、硬边、matte 或可控轮廓？是则可独立提取。
5. L2 是否包含头发、透明衣料、辉光、粒子或环境反射？是则优先与 L1 合成。
6. 角色是否需要独立视差/跨 section 运动？是则提高独立 L2 的优先级，并接受提取成本。
7. 移动端能否通过裁切和重排成立？不能则生成独立 responsive variant。

## 母版与生产资产的职责边界

视觉母版负责验证构图、节奏、层级和 section 关系，不负责同时提供可直接上线的位图。即使 prompt 要求角色轮廓可提取，也必须根据实际像素判断：

- 头发丝、半透明衣料、辉光、粒子和环境反射与背景耦合时，母版不可直接作为独立 L2 来源。
- 需要独立 L2 时，另建 uniform-matte production order，再通过 CLI 执行 chroma-key/bg-remove 和 alpha QA。优先使用离线、确定性的 chroma-key；`bg-remove` 需要可选 ML runtime。直接调用时若收到 `MissingImageMlCapabilityError` / `REPOCHAN_IMAGE_ML_MISSING`，只执行一次 `repochan image edit ml install`，成功后原样重试；安装失败就停止报告，不要循环。网络下载只发生在显式 install；运行时从 capability cache 读取本地 runtime 和模型。
- alpha QA 失败时，优先生成无文字、无 UI 的 L1+L2 composite，而不是反复修补母版截图。
- 角色跨 section 的视觉动势不要求角色像素真的跨界；可让 Git DAG、能量轨迹、几何边界或 CSS/SVG seam 承担连接，从而降低耦合。

## 四个现有案例

### 001：`baked=[L1,L2]`, `live=[L3,L4]`

角色与背景融合，左侧有规则内容区。文字、导航、按钮、stats 都能用 HTML 精确复刻。这是生产级默认模式。

### 002：`baked=[L1,L2,L3]`, `live=[L4]`

超大文字是空间结构，角色坐在字形之间，透视和遮挡不可分。只在左下角保留 CTA live。此模式必须确认 locale 与可访问性成本。

### 003：`baked=[]` 或仅装饰 L1，`live=[L1,L2,L3,L4]`

角色周围有白色 gutter，轮廓接近天然 matte，可用 chroma-key 提取 L2。背景几何、文字和 UI 可以分别用 CSS/HTML 重建，动效自由度最高。

### 004：从完整稿转为 `baked=[L1,L2]`, `live=[L3,L4]`

先用完整设计稿锁定自然构图，再提取去身份姿态线稿，结合目标 foundation 重绘无文字/UI 的 L1+L2 composite。minimal 的 Hero 是这一工艺的首个完成样本。

## 留白即接口

Safe zone 不是“空白矩形”，而是 image layer 与 live layer 的接口。它应记录 normalized 坐标，并满足：

- 不包含面部、手、主要轮廓或高频装饰。
- 背景仍有连续氛围、微纹理或辉光，不是一块死色。
- 文字对比度在目标 palette 下可成立。
- 内容增长约 30% 时仍不碰撞 baked layer。
- 窄屏有明确的移动、隐藏、裁切或替代方案。

## 不可违反的边界

- 不把可点击 UI 烘焙进图片。
- 不因视觉稿存在文字就默认烘焙 L3。
- 不用其他项目的角色成图直接作为当前项目的 identity reference。
- 不把视觉母版中的角色直接抠出并宣称为生产级透明 L2。
- 不把一张桌面设计稿等比缩放成移动端。
- 不以“像素一致”为理由牺牲语义、键盘、i18n 或可读性。
