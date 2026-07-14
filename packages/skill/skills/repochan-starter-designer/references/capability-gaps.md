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

Core 尚不能表达 sections、baked/live layers、canonical viewport、safe zones、responsive variant 和 design reference。应先通过真实 starter 验证字段，再进入 v1.1。

### Authoring order materialization

现有 `starter create-order` 面向 pull 后实例 slot。Source starter 设计阶段仍需 generic `order create`。等 composition schema 稳定后，再增加 authoring 原子命令。

### 可复现 render / visual diff

缺少固定 viewport 截图、设计稿叠加和像素/感知 diff。先用浏览器工具验证；稳定后评估 CLI 是否应引入 headless rendering。

### 更强的提取质量检查

缺少 alpha 边缘、spill、透明材质和 safe-zone 对比度的确定性报告。可在 image-edit 中逐步补齐，不由 Painter 手工修协议文件。

## 收敛原则

只有重复出现、输入输出明确、无需审美判断的步骤才进入 CLI/Core。视觉方向、bake-mask 判断、母版选择和最终节奏保留在 skill + human gates。
