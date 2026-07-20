# Prior-Art 独立研究报告：AI 网格图切分与 chroma-key 抠图

> 研究对象：`test-repos/sprite-gen/`（Python，v1.56.x）与 `test-repos/agent-sprite-forge/`（Codex skill）。
> 研究视角：把其中可移植的技术蒸馏到一个 TypeScript 本地图像库（零网络、零凭证、确定性像素处理）。
> 本报告独立于任何既有设计稿写成；所有结论基于两仓库的实际代码、文档与测试，行号以当前 clone 为准。

---

## 0. 两仓库定位速览

| 维度 | sprite-gen | agent-sprite-forge |
|---|---|---|
| 形态 | Python 包 `sprite_gen` + SKILL.md（agent 驱动 CLI 脚本链） | Codex skill：SKILL.md + references + 单个 1627 行 Python 脚本 |
| 生成产物 | 每 state 一条横向 strip（1×N 动画行）＋ 偶尔 3×2 立绘 sheet | rows×cols 的 2D 网格 sheet（2x2/3x3/4x4…） |
| 抠图成熟度 | 高：双路径（RGB 4-pass chain + YCbCr chrominance matting） | 低：硬切 + border flood fill，无 soft alpha、无 despill |
| 几何切分 | strip：connected components（+opt-in projection-profile DP）；sheet：whole-sheet components + centroid 归格 | 纯等分 crop，components 只用于格内 largest 选择 |
| QA | inspect（确定性指标）→ score（0-100 加权 + hints）→ correction loop（bounded regen） | QC 元数据 + strict gates（edge touch / paste_clamped / body_scale_cv / anchor_y_std），失败即 raise，由 agent 决定重试 |
| 输出场景 | 游戏 sprite atlas（运行时消费 manifest.frame_layout） | 游戏 sprite / prop / FX |

一句话：**sprite-gen 是「抠图与切分算法」的富矿；agent-sprite-forge 是「生成侧契约与 QC gate 设计」的富矿。**

---

## 1. sprite-gen 深度分析

### 1.1 Matte / chroma key 策略

**双路径架构**，默认 RGB、opt-in YCbCr（`chroma.mode`）。

#### RGB 默认路径：`remove_chroma_background`（`sprite_gen/extract.py:111-251`）

四段链（docs/sheet-slicing.md:17 称为 "4-pass chain"）：

1. **Hard key cut**（extract.py:128-143）：像素按 class 分类——
   - `_KEYED`：`alpha==0` 或 `color_distance(color, key) <= threshold`（RGB 欧氏距离，extract.py:25-26），默认 **threshold=96**（`sprite_gen/slice_sheet.py:47`，extract CLI 同款 extract.py:1909）。被擦除像素直接置 `(0,0,0,0)`。
   - 其余按 **key-tint score** 分类（extract.py:47-54）：取 key 的 keyed 通道（值 ≥192）均值减去 unkeyed 通道（值 <64）均值。对 magenta，tint = (R+B)/2 − G；对 green，tint = G − (R+B)/2。这是一个**线性算子**，是后续解混的基础。
   - tint < `fringe_delta`（默认 **18**，slice_sheet.py:49）→ `_SUBJECT`（永不触碰）；距离 ≤ `fringe_threshold`（默认 **180**，slice_sheet.py:48）→ `_BLEND_IN_BAND`，否则 `_BLEND_OUT_OF_BAND`。

2. **Key-depth BFS**（extract.py:152-172）：从所有 keyed 像素做 8-邻域 Chebyshev 距离扩散，深度上限 `unmix_reach`（默认 **4**，slice_sheet.py:132）。注意注释明确说 *"This walk is not blocked by subject pixels"*——发丝缝隙内部的 trapped blend 也能拿到深度。

3. **Soft-alpha unmix（已知背景色解混）**（extract.py:174-196，核心公式在 `despill_color` extract.py:58-79 与 `unmix_key_blend` extract.py:82-94）：
   - 混合模型：`observed = (1-k)·subject + k·key`。
   - 因 tint 是线性的且 `tint(subject)≈0`，故 `k = tint(observed)/tint(key)`，`coverage = 1-k`，`subject_rgb = (observed − k·key)/coverage`，`out_alpha = alpha·coverage`。
   - 适用范围：深度 ≤4 内的 out-of-band blend 全部解混；in-band blend 只在深度 ≤2（`_IN_BAND_UNMIX_KEY_DEPTH = 2`，extract.py:102）解混——更深的 key-tint 像素保持 byte-identical（v1.10.1 guardrail，防止把热粉/紫色主体材料误改）。
   - 效果：AA 边缘从 binary staircase 变成带 coverage ramp 的 soft alpha。tests/test_chroma_soft_alpha.py 用真实事故图回归：修复前 mid-alpha 像素数为 0。

