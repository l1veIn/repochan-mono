# Starter 产品化能力缺口

只把重复、确定性、无需审美判断的步骤下沉到 Core/CLI。艺术方向、section 母稿、bake-mask 和 Gate 结论属于 Web Designer；Starter Designer 负责把获批结果抽象成合同。

## Core schema / validation

- **Section composition（Round 1 已落地）**：manifest `capabilities.sections[]` 表达 section id、recipe、baked/live layers、canonical viewport、safe zone、responsive variant、asset slots、motion 与 design provenance 类型。
- **Transition contract（Round 1 已落地）**：manifest `capabilities.transitions[]` 按页面顺序表达每对相邻 section、motif、方向、normalized anchors、pattern phase 与移动端简化。
- **Coverage validation**：检查每个非平凡 section 均有 provenance 或 HTML-first decision，且整页母稿未冒充所有 section 来源。
- **Locale required paths**：对每个 supported locale 校验 required content paths。
- **Build/render evidence**：记录构建输入 hash、viewport、route、时间与产物，避免旧截图冒充当前实现。
- **Grid asset contract（已落地）**：一个 slot 通过 `publications[]`、独占 `extract-grid` 与 `assets.json.items` 表达 rows/columns、cell 语义、具名 PNG、逐项 QA 和原子状态更新。

这些规则稳定前先在 source starter manifest 中试验；不要在多个 skill 重复实现校验逻辑。

## CLI / image-edit 原子能力

- `starter clone`：复制 source starter、清理构建产物并更新 id/name/default。
- Authoring scaffold：从 Gate 2 输入建立产品化工作副本，不修改原项目。
- Local proof import（已落地）：`starter asset-import` 将已是最终格式的单文件 proof 原子投影到 scalar slot，并记录 SHA-256 provenance；bundle 不适用。
- Pattern QA（已落地）：`repochan image edit validate-seams` 生成 edge metrics 与可选 3×3 board；数值通过后仍需人工 hotspot/readability QA。
- Render/diff：固定 viewport 截图、设计参考叠加与感知 diff。
- Alpha QA：检查 spill、半透明材质、边缘覆盖与 safe-zone 对比度。
- Grid extract/apply（已落地）：`starter asset-apply` 按 manifest `publications[]` 切分 3×3/4×4 uniform-matte sheet，执行 chroma、alpha QA、trim/normalize，再投影具名 PNG；全部成功后才更新状态。当前不串联额外 compress，bundle 输出固定 PNG。

Page Designer 不得手工切图并编辑协议；旧 starter 没有 bundle 合同时使用 fallback，或由 Starter Designer 升级 source manifest。

## Starter Designer 仍负责的判断

- Gate 2 输入是否完整、是否适合产品化。
- 哪些关系是 starter 身份，哪些只是原项目内容。
- 参数自由度是否破坏获批构图。
- 哪些 slots 应 required、optional 或只保留 fallback。

## 不属于 Starter Designer

- 原创信息架构、视觉方向、section 母稿、生产订单与页面实现 → `repochan-web-designer`。
- 项目文案、配置投影、slot 订单与实例资产应用 → `repochan-page-designer`。
- 原图生成质量与 uniform-matte/grid 绘制纪律 → `repochan-painter`。
