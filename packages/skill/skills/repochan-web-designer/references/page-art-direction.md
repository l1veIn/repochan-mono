# 整页艺术指导与 section 覆盖

## 三种执行深度

### HTML-first

适合结构简单、section 刻意硬切、角色与图像很少的网站。整页方向稿可以覆盖 Nav/Footer 和低复杂度 sections，但每个未生成 section 母稿的区域必须记录 HTML-first 理由与视觉依据。

### Section-driven

适合各 section 相对独立的页面。为每个关键 section 生成视觉母稿，逐个做 bake-mask；最终组装后统一校正节奏。

### Continuous art direction

适合连续场景、角色多次出现、复杂过渡、色彩逐屏演进或漫画长卷。先锁定整页母稿，再生成带相邻上下文的 section 母稿。

## Continuous 工作流

1. 定义真实内容骨架、section 职责与大致高度比例。
2. 生成整页方向稿，解决明暗节奏、密度、高低潮、角色频率、色彩演进和首尾呼应。
3. 在 Human Gate 1A 选择整页方向；整页稿不是生产资产。
4. 为每个关键 section 准备参考：整页局部、上一 section 底部、下一 section 顶部、foundation、共享 pattern 与真实内容。
5. 分别生成 section 母稿，解决局部 L1–L4、safe zone 和响应式接口。
6. 在 Human Gate 1B 检查 section 组合板与转场，再开始大规模生产资产。
7. 逐 section 做 bake-mask、生成生产资产、重建 live layers。
8. 整页组装后做 Gate 2。

整页长图受生成尺寸限制时，可用压缩的 portrait overview 表达节奏，或生成带重叠区域的多个 viewport bands。不要把 overview 中失真的文字、像素高度或细节当成实现约束。

## Section provenance

每个非平凡 section 必须满足二者之一：

- `designReference`: 指向 section 母稿 order/version，并记录整页/相邻上下文来源。
- `htmlFirstDecision`: 记录为什么图像生成没有额外收益，以及该 section 继承哪份整页或相邻视觉依据。

Hero 与其他 sections 同级。Hero 可以最先完成，但不能成为其他 sections 唯一的设计证据。

## Transition contract

把相邻 section 边界作为设计对象，至少记录：

- `from` / `to` section。
- 连续 motif、运动方向和视觉能量变化。
- 图像侧与 live CSS/SVG 侧的 normalized anchors。
- pattern tile 的 scale/phase 是否连续。
- desktop 与 mobile 的简化、隐藏或替代策略。
- 实现方式：hard cut、gradient/mask、composite+SVG、独立 transition asset 等。

Transition contract 描述关系，不要求所有网站使用连续转场。硬切色面也是有效设计选择，但必须是有意选择。

## 覆盖检查

进入生产前建立 section coverage 表：

| Section | Design source | Bake mask | Shared L1 | Transition in/out | Responsive |
|---|---|---|---|---|---|

如果 Workflow、Proof、CTA 等仅由代理根据 Hero 风格直接写出，coverage 不成立；它们只能作为结构原型，不能宣称完成 section 设计。
