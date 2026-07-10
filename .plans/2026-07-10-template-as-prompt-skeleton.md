# 决策：template 从"物理规格"重构为"提示词骨架"（2026-07-10）

> 状态：**DRAFT** — 已对齐方向，待执行时照此走。
> 作者：Jack Yang（与 ZCode 讨论得出）
> 前置：`.plans/2026-07-09-repositioning.md`（ADR 基准）、`.plans/2026-07-09-cli-rewrite-design.md`（CLI 子命令设计）。
> 关联：本文件推翻"template = 结构约束（canvas spec）"的旧定位，重新定义为"template = 提示词骨架（prompt skeleton）"。

---

## 一、TL;DR

> **template 的本质是互联网上好用的提示词，抽取出来的。** template YAML 以 `prompt_template`（带 `{{slot}}` 插槽的提示词骨架）为核心，不再是 constraints 列表。art-director 负责"选模板"（策展决策），painter 负责"填插槽"（创作执行）。一套提示词 = 一个模板，未来模板数量会很大，为独立"模板市场"埋伏笔。

---

## 二、背景：为什么需要重新定义 template

### 2.1 旧定位的来由

`.plans/2026-07-09-cli-rewrite-design.md`（Phase 2.1 CLI 重写设计）和 ADR §八把 template 定义为**资产的结构约束（canvas spec）**：画布多大、什么宽高比、网格布局、可不可切片、背景类型、质量标签。template-loader.ts 的类型定义注释直说："A template defines the STRUCTURAL constraints of an asset — the canvas spec that the Painter must respect. It is NOT a prompt generator."

这个定位下，prompt 的组装完全由 painter skill 负责——painter 从 persona 字段（rolePrompt / hairColor / outfit / signaturePose...）+ order brief + template 的 constraints/guide 从零拼装完整 prompt。template 只给画框，不给画法。

### 2.2 旧定位暴露的三个问题

2026-07-10 用 2048 仓库做端到端 Claude Code 实跑测试后，发现三个问题：

**问题 1：template 里没有 prompt，太薄了。**

8 个模板 YAML 的实际信息量极少——大部分是 `guide: "masterpiece, best quality"` + 几行 constraints。非切片资产（poster / banner / icon / three-view）的 template 几乎没有不可替代的信息：尺寸受 gpt-image-2 三档限制（template 写的 `1536×864` / `1344×768` 根本传不进模型），guide 是一句话质量标签，constraints 是创作指导（该在 skill 里）。真正有结构价值的信息只有 grid（rows/cols/sliceable），而那只有 chibi 和 pattern 模板有。

**问题 2：海报产出不是"设计海报"，是"角色插画 + 标题"。**

测试中生成的 poster 是"一个大号角色插画 + 标题文字"——本质还是角色插画，只是尺寸大一点。而产品愿景要的是**平面设计海报**：用设计运动（瑞士风格 / 包豪斯 / 构成主义 / 极简 / 极繁 / 超现实 / 至上 / 半调 / 拼贴...）驱动构图的视觉品牌资产，角色是设计元素之一不是主体独占。

对比作者提供的 4 张示例海报（`示例海报/*.jpg`，每张内含图片和对应提示词）：
- 示例 1：**构成主义 + 复古宣传海报**——几何对角线、工业质感、大字标题
- 示例 2：**故障艺术（Glitch Art）+ 数字拼贴**——错位视窗、色彩偏移、扫描线
- 示例 3：**Risograph 半调 + 波普**——网点纹理、高饱和撞色、复古杂志排版
- 示例 4：**孟菲斯设计**——几何色块、不对称分割、俏皮撞色

四张的共同特征：**prompt 本身就是"平面设计语言"**——"constructivist propaganda poster, geometric diagonal composition, risograph halftone"——而不是"1girl, anime, standing, white background"。**要生成这种海报，prompt 得是设计描述，不能是角色描述。** 这说明真正的 template 内容应该是提示词，不是约束。

**问题 3：art-director 工作量太少。**

现有 art-director skill 的职责是"创建 order（约稿简报）"——填 brief.intent / mustInclude / avoid，指定 templateId。但它不做创意决策——不选风格、不选模板（foundation 只有一个模板，其他资产类型也只有一个模板可选，没得选）。这浪费了"美术总监"这个角色的策展能力。

### 2.3 认知调整的转折点