4. **Trapped-spill despill**（extract.py:198-251）：生成器会把 key 色 spill 画进主体内部（深红头发里的绿丝），深度走不到。做法：收集剩余 tint ≥ fringe_delta 的像素 → 8 连通聚类 → **小簇（≤ 主体像素的 `spill_max_fraction`，默认 0.005，下限 32px，extract.py:208）且簇内存在强 tint 像素（max tint > `_SPILL_MIN_TINT = 40`，extract.py:108）** 才判定为 spill，用同一 `despill_color` 公式做**仅颜色修正、alpha 保持不变**（注释 extract.py:202-205：给内部 spill 配 partial alpha 会打出 pinhole）。大簇 = 故意画的 key 色材料（hot-pink 种子包），不碰；皮肤等暖色 tint 不到 40，天然豁免。

**评价**：这是两仓库中最有价值的部分。`k = tint/tint_key` 的解混只对「key 是单通道纯色 + subject 的 tint≈0」成立（magenta/green/cyan 都满足），假设干净、实现约 40 行、无迭代。与业界做法一致——blend 模型即标准 compositing 的逆运算，Aksoy et al.（SIGGRAPH/TOG 2016, "Interactive High-Quality Green-Screen Keying via Color Unmixing"）用的也是 color unmixing 思路（[论文](http://yaksoy.github.io/papers/TOG16-keying.pdf)）；Steve Wright 的 despill（Natron Despill 节点所依据）同样是分离 alpha 生成与 spill 修正。

#### YCbCr opt-in 路径（extract.py:254-581）

移植自 perfectpixel-studio（MIT，extract.py:255-257 注明出处）。动机：RGB 距离球在**有明暗渐变的背景或 JPEG 4:2:0 chroma 噪声**下会漏擦（shading 只动 Y 不动 CbCr）。常数（extract.py:266-275）：

- `_YCC_CHROMA_IN = 24` / `_YCC_CHROMA_OUT = 72`：CbCr 平面距离的 smoothstep 软 matte 区间（≤24 全透明，≥72 全不透明，`smoothstep` 为 Hermite 3t²−2t³，extract.py:300-306）。
- `_YCC_DESPILL_BAND = 100`、`_YCC_DESPILL_SCALE = 0.92`：despill 只扣 **key 方向的 chroma 投影分量**（extract.py:452-461），与 key 正交的颜色保住饱和度——这比粗暴的 "min(G, max(R,B))" 式绿幕 despill 精细。
- **Key 自检测**（`detect_background_key_ycc` extract.py:309-378）：四角 1/5 区块 + 1px 边框采样，**CbCr 直方图取 mode（8 级量化 bin）而非 mean**——mean 会被渐变拖偏。若 ≥12%（`_YCC_KEY_BIAS_FRACTION`）样本落在声明 key 的 chroma 族（半径 55）内则直接用声明族均值。
- **Border flood fill**（`_flood_clear_background_ycc` extract.py:381-425）：4 连通从边框灌入，容差 88（`_YCC_FLOOD_TOL`，很宽），靠连通性保护主体内部的 key 色（宝石、高光永远连不到边框）。
- **自诊断 rematte**（extract.py:524-581）：matte 后检查两个症状——opaque 占比 >0.60（key 检错把主体擦了）或声明 key 残留 >0.025（背景没擦干净）——任一触发就用声明纯 key 重 matte，取更优者，并通过 `warnings` 上报（never silent）。
- 收尾 `_cleanup_alpha_ycc`（extract.py:491-521）：0 邻居的孤立点删除、≥7 邻居的 pinhole 填补，基于 alpha 快照防级联。

文档（docs/chroma-alpha.md:43）明确说**默认保持 RGB**：干净平 key 的图上 RGB 精确解混更彻底，YCbCr 的固定 0.92 despill 会留轻微 halo；YCbCr 是给 degraded source 用的。这个「两条路径各司其职、不做虚假升级」的判断很成熟。

#### Key 选择（prepare.py:198-255, 423-497）

- 候选固定 4 色：magenta `#FF00FF`、green `#00FF00`、cyan `#00FFFF`、blue `#004DFF`（prepare.py:198-201）。
- `--chroma-key auto`（prepare.py:423-497）：从 base 图采样主体像素（NEAREST 缩到 256px——避免 LANCZOS 发明不存在的混合色，prepare.py:218-223），用 border ring 识别平色背景（容差 48，覆盖率 0.75，prepare.py:227-229）、把背景 mask dilate 2px 吃掉 AA 带（prepare.py:234）、speckle 过滤（8 邻居中至少 3 个同色，容差 40，prepare.py:249-250），enclosed 区域按「平色占比 ≥0.60 是洞、否则是画的材料」区分（prepare.py:242-243）。
- 打分：每个候选 key 对全部主体像素距离排序，**以 1st-percentile 距离为 score**，但优先选 **min 距离 > 96（= 擦除半径）的候选**（`MIN_SUBJECT_KEY_DISTANCE = 96`，prepare.py:255）——防止占比 <1% 的小特征（眼睛、宝石）被 1st-percentile 指标掩盖而遭误删。无候选通过时给 warning 而不是静默。
- docs/chroma-alpha.md:11-15 还有一张人工决策表（粉/紫/深红主体→green key；绿/青主体→magenta），写在 SKILL 层给 agent 用。

### 1.2 网格几何切分

两条产品线，算法不同。

#### A. 动画 strip（1×N）：connected components + seed/satellite 合并（extract.py:584-647, 1799-1859）

- `connected_components`（extract.py:584-630）：4 连通，alpha > 16 才算实体（592 行——soft alpha fringe 不参与连通）。
- `extract_component_images`（extract.py:1799-1842）：
  - **seed 阈值** = `max(120, 最大 component 面积 × 0.20)`（1804 行）；seed 不足 frame_count 时退化为面积 top-N（1806-1807），仍不足返回 `None`（失败可观测）。
  - **satellite 合并**：非 seed 且面积 ≥ `max(12, 最大面积 × 0.002)`（1817 行）的 component，按 center_x 找最近 seed，**bbox 与 seed bbox 外扩 15%（下限 6px）的邻域相交才合并，否则丢弃并 stderr 报告**（1831-1840 行）。注释记录了教训：纯 x 距离合并会把远处的 chroma 残渣吸进来，bbox 膨胀、baseline 抖动。
- **槽位 fallback**：`extract_slot_frames`（extract.py:1852-1859）等分切，但 SKILL/docs 明确仅 `--allow-slot-fallback` 调试用途，须上报 `slots-explicit`（docs/chroma-alpha.md:31）。
- **opt-in projection 分割**（segment.py，移植自 perfectpixel-studio）：列向 alpha 质量投影 P[x]=Σα，gutter 检测（eps=0.045·peak，peak_min=0.18·peak，min_run=width/100，segment.py:241-243），prominence 峰检测（峰 ≥0.45·run_max，峰间谷 <0.62·峰高才算分离，segment.py:124-141），粘连时 **DP 最优切分**：cost = Σ P[cut] + λ·(width−ideal)²，λ=0.0015，min_width=0.45·ideal（segment.py:149-202）。检测数 ≠ 期望数且宽度允许时全 strip DP 强制切 N 段（segment.py:272-276）。切完插 8px 透明 gutter 重组，再走 components 路径。**默认关闭**，失败时 strip 原样不动、下游以原错误失败（No Silent Fallback，segment.py:316-329）。

#### B. 立绘 sheet（COLS×ROWS）：`slice_sheet.py`，这是与本课题最同构的代码

- 整图抠 alpha 后做 whole-sheet connected components（`_components`，slice_sheet.py:65-86），**按 component 质心归格**（183-186 行）——不是 grid crop。自己的披风/道具溢出格界仍归属自己，邻居的溢出留在邻居。
- **跨格粘连处理**（slice_sheet.py:52, 168-186）：component 宽或高 > **1.5 格**（`MERGED_SPAN_FACTOR = 1.5`）判定为双主体融合 → 按格界劈开 → **格内重跑连通性**（`_relabel_within_cell`，89-115 行）——不 relabel 的话邻居的头发碎片会粘在本格主体上（docs/sheet-slicing.md:62-66 记录的实战事故）。
- **噪声与碎屑**：component < `noise_min`（默认 **60px**，slice_sheet.py:50）直接丢；「neighbour-debris rule」（slice_sheet.py:188-210）：格内小于主图 **30%**（`debris_fraction = 0.30`，slice_sheet.py:51）且**触碰格界 ±2px** 的碎片判定为邻居 overhang 丢弃；格内独立的 detached effect（爱心、星星、ZZZ）不触界所以存活。
- **空格处理**：任何 cell 抠完无主体 → `raise SystemExit`（slice_sheet.py:217），fail loud 强制重新生成，不写空白文件。
- **归一化**：每格主图独立缩放到 `target_height`（默认 645）、脚底贴 `baseline_y`（默认 725）、主图 center_x 对齐画布中轴（slice_sheet.py:214-250）。文档（sheet-slicing.md:72-78）记录了为什么 per-cell 而非 sheet-wide：生成器常把不同行画成不同尺寸（实测顶行比底行高 40%）。

### 1.3 QA / 失败处理

- **extract 内置检查**（`inspect_frames` extract.py:1872-1902，常数在 parser 1946-1952 行）：每帧 nontransparent 像素 < 400 → error；边缘 2px 带内非透明像素 > 24 → warning；距 key < 150 的存活像素（chroma-adjacent）> 120 → **error**（key 没擦干净/撞色）；帧面积 < 中位数 ×0.35 或 > ×2.75 → warning（离群帧）。
- **失败即阻断**：component 数凑不齐 frame_count 时该行 blocked；损坏的 run JSON 记录（frames-manifest / extract-failure）读取即 raise（extract.py:1974-1991 的 `_load_validated`，"corrupt record never reads as empty"）。
- **结构化缺陷**：不是错误码枚举，而是「errors/warnings 文本 + metrics 数值」写进 inspect report；`score.py:101-148` 加权打分（帧数不符 −35−10×差值、每 error −13、每 warning −3、无 motion −12、dHash/histogram 低各 −10；≥90 且无 error 为 ok），并生成 **provider-ready correction hints**（score.py:54-98——把每种测量缺陷翻译成给生成模型的自然语言修正指令，如 "Regenerate as exactly N full-body poses in N equal invisible horizontal slots. Keep clear gutters between poses"）。
- **重试**：`correction_loop.py` bounded loop（默认 max 3 pass、pass-score 90），dry-run 可只验证；真重生成必须显式给 provider command，**无静默 fallback 生成器**（SKILL.md:326-330）。
- **截图级 QA**：`check_visible_magenta.py` 对浏览器/游戏截图做可见 magenta 检测（R≥230, B≥230, G≤80, R−G≥150, B−G≥150；>64px 或 >0.005% 即 fail）。

### 1.4 生成侧稳定化

- **Layout guide 图**（prepare.py:814-841 `draw_guide`）：每个 state 生成一张 guide——浅灰底、每 slot 深灰框 + 蓝色 safe-area 框 + 中轴线；`motion_phase_guides` 开启时还画火柴人式的腿相位提示（prepare.py:786-811）。guide 作为 reference 图和 base anchor 一起喂给生成模型（SKILL.md:169-171：exactly two references——identity anchor + layout guide），prompt 明确 "use only for frame count, slot spacing, centering, and safe padding… 不得复制 guide 线"。
- **Prompt 契约**（SKILL.md:265-277）：精确帧数、每 slot 一个完整 pose、safe margin、平 chroma 背景、禁 list（shadows/glows/text/grid lines…）。prompt 由 `prepare` 从 `sprite-request.json` 数值 SSoT 生成，agent 不手写帧数。
- **Base Lock Gate**（SKILL.md:56-80）：先锁一张 canonical idle anchor 再跑行——identity 用图锚定而不是 prompt 文本。
- 明确原则：坏图只能重生成，本地不修复（"the slicer cannot repair a three-armed generation"，docs/sheet-slicing.md:91-93）。

### 1.5 整体架构

`sprite-request.json` 是唯一数值 SSoT → `prepare` 写 request/guide/prompt → `gen`（唯一的 AI 步骤，codex/grok provider CLI）→ `extract`（确定性像素链）→ `inspect/score/correction-loop`（确定性度量 + hint 生成）→ `compose` atlas + manifest。agent 的职责：走 SKILL.md 的流程、看 QA 报告、决定重生成、在 webview 里 curate。**所有像素决策都在确定性代码里**；SKILL.md 反复强调 "AI 介入只有 raw 生成一处"（SKILL.md:47-54 的 blocking gate）。工程上有大量 run-dir 锁、原子写、cache-key（engine_revision）防 stale——这是多 agent 并发场景的产物。

### 1.6 局限与坑

1. **性能**：全是纯 Python 逐像素双重循环（抠图、BFS、components 都是 per-pixel Python）。1024×1536 单帧可用，但 sheet 级 3K×2K 图会明显慢。TS 移植时用 typed array 实现反而会比它快几个量级。
2. **过度设计区**：pixel-perfect 子系统（pitch 检测、runlen 交叉验证、kCentroid、共享 palette、grid snap，extract.py:791-1610）占 extract.py 一半篇幅，是纯像素艺术场景专用；curation webview、breathe、frame interpolation、方向锚链等是游戏动画专用。对 Web 贴纸/icon 场景全部无关。
3. **高度归一化的副作用**：per-cell 按主图高度缩放到同一 target_height，弯腰/蹲姿会被放大（sheet-slicing.md:76-78 自己承认 trade-off）。贴纸场景每个 subject 本就形态各异，不应套用「身高一致」假设。
4. **质心归格的盲区**：component 质心落在哪格就归哪格——若主体严重偏心（长尾甩进邻格），质心可能过界归错格；debris rule 也只认「触界 + <30%」这一个特征。代码里没有处理「质心在两格交界」的 tie-break 测试。
5. **RGB 路径的 key-tint 假设**：`tint(subject)≈0` 对暖色主体不严格成立（皮肤 tint 略高于 0），靠 `_SPILL_MIN_TINT=40` 和 fringe_delta=18 两道闸防误伤；换成非标准 key 色（如主体品牌色做 matte）公式依然成立但 guardrail 常数要重调。
6. strip 的 seed 阈值 `max(120, 20%)`、satellite 15% padding 等常数是角色动画调出来的，贴纸的多主体面积差异更大（小 icon vs 大贴纸同 sheet），20% 面积 seed 阈值可能把小贴纸整张贴成 satellite。

---

## 2. agent-sprite-forge 深度分析

### 2.1 Matte / chroma key 策略

**固定 magenta `#FF00FF`**，无自动选 key（SKILL.md:67 "Keep the solid #FF00FF background rule unless the user explicitly wants a different processing workflow"）。

`remove_bg_magenta`（generate2dsprite.py:389-434）：

1. **硬切**：RGB 欧氏距离 < `threshold`（默认 **100**）→ 置透明（401-402 行）。
2. **Border flood fill 二段擦除**：从四边 BFS，经过已透明像素继续扩散；遇到距离 < `edge_threshold`（默认 **150**，比硬切宽）的不透明像素也擦除并继续扩散（413-433 行）。作用：吃掉比 threshold 宽但连通到外边界的 AA fringe，同时靠连通性保护主体内部的近 magenta 色。

**没有 soft alpha、没有 unmix、没有 despill**。抠完的边缘是 binary staircase；色染（magenta spill）留在像素里不管。另有 `clean_edges`（generate2dsprite.py:444-466）：对**每帧 crop 的四边各 3px 深**内，凡近黑（RGB 全 <40）或近 magenta（距离 <150）的像素一律擦除——这是个粗暴的「边缘消毒」，防 grid 框线/边缘残留，代价是可能误咬贴边的深色主体。`trim_border`（437-441 行）先每帧裁掉 4px。

撞 key 防护完全在 prompt 层：references/prompt-rules.md:9-21 要求纯平 magenta、无渐变，但没有 sprite-gen 那样的「主体色分析 → 选 key」机制。generate2dmap 的 extract_prop_pack.py 是同一份 remove_bg_magenta 的复制（extract_prop_pack.py:26-66），threshold/edge_threshold 同样 100/150。

### 2.2 网格几何切分

**纯等分**（`split_grid` generate2dsprite.py:908-1112）：`cell_width = width // cols`，逐格 crop（928-934 行）。**没有跨格 connected components、没有质心归格、没有粘连劈分**。Components 只在格内使用：`component_mode=largest` 时取格内最大连通域作为主体 bbox（943-945 行，防 detached ember/碎屑污染 anchor），`all` 时用整帧 bbox。`min_component_area` 过滤碎屑（默认 1，由 agent 调）。

对「溢出到邻格」的态度是**预防 + 拒绝**，而不是切分时修复：

- Prompt 层：containment 契约（prompt-rules.md:86-101——任何部位不得跨格界、四边留 magenta margin、主体只占中央 60-70% safe area）；1xN 单行 strip 对角色类资产直接禁用（SKILL.md:56——横向 drift 风险）。
- QC 层：源格 bbox 触边（`source_edge_touch`）与输出触边分开记录（split_grid.py:953-958, 1021-1039），strict 模式下触边即失败、要求重生成（cmd_process 1425-1432 行）；`--allow-source-edge-touch` 只豁免「视觉上完整、只是 AA 轮廓贴边」的情况，永不豁免输出触边/paste clamp/空帧（SKILL.md:285-287）。

溢出物的兜底是 `paste_clamped` 检测（split_grid 1013-1018 行：对齐后贴回 cell 画布时若位置被 clamp 到边界内，记录 `paste_clamped=true`），strict QC 下同样 fail（1419-1420 行）。

### 2.3 QA / 失败处理

- **QC 元数据结构化程度较高**：每帧记录 `is_empty / source_edge_touch / output_edge_touch / paste_clamped / body_area_fraction / anchor_source / scale_*`（split_grid 964-987 行），汇总 `qc_summary`：`body_scale_cv`（√area 的变异系数）、`anchor_x/y_std`、`output_subject_height_mean`（`summarize_frame_qc` 580-628 行）。
- **结构化失败分类**（不是错误码枚举，而是命名列表）：`edge_touch_frames / source_edge_touch_frames / output_edge_touch_frames / empty_frames / paste_clamped_frames`（cmd_process 1335-1349 行）+ 数值 gate：`--max-body-scale-cv 0.08`、`--max-anchor-y-std 0.05`、scale profile drift 默认 0.10（1399-1410, 1433-1458 行）。任一违反 → `raise ValueError("QC failed: …")`（1460 行），失败原因人读 + agent 可读。
- **失败处置哲学写死在 SKILL 里**：gate 失败 = 重生成信号，**禁止用逐帧缩放归一化掩盖生成漂移**（SKILL.md:307 "do not hide generation drift with per-frame scale normalization"）；`--allow-source-edge-touch` 这类豁免必须经视觉确认后显式给出。
- **跨 action 一致性**：scale profile 机制（generate2dsprite.py:789-890）——从验收过的 idle/run 写出 `character-scale-profile.json`，后续 action 处理时 profile 覆盖本地 scale/anchor 参数，drift 超限即 fail。贴纸场景可类比「同 sheet 内主体尺度一致性」，但跨资产 profile 是游戏动作集专用。

### 2.4 生成侧稳定化

这是该仓库最用心的部分：

- **几何 layout guide**（make_layout_guide.py）：确定性画出 rows×cols 网格——黑框（4px）+ 蓝色 safe-area 框（默认 margin 52px，42-43 行）+ 灰色虚线十字中线。使用契约（prompt-rules.md:47-61）：guide 只传达 slot 数/间距/居中/padding，"Do not reproduce the guide: no visible boxes, no safe-area rectangles, no center marks, no labels, no borders, no guide background"。适用判断也写了：prop pack、tileset、长动作序列推荐用；四方向行走表默认**不用**（guide 会让 directional pose 过于保守，prompt-rules.md:53）。
- **Character anchor sheet**（make_anchor_layout.py:14-65）：把一张验收过的 master frame 抠图、缩放到 cell 的 0.66 高 / 0.72 宽（75-76 行）、脚线贴 cell 高的 0.82 处（77 行），平铺进每个 cell，magenta 底（52 行）。生成时同时给 master（锁 identity/style）和 anchor sheet（锁 slot 位置/相机距离/尺度/脚线），"change only the poses"（prompt-rules.md:74-82）。这是比抽象框 guide 更强的构图约束——直接给模型看「每个格子里的主体应该多大、站在哪」。
- **Sheet 形态纪律**（SKILL.md:41-67, prompt-rules.md:248-273）：一张 raw sheet 只承载一个 action family；4x4/5x5 混合动作 atlas 禁止 raw 生成，只能后组装；宽/碰撞类 prop 禁止进方形 pack（重分类而非放松 QC）；攻击动作的 slash/muzzle/impact 拆成独立 FX sheet，防宽 bbox 把身体缩没。
- **Shared silhouette envelope**（SKILL.md:61, prompt-rules.md:177）：对长条形生物，prompt 锁定「躯干中心固定 + 全部 pose 收进中央 70-72% 盒子 + 用原地压缩/伸展表达扑咬」——比泛泛的 "generous margin" 可靠。

### 2.5 整体架构

Agent（Codex）承担全部创意决策：资产计划、prompt 手写（SKILL.md:46 明确禁止用 prompt-builder 脚本生成创意 prompt）、layout guide 使用判断、QC 结果审读、重试决策。脚本是**故意的低层原语**（SKILL.md:206-217 "The processor is intentionally low-level. The agent chooses…" "Use the processor to gather QC metadata, not to make aesthetic decisions for you"）。确定性代码：chroma 清理、等分切、largest component、缩放/对齐、QC 度量、GIF/sheet 导出、Godot 元数据。生成用宿主内建 `image_gen`，脚本零网络。

### 2.6 局限与坑

1. **抠图质量显著弱于 sprite-gen**：binary alpha 边缘锯齿；无 despill——magenta 色染会直接留在贴纸边缘（Web 贴纸放在任意背景上，紫边是致命伤）；`clean_edges` 的「近黑即擦」（RGB<40）对深色描边的主体是**咬色源**——贴纸/icon 普遍带深色 outline，这一层如果照搬会直接吃掉描边。
2. **等分切分的根本假设是「生成完全守规矩」**：一切跨格问题都推给重生成。重生成是有成本且非确定性的；sprite-gen 的 components 归格则提供了「切分侧容错」。纯等分在网格轻微漂移时会把主体切两半。
3. **anchor 估计**（estimate_anchor，generate2dsprite.py:547-577）用 y 的 85/98 百分位 + 中央 20-80% 带 median x——人形脚线专用，对任意形状贴纸无意义。
4. **逐像素纯 Python + 部分 numpy**：速度差；且 `remove_bg_magenta` 的 flood fill 用 `set` 存 visited 坐标，内存和速度都不好。
5. **QC gate 阈值（0.08 CV / 0.05 anchor std）是 grounded humanoid 专用**，SKILL 自己也反复强调不要外推到 jump/FX/生物（SKILL.md:307）。
6. skill 与脚本之间有重复实现（extract_prop_pack.py 复制了 remove_bg_magenta），漂移风险。
7. 大量规则（asset_type/action/bundle 分类学、modes.md）是游戏资产管线语义，与 Web 贴纸无关。

---

## 3. 横向对照（与本课题直接相关的技术点）

| 技术点 | sprite-gen | agent-sprite-forge | 对本课题的启示 |
|---|---|---|---|
| 硬切阈值 | 96（RGB 距离） | 100（硬切）+150（flood 连通域内） | 同一量级；「主阈值严 + 连通域内宽」双阈值值得借鉴 |
| Soft alpha | 有，已知 key 精确解混 k=tint/tint_key | 无 | **sprite-gen 独占，必采纳** |
| Despill | trapped-spill 聚类 despill（保 alpha）；YCbCr 路径有投影式 despill | 无 | 必采纳；聚类门限（0.5% 主体、min tint 40）防误伤的设计可直接搬 |
| 防撞色 | 4 候选 key + 主体采样打分 + erase-radius gate；SKILL 层决策表 | 无（固定 magenta，靠 prompt） | 采纳 sprite-gen 的 auto 选 key 思路，但简化为「从 matte 采样反推 + 主体距离检查」 |
| 格子定位 | whole-sheet components → 质心归格；>1.5 格劈分 + 格内 relabel；debris rule | 纯等分 + 触边即拒绝 | **sprite-gen 的归格机制是解决溢出/粘连的正解**；agent-sprite-forge 的「源格触边检测」作为 QA 信号互补 |
| 碎屑/噪声 | noise_min 60px；debris_fraction 0.30 且触界才丢；strip 侧 seed 20% + satellite 15% padding 合并 | min_component_area（格内） | debris rule 的「触界+占比」双条件比纯面积阈值精细，采纳 |
| 空格 | raise（fail loud） | empty_frames 记录 + strict fail | 一致：fail loud |
| 失败处理 | score 0-100 + 缺陷→自然语言 hint 映射 + bounded correction loop | 命名缺陷列表 + 数值 gate + raise | hint 映射（把测量缺陷翻译成 regen prompt 片段）是很妙的 agent 协作接口 |
| 构图稳定 | layout guide（框+safe area+火柴人）+ base anchor 双参考 | layout guide + character anchor sheet（更强） | anchor sheet 对「同角色贴纸 sheet」直接适用；guide 的 "不复制 guide 线" prompt 契约也适用 |
| alpha 参与连通 | >16 | >0 | >16 更稳（soft fringe 不粘连） |

---

## 4. 独立结论：向 TypeScript 本地图像库移植的建议

目标库画像：零网络、零凭证、确定性像素处理，输入是「统一纯色 matte 的 AI 网格图」，输出单张透明 PNG。agent（skill 层）负责 prompt、选 key、看图决策、重生成。

### 采纳（按优先级）

**P0 — 直接构成本库核心：**

1. **已知 key 的 soft-alpha unmix（sprite-gen despill_color/unmix_key_blend，extract.py:58-94）**。`k = tint_score(px)/tint_score(key)`，α′=α(1−k)，RGB′=(C−k·K)/(1−k)。约 40 行 typed-array 实现，直接消灭 binary staircase 和色边。这是两个仓库里性价比最高的单点技术。配套 key-tint 线性算子（keyed 通道均值 − unkeyed 通道均值）对 magenta/green/cyan 天然成立。
2. **四段分类 + key-depth BFS（extract.py:98-196）**：keyed / subject / in-band / out-of-band 一次分类，Chebyshev BFS（unmix_reach=4，in-band 限深 2）界定 unmix 范围，主体内部 byte-identical。 guardrail 思想（深层像素绝不碰）必须保留。
3. **Whole-sheet connected components + 质心归格 + 跨格劈分 + 格内 relabel + debris rule（slice_sheet.py 全文件）**。这正是「网格漂移/溢出/粘连」的确定性容错层，比纯等分强一个档次。常数可原样起步：noise_min 60、debris_fraction 0.30、MERGED_SPAN_FACTOR 1.5、alpha>16 参与连通、触界 ±2px。
4. **Trapped-spill 聚类 despill（extract.py:198-251）**：小簇（≤0.5% 主体）+ 强 tint（>40）才修正、只改色不改 alpha。解决「matte 色渗进主体内部」。
5. **Fail-loud 契约**：空格/凑不齐 component → 抛错，把 regen 决策还给上层（slice_sheet.py:217 的模式）。本库不吞失败。

**P1 — 显著提升健壮性，第二阶段做：**

6. **Border flood fill 宽阈值二段擦除**（agent-sprite-forge 的 100/150 双阈值，或 sprite-gen YCbCr 路径的 flood，extract.py:381-425）：吃 matte 轻微不均匀 + 保护主体内部近 key 色。注意接在 soft-alpha unmix **之前**作为背景归属判定，而不是像 agent-sprite-forge 那样当最终抠图。
7. **Matte 色自检测：边角采样 + 直方图 mode（非 mean）**（extract.py:309-378）：让库能在 agent 未声明 matte 色时从图角反推；声明值与检测值偏差大时上报 warning。实现时不需要整个 YCbCr 路径，RGB 空间量化 bin 取 mode 即可。
8. **结构化缺陷报告**：每 cell 输出 `{empty, source_edge_touch, component_count, chroma_adjacent_pixels, debris_dropped, soft_alpha_ratio}` 等命名字段 + sheet 级汇总——对齐 agent-sprite-forge 的 QC metadata 风格和 sprite-gen 的 inspect metrics。再附一层「缺陷 → regen prompt 建议」的映射表（score.py:54-98 的思路），但这层建议放 skill/markdown 而不是库代码里。
9. **Anchor sheet 构图法（skill 层知识，不是库代码）**：把已验收的 foundation/master 帧按 cell 平铺作构图模板——对「同角色 3×3 贴纸 sheet」是比纯文字 prompt 强得多的 grid 保证。写进 RepoChan skill，连同 "guide 不得出现在成图" 的 prompt 契约（prompt-rules.md:55-61）。

**P2 — 视需要做：**

10. **Projection-profile + DP 最优切分（segment.py）**：粘连严重时的兜底。但它的假设是「单行时间序列帧」，贴纸 sheet 是 2D 网格且主体形态无关，需要改造成 2D 版（行带投影 + 列投影两轮）。优先级低：components 归格已覆盖大部分情况。
11. **YCbCr chrominance 平面 matte（extract.py:254-581）**：只在输入可能是 JPEG/渐变 matte 时才有意义。本库契约是「生成 PNG、平色 matte」，RGB 路径已够；把 smoothstep(24→72) + key 方向投影 despill（0.92）记下来作为 degraded-input 备用模式即可。

### 拒绝（不适用或有害）

- **agent-sprite-forge 的 clean_edges「近黑即擦」**（generate2dsprite.py:444-466）：会直接咬掉贴纸/icon 的深色描边。其「边框消毒」需求由 P1-6 的 flood fill 更精确地覆盖。
- **身高归一化 / feet baseline / alpha-centroid 对齐**（slice_sheet.py 的 target_height 缩放、extract.py 的 fit_to_cell 对齐族、agent-sprite-forge 的 estimate_anchor）：全是「同一人形角色多 pose」假设。贴纸 sheet 里每个 cell 是不同主体，各自的 bbox 裁切 + 按 cell 居中即可，绝不能跨 cell 统一缩放——那会把「大贴纸/小 icon」的有意尺寸差抹掉。
- **pixel-perfect 子系统**（pitch 检测、kCentroid、共享 palette、grid snap，extract.py:791-1610）：纯像素艺术场景，与 Web 贴纸无关。
- **逐帧/跨 action scale profile、Godot 元数据、bundle 分类学**：游戏运行时契约，无关。
- **把 QC 数值 gate（0.08 CV 等）当通用默认**： grounded-humanoid 专用；贴纸场景用「空 cell、触边、chroma 残留、debris 比例」这类与形态无关的指标即可。

### 需要改造的点

- **常数体系重新标定**：sprite-gen 的常数（96/180/18/4/0.005/60/0.30/1.5）是在 1024×1536 角色 cell 上调出来的。贴纸 sheet 分辨率、主体面积差异更大，应把这些做成带默认值的参数，并用 synthetic sheet 测试（test_slice_sheet.py 的合成图夹具模式——纯 PIL 画矩形模拟 overhang/粘连/碎屑，非常适合移植成 TS 的单测）锁定行为。
- **「溢出归属」策略语义反转**：sprite-gen 的 debris rule 默认「触界小碎片是邻居的，丢掉」。贴纸场景可能更希望「溢出物随主体走、裁切在格界但保留 alpha」或「整体归还质心所在格」。建议库提供 `overflow: "keep-with-owner" | "drop-at-border"` 开关，默认 keep-with-owner（贴纸宁可带一点溢出，也不要缺胳膊）。
- **性能**：Python 逐像素循环在 TS 里用 `Uint8ClampedArray` + 单 pass 分类 + 迭代式 flood/BFS 实现，对 3K×2K sheet 应在百毫秒级；注意避免 agent-sprite-forge 那种 `set` 存坐标的写法。
- **多 key 支持**：sprite-gen 固定 4 候选。本库应接受任意 `#RRGGBB` key（tint 算子对「单通道 255、其余 0」类纯色成立；对非纯 key 退化为 RGB 距离 + 比例解混），auto 检测按 P1-7 做。

### 验证方式（已做的外部对照）

- 解混公式 `observed = (1−k)·F + k·B` 即标准 compositing 逆运算（[Stanford CS148 compositing 讲义](https://graphics.stanford.edu/courses/cs148-07/lectures/imaging/imaging.pdf)）；color unmixing 用于 green-screen keying 见 [Aksoy et al., TOG 2016](http://yaksoy.github.io/papers/TOG16-keying.pdf)；alpha 生成与 spill 修正分离是业界标准分工（[Natron Despill 文档](https://media.readthedocs.org/pdf/natron/master/natron.pdf)，依据 Steve Wright《Digital Compositing for Film and Video》§4.5）。sprite-gen 的实现与这些一致，但其「key-depth 限深 + 聚类门限」两道防误伤闸是针对 AI 生成图的原创工程增量，值得保留。
