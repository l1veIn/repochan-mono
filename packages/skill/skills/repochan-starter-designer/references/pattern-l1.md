# Persona 驱动的共享 L1 pattern

## 定位

四方连续纹理是项目级共享 L1，不是某个 section 的固定截图。它适合 Capabilities、Workflow、Proof、CTA 周边等低图像密度区域，用较低资产成本维持 Persona 视觉身份。

把 L1 拆成：

| 子层 | 内容 | 推荐实现 |
|---|---|---|
| L1a | 基础色面与大尺度明暗 | `site.json` token + CSS gradient |
| L1b | 共享主题纹理 | delivered seamless pattern tile |
| L1c | section 局部氛围与转场 | CSS mask/glow/SVG 或独立 atmosphere asset |

## 生成路径

### Persona-first

1. 读取 `signaturePatterns`、`keyMotifs`、palette、art style。
2. 选择 1–2 个能跨 section 使用的低对比概念。
3. 使用 `official/pattern-tile` 创建 `visual_pattern` 订单。
4. 将 delivered tile 作为后续 section-design 的 style reference。

适合先建立统一品牌语汇。

### Section-discovered

1. 先完成 section 或整页母稿。
2. 识别其中值得复用的背景语言。
3. 将母稿作为 style reference，用 `official/pattern-tile` 抽象为 seamless tile。
4. 验证后晋升为共享 L1，并回填其他 sections。

适合避免提前生成无用纹理。两条路径可以并存，但同一视觉概念只保留一个 canonical delivered 来源。

## 模板约束优先

`official/pattern-tile` 禁止文字、数字、标签和水印。Persona 描述中的版本号、JSON 字段名或语义文本只能转译为菱形、短线、节点、伪字形密度或非语义网格，不能原样进入 prompt。Pattern 是材质，不是信息层。

## 复用而不重复

同一 tile 可通过 tokenized CSS 参数产生不同 section 状态：

- `background-size` 控制图案尺度。
- opacity/overlay 控制密度与文字对比度。
- `background-position` 与 mask 控制局部显现。
- blend 与 L1a 色面形成不同色彩状态。
- animation direction/speed 表达不同叙事方向。

不要为每个 section 复制一份仅参数不同的图片。参数属于 section composition；图像仍指向同一资产 slot。

## 动效边界

- 只移动装饰层，不承载状态或流程信息。
- 默认慢速、低对比，不能与 L2 角色争夺焦点。
- `prefers-reduced-motion: reduce` 时停止运动且静态构图仍成立。
- 相邻 sections 需要连续背景时，共享 tile、scale 和相位；用 mask/gradient 改变局部密度，不在边界重新随机起点。

## 验证

生成结果必须实际做 3×3 或更大平铺检查，观察四边接缝、中心重复热点、文字可读性和动效循环。模板声称 seamless 不是验证证据。当前没有专用 seam validator 时，用 image-edit/browser 生成检查板并人工 QA；不要把检查板作为生产资产。