作者提出：**"既然是'模板'，那么应该是提示词模板，模板里一定是有提示词的。模板的本质应该是我们在互联网上找到的其他人分享的好用的提示词，抽取出来的。"**

这个定义一确立，旧定位的三个问题全部解决：
- template 不再薄——它有完整的、风格鲜明的提示词骨架
- 海报可以做成设计海报——prompt_template 就是设计语言
- art-director 有事做——从一组风格各异的模板里选最匹配项目的那个

同时明确了**模板会很大**：以后每种设计风格的海报是一个独立模板（`official/poster-constructivist` / `official/poster-glitch-art` / ...），用户也可以自己贡献模板。这为独立的"模板市场"产品埋下伏笔。

---

## 三、分工确认

讨论中澄清了插槽填充的职责归属（这是关键决策）：

| 角色 | 职责 | 不做什么 |
|---|---|---|
| **art-director** | 读 persona.artStyle + analysis 项目气质 + interview 偏好 → 从 `template list --tag <type>` 选最匹配的模板 → 创建 order 指定 `templateId` | 不碰插槽、不填 prompt |
| **painter** | 读 order.templateId → `template get` 拿 prompt_template → 结合 persona/analysis/interview **智能填充**每个 `{{slot}}` → 填完的完整 prompt 丢给 `image gen` | — |

**关键澄清**：slot 填充**不是机械映射**。slot 名是表意的（如 `{{signature_scene}}`），可能对应 persona 里的字段，也可能是 persona 里没有的——画师需要结合当前项目上下文和用户访谈报告**创造**这个值。这就是为什么填插槽是 painter 的创作工作，不是 art-director 的机械工作。

---

## 四、新 template 数据结构

### 4.1 YAML 结构（每个模板）

```yaml
id: "official/poster-constructivist"
asset_type: "poster"
label: "构成主义宣传海报"
description: "几何对角线构图 + 工业质感 + 大字标题，适合工具型/基建型项目"
tags: ["poster", "design", "constructivist"]

# 画布规格（gpt-image-2 实际支持的三档之一）
size: "1536x1024"

# 切片规格（仅 sliceable 资产）
grid:
  rows: 3
  cols: 3
  sliceable: true

# 核心：提示词骨架（带插槽）
prompt_template: |
  constructivist propaganda poster design, bold geometric diagonal composition,
  {{character_visual}}, limited color palette of {{color_palette}},
  {{key_motifs}} rendered as flat graphic symbols integrated into the geometry,
  large bold title text "{{repo_name}}", subtitle "{{character_name}}",
  risograph halftone print texture, raw industrial atmosphere,
  {{signature_scene}}, masterpiece, best quality

# 仅保留纯技术约束（后处理依赖的物理规格，不是创作指导）
constraints:
  - "pure solid white background (#FFFFFF)"
```

### 4.2 字段变化对照

| 旧字段 | 新方案 | 理由 |
|---|---|---|
| `width` + `height` + `aspect_ratio` | 合并为 `size`（`"1024x1024"` / `"1536x1024"` / `"1024x1536"`） | gpt-image-2 只支持三档；非标准尺寸（21:9、16:9）snap 到最接近的三档 |
| `guide` | 并入 `prompt_template` 末尾 | "masterpiece, best quality" 就是 prompt 的一部分 |
| `background` | 并入 `prompt_template` | 背景描述是创作判断，属于 prompt |
| `constraints`（创作类） | 并入 `prompt_template` | "horizontal poster" / "dynamic pose" 这些是提示词 |
| `constraints`（技术类） | **保留**为 `constraints` | chibi 的"纯白背景 + 不重叠 + 单轮廓"是后处理（blob 检测 + matting）的物理依赖，不是创作指导 |
| —（新增） | `prompt_template`（`\|` 块标量多行） | template 的核心：带 `{{slot}}` 的提示词骨架 |

### 4.3 向后兼容

- loader 解析 `size` 字段，同时向后兼容旧的 `width`/`height`（从它们推算 size）。
- `template get --json` 输出同时含 `size`、`width`、`height`、`aspectRatio`（从 size 反推）。
- `promptTemplate` 是 optional——旧模板没有也能用（painter fallback 到从零拼 prompt）。

---

## 五、海报模板拆分

### 5.1 从单一 poster 到多风格 poster

现有 `official/poster`（单一"角色插画海报"）拆为多个设计风格模板。基于作者提供的 4 张示例海报 + 设计运动列表：

