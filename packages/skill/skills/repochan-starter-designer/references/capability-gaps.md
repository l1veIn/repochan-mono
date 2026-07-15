# 当前能力与产品缺口

## 已存在，可直接使用

- `official/section-design`：生成完整 section 视觉母版。
- `official/hero-pose-lineart-extract`：提取去身份姿态/构图参考。
- `official/hero-character-migrate`：foundation 驱动的 L1+L2 Hero composite。
- `official/character-cutout` + chroma-key/bg-remove：独立 L2。
- `starter create-order` / `asset-apply` / `validate`：实例资产迁移和确定性后处理。
- Starter v1 集中 site/assets/i18n 配置与颜色边界。

## 尚不存在，不要在 skill 中假装可调用

### `starter clone`

机械复制 minimal、清理构建产物、更新 id/name/default。应进入 CLI。

### Section composition schema

Core 尚不能表达 sections、baked/live layers、canonical viewport、safe zones、responsive variant、design provenance、shared L1 pattern 和 transition contract。应先通过真实 starter 验证字段，再进入 v1.1。

### Authoring order materialization

现有 `starter create-order` 面向 pull 后实例 slot。Source starter 设计阶段仍需 generic `order create`。等 composition schema 稳定后，再增加 authoring 原子命令。

该原子命令还应统一执行状态生命周期：materialize approved order → resolve references → generation 开始前进入 `in_progress` → result QA 后 delivered，避免不同代理遗漏机械状态传递。

### 可复现 render / visual diff

缺少固定 viewport 截图、设计稿叠加和像素/感知 diff。先用浏览器工具验证；稳定后评估 CLI 是否应引入 headless rendering。

### 更强的提取质量检查

缺少 alpha 边缘、spill、透明材质和 safe-zone 对比度的确定性报告。可在 image-edit 中逐步补齐，不由 Painter 手工修协议文件。

### Pattern seam 与动效检查

`official/pattern-tile` 能生成四方连续候选，但缺少确定性的 3×3 seam/hotspot 检查板、重复度报告和 reduced-motion validation。稳定后应由 image-edit/CLI 生成检查证据，不把人工拼图留给 Agent。

### Section coverage validation

Starter v1 validator 不知道非 Hero sections 是否有 design reference 或 HTML-first decision，也无法检查整页母稿被错误冒充为所有 section 的设计依据。Composition schema 稳定后，`starter validate` 应要求 coverage、shared L1 来源和相邻 transition contract 完整。

### 研究运行与对照报告

多代理视觉研究目前依靠独立 generic orders 和主代理人工汇总。待输入输出稳定后，可增加只做机械聚合的 CLI 报告：列出候选 order/version、固定参考、prompt hash、尺寸、状态和产物路径。方向分配、视觉比较与 Gate 结论仍保留在 skill 和人类判断中。

## 收敛原则

只有重复出现、输入输出明确、无需审美判断的步骤才进入 CLI/Core。视觉方向、bake-mask 判断、母版选择和最终节奏保留在 skill + human gates。
