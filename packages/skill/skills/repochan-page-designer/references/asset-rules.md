# 角色素材用途与资产充分性

## 角色素材的正确使用方式

| 素材类型 | 正确用途 | 错误用途 |
|---|---|---|
| foundation sheet（设定集） | gallery 展示、迁移订单的角色参考 | ❌ hero 主视觉 |
| chibi / 表情图 | features icon、gallery | ❌ stats 背景 |
| hero 合成图（迁移后） | hero 主视觉 | — |
| app icon / logo | navbar、footer | ❌ hero 大图 |

## 资产缺口分析

资产缺口的判断在 SKILL.md 步骤 3 完成。核心逻辑：

- **starter.json 的 `assets[].order` 声明了哪些 asset 需要迁移**——有 `order` 字段的 asset slot 需要创建迁移订单。
- **templateId 精确匹配**：已有 delivered 订单的 `templateId` 与 starter asset 的 `order.templateId` 完全一致 → 资产已满足，复用。
- **无 `order` 字段的 asset**（纹理、favicon 等）→ 不需要迁移，直接用 starter 默认资产，或按需创建普通订单。

## 资产充分性底线

1. analysis 已存在
2. persona 已存在（用于配色）
3. 已 scaffold starter（`repochan starter pull`）
4. `src/config/assets.ts` 中真实图片必须来自已交付 order 或迁移后的后处理产物；未交付图片必须保持 `status: "pending"`
5. hero 用的图（如果有）是**迁移后或专属设计的**，不是设定集裁切