| 新模板 id | 风格 | 适合项目类型 | 示例来源 |
|---|---|---|---|
| `official/poster-constructivist` | 构成主义宣传海报 | 工具型/基建型/系统级（强调工业力量、功能主义） | 示例图 1 |
| `official/poster-glitch-art` | 故障艺术数字拼贴 | 数字/技术/数据项目（数字失真、电子质感） | 示例图 2 |
| `official/poster-risograph-pop` | Risograph 半调波普 | 轻量/创意/社区项目（复古温暖、波普亲和力） | 示例图 3 |
| `official/poster-memphis` | 孟菲斯几何撞色 | 活泼/年轻/设计感项目（撞色俏皮、反功能主义装饰） | 示例图 4 |
| `official/poster` | 通用角色主视觉（fallback） | 无明确设计方向时 | 保留现有 |

### 5.2 其他资产类型保持单一模板

foundation / chibi-3x3 / chibi-4x4 / icon / readme-banner / three-view / pattern-2x2 保持单一模板，只重构结构（加 prompt_template）。未来如果某种资产也需要多风格（如多种 banner 设计），按同样模式拆分。

---

## 六、实现计划（分块）

### 块一：template YAML 重写

**文件：`packages/skill/templates/*.yaml`（8 个现有 + 4 个新增海报 = 12 个）**

每个 YAML 按 §四的新结构重写：
- 加 `prompt_template`（核心，带 `{{slot}}` 骨架）
- 加 `size`（替代 width/height/aspect_ratio）
- `constraints` 只留技术约束（chibi 的纯白背景等）
- 删 `guide`/`background`（并入 prompt_template）
- 4 个新海报模板的 prompt_template 基于示例海报的提示词风格编写

**约束**：prompt_template 的 slot 名使用 snake_case 表意命名（`{{character_visual}}`、`{{color_palette}}`、`{{repo_name}}` 等），让 painter 一看 slot 名就知道该填什么。

### 块二：loader 支持多行块标量

**文件：`packages/cli/src/lib/template-loader.ts`**

现有 `parseSimpleYaml` 只处理 `key: value` 单行格式，不支持 YAML 的 `|` 块标量（多行字符串）。prompt_template 是多行提示词，需要扩展。

**方案**：在 `parseBlock` 函数里加约 15 行代码，遇到 `key: |` 或 `key: |-` 时收集后续缩进行，按 YAML 块标量规则拼接（`|` 保留尾部换行，`|-` 去除）。保持零依赖原则（不加 `yaml` npm 包）。

**TemplateData 类型加 `promptTemplate?: string`**，`toTemplateData` 加解析。删 `guide`/`background` 类型字段。`size` 从 `raw.size` 或旧 `width`/`height` 解析。

### 块三：template 命令输出 prompt_template + tag 过滤

**文件：`packages/cli/src/commands/template.ts` + `packages/cli/src/index.ts`**

- `runTemplateGet`：`formatTemplateHuman` 加 prompt_template 输出（多行展示）；`--json` 输出加 `promptTemplate` 字段。
- `runTemplateList`：加 `--tag <tag>` 可选参数，过滤含该 tag 的模板。art-director 用 `template list --tag poster` 列出所有海报模板。
- `index.ts`：template 命令注册加 `--tag` option。

### 块四：art-director skill 重写（加选模板职责）

**文件：`packages/skill/skills/repochan-art-director/SKILL.md`**

在"创建下游任务"段落，加入模板选择逻辑：

1. 确定资产类型（poster / banner / icon / chibi / pattern / ...）
2. `repochan template list --tag <asset_type>` 列出该类型的可用模板
3. 如果只有一个模板（foundation / icon / chibi / banner / three-view / pattern），直接用它
4. 如果有多个模板（poster 有 5 个），读 persona.artStyle + analysis 项目气质 + interview 偏好，选最匹配的
5. 创建 order 时指定 `templateId`

**海报模板选择指导**（art-director 需理解每种设计风格适合什么项目）：
- 构成主义 → 工具型/基建型/系统级（工业力量、功能主义）
- 故障艺术 → 数字/技术/数据（数字失真、电子质感）
- Risograph 波普 → 轻量/创意/社区（复古温暖、亲和力）
- 孟菲斯 → 活泼/年轻/设计感（撞色俏皮、装饰性）
- 通用角色海报 → 无明确设计方向时的 fallback

