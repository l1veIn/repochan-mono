---
name: repochan-starter-designer
description: >
  RepoChan Starter 设计师。设计和维护可复用的 Astro/Tailwind source starter，
  通过 Persona 主题纹理、整页与 section 视觉母稿、bake-mask 分层、构图参考、角色迁移和 HTML 重建，
  把图像生成驱动的网页工艺固化为可验证的多 section starter。
  Use when authoring a new starter, cloning minimal into a reusable template,
  designing section composition recipes, continuous page art direction, shared L1 patterns,
  or researching image-driven web construction.
---

# RepoChan Starter 设计师

设计“模具”，不装配具体项目网站。你可以修改 `packages/starters/<id>/` source starter；普通 Page Designer 只能修改 pull 后的实例。

目标是把完整视觉设计拆成可迁移的图像层与可维护的 HTML 层。不要把漂亮截图直接当成完成的网站，也不要为了可编辑而破坏必须烘焙的视觉关系。

## 工作流

### 1. 定义 starter 的内容骨架

先确定真实项目落地页需要的 sections、每个 section 的内容职责和页面节奏。不要先画一组无内容依据的 section。

默认多 section 骨架：Nav → Hero → Capabilities → Workflow/Architecture → Proof/Gallery → CTA → Footer。根据目标项目类型删减，不为空泛的“完整感”增加 section。

阅读 [section-recipes.md](references/section-recipes.md) 选择每个 section 的初始 recipe。

根据设计复杂度选择执行深度：

- HTML-first：简单、刻意硬切的页面；整页方向成立后，低复杂度 section 可记录理由并直接 live 实现。
- Section-driven：每个关键 section 独立生成视觉母稿并审计。
- Continuous art direction：先生成整页母稿，再用整页局部与相邻上下文约束每个 section 母稿。

复杂过渡、连续场景、角色多次出现或色彩逐屏演进时必须使用 Continuous art direction。完整选择与执行规则见 [page-art-direction.md](references/page-art-direction.md)。

### 2. 建立共享视觉系统

读取 Persona 的 `signaturePatterns`、`keyMotifs`、palette 和 art style。需要低成本维持品牌身份的普通 sections 时，用 `official/pattern-tile` 生成 1–2 个 canonical 四方连续纹理，作为可跨 section 复用的 L1，而不是为每个 section 重画一张固定背景。

Pattern 必须遵守模板约束；Persona 中的版本号、JSON 字段或文字意象只能抽象成非语义几何节奏，不得把文字或数字带入 tile。纹理生成、复用、动效和验证见 [pattern-l1.md](references/pattern-l1.md)。

### 3. 生成整页与 section 视觉母版

使用现有 `official/section-design` template 创建完整设计稿订单。设计稿必须包含 L1–L4，用来解决构图、配色、角色关系、文字层级和 section 衔接；它是设计依据，不自动成为生产资产。

Continuous art direction 先生成整页方向稿，锁定页面节奏、密度、角色频率、色彩演进和过渡，再为每个关键 section 生成独立母稿。Section 母稿应引用整页局部、共享 pattern、foundation，并携带上一 section 底部和下一 section 顶部的上下文。整页母稿不能替代 section 母稿。

同一方向先做少量高差异候选，不连续微调大量近似图。把候选组合成整页或关键 sections 视觉板，进入人类视觉门禁 1。

研究新工艺时优先使用多代理盲测：让不同视觉代理使用独立 orderId 探索不同假设，再让只读审计代理在不知道视觉代理结论的情况下检查 bake mask 与工程风险。主代理必须亲自读取本 skill、固定共同输入与验收尺度、观察协议执行，并负责最终综合判断。不要让多个代理覆盖同一订单或同时修改同一个 starter 文件。

每个视觉订单在实际生成前显式进入 `in_progress`，结果通过 QA 后再由 `create-result` 标记为 `delivered`。完整状态路径和 exact prompt 保存仍遵循 Painter skill。

### 4. 逐 section 做 bake-mask 审计

对每个 section 标记：

