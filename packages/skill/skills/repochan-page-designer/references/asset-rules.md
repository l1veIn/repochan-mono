# 角色素材用途与资产充分性

## 角色素材的正确使用方式

| 素材类型 | 正确用途 | 错误用途 |
|---|---|---|
| foundation sheet（设定集） | gallery 展示 | ❌ hero 主视觉 |
| chibi / 表情图 | features icon、gallery | ❌ stats 背景 |
| 专属 hero 插画（16:9） | hero split/full-bg | — |
| app icon / logo | navbar、footer | ❌ hero 大图 |

**如果只有 foundation sheet 没有专属 hero 插画**：
- hero 用 `centered`（无图），或用 `split-right` 配项目截图
- **不要**把设定集当 hero 图


## 资产充分性判定（硬性规则）

在提交页面工程或把图片标记为 ready 之前，**必须**通过以下检查。

### 每种 section 的图片要求

| Section + Variant | 图片要求 | 无合适图时 |
|---|---|---|
| hero split-right / split-left | **项目截图**或**专属 hero 插画**（横幅，至少 800px 宽）。设定集不算。 | 改用 hero centered（无图），或创建 hero_illustration 订单 |
| hero full-bg | **项目截图**或**专属场景图**（宽幅）。 | 改用 hero centered |
| hero centered | 图片可选。有项目截图更好。 | 可以不放图 |
| gallery grid / masonry | **至少 2 张**图片，尺寸接近。可以是角色衍生图（chibi、表情）或项目截图。 | 去掉 gallery section |
| features（image item） | emoji 做 icon 最简单。image 只在有专属小图标时使用。 | 用 emoji |
| footer logo | 小尺寸 icon/logo（方形、简洁）。 | 不放 logo |

### 最低可生成条件

1. analysis 已存在
2. persona 已存在（用于配色）
3. 已读取目标页面模板的 README/config
4. `src/config/assets.ts` 中真实图片必须来自已交付 order；未交付图片必须保持 `status: "pending"` 并有可开发 fallback
5. hero 用的图（如果有）是**为网页设计的**，不是设定集裁切