### 块五：painter skill 调整（填插槽替代从零拼 prompt）

**文件：`packages/skill/skills/repochan-painter/SKILL.md`**

新增"模板插槽填充"工作流：

1. `repochan template get <order.templateId>` 读取 prompt_template
2. 识别所有 `{{slot}}` 占位符
3. 结合 persona / analysis / interview 数据**智能填充**每个 slot
4. 填完的完整 prompt 传给 `repochan image gen --prompt`

**slot 填充指导**（常见 slot 和填充来源，指导而非硬规则）：
- `{{character_visual}}` ← persona.rolePrompt + hairColor + outfit（精简为一句视觉描述）
- `{{color_palette}}` ← persona.mainColor + secondaryColor + accentColors（hex 值）
- `{{key_motifs}}` ← persona.keyMotifs（精简）
- `{{character_name}}` ← persona.name
- `{{repo_name}}` ← analysis 报告的仓库名
- `{{signature_scene}}` ← persona.signatureScenes（如有）
- 其他自定义 slot ← 画师根据模板的 description 和项目上下文判断该填什么

**现有 prompt 组装方法论保留**：结构化标签块、avoid 转正向、pose 技巧、中英混排等是"有模板时微调"和"无模板时从零构建"都需要的通用能力。只是新增"优先用模板 prompt_template，从零拼是 fallback"。

---

## 七、验证标准

1. `pnpm --filter repochan build` 绿（loader 支持 `|` 块标量解析）
2. `repochan template list` → 列出 12 个模板（含 5 个海报）
3. `repochan template list --tag poster` → 过滤出 5 个海报模板
4. `repochan template get official/poster-constructivist` → 输出含 prompt_template（多行展示）
5. `repochan template get official/foundation-sheet --json` → promptTemplate 字段在 JSON 里
6. 旧模板（无 prompt_template 的）仍可被 `template get` 读取（向后兼容）

---

## 八、不做（范围控制）

- **在线模板仓库**（ADR Phase 3 远期——本文件的模板结构为它埋伏笔，但不实现仓库）
- **`repochan template search` / `pull`**（Phase 3，需要在线搜索/下载）
- **persona skill 的 proposedArtStyles 扩充设计运动**（独立改动，与本文件正交）
- **不改 core schema**（order.templateId 已存在，不加新字段——slot 值不存 order，painter 运行时填）
- **不改 image gen 的 size 三档限制**（gpt-image-2 模型能力边界）
- **不改 `order create` 的 brief 结构**（brief 仍存 intent/mustInclude/avoid，与 prompt_template 正交——brief 是"约稿意图"，prompt_template 是"画法骨架"）

---

## 九、为"模板市场"埋的伏笔

本文件的结构设计考虑了未来独立"模板市场"产品：

1. **模板自描述**：每个 YAML 含 id / label / description / tags，足以被市场索引和搜索。
2. **id 命名空间**：`official/` 前缀是官方内置，未来用户贡献的用 `community/` 或用户名前缀。
3. **tag 系统**：`tags` 字段支持多维度分类（资产类型 + 设计风格 + 适用场景），市场的分类页直接用它。
4. **prompt_template 是文本**：市场展示模板时，用户能直接看到提示词骨架，判断质量。
5. **零运行时依赖**：loader 是纯 TS + 自带 YAML 子集解析器，独立市场产品可以复用。

---

## 给下个会话的指示

本文件是 template 重构的基准。照 §六 实现计划走：

1. **块二先行**（loader 支持 `|` 块标量）——这是其他块的前置，不加它 prompt_template 解析不了。
2. **块一**（12 个 YAML 重写）——基于示例海报 + 设计运动知识编写 prompt_template。
3. **块三**（CLI 命令输出）——template get/list 支持 prompt_template + tag 过滤。
4. **块四**（art-director skill）——加选模板工作流。
5. **块五**（painter skill）——加填插槽工作流。
6. **§七 验证**——逐项核对。

**不要重新讨论**：template 是提示词骨架（§一）、art-director 选模板 / painter 填插槽（§三）、海报拆多风格模板（§五.1）。这些已定。

**未来扩展方向**（不在本文件范围，但记下）：persona skill 的 proposedArtStyles 应扩充设计运动提案，让创意团队造人设时就考虑设计风格，与 art-director 的模板选择形成上下游配合。