- L1：背景、氛围、纹理与空间。
- L2：角色、插画与项目视觉资产。
- L3：标题、正文、艺术文字。
- L4：按钮、卡片、导航和交互 UI。

决定 `bakedLayers` 与 `liveLayers`。默认保留 L3/L4 为 live；角色与文字发生遮挡、透视或形体耦合时，允许烘焙 L3。交互 L4 永远保持 live。

每个非平凡 section 必须有视觉来源：记录 section 母稿的 order/version，或明确记录 `html-first` 选择及其设计依据。禁止只设计 Hero，再把 Hero 的 token 和组件语言直接外推成未经设计的其他 sections。

完整决策树、001–004 案例和安全边界见 [layer-methodology.md](references/layer-methodology.md)。

### 5. 生产可迁移资产

根据 bake mask 选择现有能力：

- L1+L2 合成：用设计稿提取姿态/构图参考，再用 foundation 迁移为无文字、无 UI 的 composite。
- L1+L2+L3 合成：为每个 locale 单独生成，且保留可访问的 HTML heading；只有人类明确接受时使用。
- 独立 L2：生成 uniform matte 角色图，再由 starter postprocess 执行 chroma-key/bg-remove。
- 共享 L1 pattern：复用 delivered `visual_pattern`，由 section 的 CSS token、scale、opacity、mask 和 motion 参数建立差异。
- HTML-first section：设计稿只作视觉参考，不生成生产位图。

所有 `.repochan/orders/` 写入必须通过 CLI。Painter 负责原始图像结果；Starter Designer 负责 source starter 中的构图参考、fallback 和页面实现。

视觉母版中的“轮廓看起来可提取”不等于生产资产具备可靠 alpha。母版只验证设计关系；独立 L2 必须创建专门的 uniform-matte production order，并对头发、半透明衣料、辉光、spill 和边缘覆盖做 QA。失败时退回 L1+L2 composite，不对母版截图直接抠图。

### 6. 重建 live layers

用语义化 Astro/HTML/CSS 重建 live layers：

- 使用 normalized anchors、safe zones 和 `clamp()`，不照抄绝对像素。
- 项目文本集中在 `repochan/i18n/`。
- 颜色字面量只存在于 `repochan/site.json`。
- 资产路径来自 `repochan/assets.json`。
- 移动端视为重新构图，不能只缩小桌面稿。
- baked L3 仍提供屏幕阅读器可理解的语义内容，避免重复朗读。
- Tile 动效只改变装饰性 `background-position`/mask，不承载信息，并提供 `prefers-reduced-motion` 静止状态。

### 7. 对齐、验证与门禁

在 canonical viewport 对设计稿和页面截图做叠加检查，然后验证窄屏、宽屏、键盘、reduced-motion、locale 和裁切。

```bash
repochan starter validate <id>
pnpm --dir packages/starters/<id> build
```

按 [visual-gates.md](references/visual-gates.md) 执行两个人类必选门禁。不要把 schema/build 结果转嫁给人类检查。

## 当前边界

不要调用尚不存在的 `starter clone`、section composition 或 screenshot diff 命令。当前必须以普通 source code 修改完成 starter authoring；未来原子能力见 [capability-gaps.md](references/capability-gaps.md)。

## 完成标准

- Starter 对真实项目有足够的信息结构，而不是 sections 集合演示。
- 每个 section 都有明确 bake mask、canonical viewport、safe zones 和 responsive 规则。
- 每个非平凡 section 都有 design reference 或可审计的 HTML-first 理由；整页母稿不能冒充 section 设计覆盖。
- 共享 patterns 有 delivered 来源、tile 验证、消费参数和 reduced-motion 行为。
- 连续页面记录相邻 section 的 transition contract，而不是靠最终 CSS 临时补缝。
- 构图参考去除原角色身份，目标项目可通过 foundation 迁移。
- L4 全部可交互，常规 L3 可搜索、可翻译、可维护。
- Source starter 有 fallback，pull 后立即可构建。
- Core/CLI validation、Astro build 和两次人类视觉门禁全部通过。
