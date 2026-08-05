# CLI: 带文字图像资产的确定性流水线 + 周边摩擦

| 字段 | 值 |
|------|-----|
| **Title** | Deterministic Text-Composition for Text-Bearing Image Assets & Surrounding CLI Frictions |
| **Author** | agent 使用反馈 (2026-08-05, RambleDesk social-preview + README banner 工作流) |
| **Date** | 2026-08-05 |
| **Status** | Draft proposal（开放决策中;非已承诺的计划） |
| **Scope** | 社交卡 / README banner 等带文字交付物的生成 → 排版 → 质检链路;顺带三条 CLI 摩擦;**不含** web-designer 分支、不含 Image-edit 的 ML 能力(切图/去背仍归 Page Designer) |
| **Packages (impacted if accepted)** | `packages/cli`(`image edit compose` / `image qa text` / `order update` / `image gen` 端点回退)· `packages/core`(order references 可变性、模板契约)· 模板库(`readme-banner` 系)· `packages/skill`(Painter 文字质检边界) |

---

## 1. Context

### 1.1 触发工作流

对一个 Tauri 桌面项目生产一套社交资产(OG 卡 1200×630 + 中/英 README banner 1400×700)时,实际走完的流程:

1. **Painter 出无文字底图**(`order create` → `image gen --reference <foundation>`),文字**不在**画面里。
2. **本地排版**:我手写 PowerShell System.Drawing 脚本做 cover-crop + 文字叠加(标题/slogan/说明行),产出 PNG。
3. **`image edit compress` → webp**,压到 ≤1MB 门槛。
4. 用户想要"文字画进画面带透视"的版本时,再走**模型渲染文字**的订单,出图后用 OCR 人工核拼写。

### 1.2 实测事实(2026-08-05)

- 步骤 2 全程没有 repochan 命令可用,只能手写脚本。PowerShell 5.1 无 BOM 读 UTF-8 会按 ANSI 解析,**含中文的脚本直接解析失败**(字符串被多字节字节序列截断),每次都要重存为带 BOM 的 UTF-8 再跑 —— 这是纯环境摩擦,但暴露了"文字排版没有一等公民工具"。
- 步骤 4 的拼写核验靠我手搓 Windows `Windows.Media.Ocr`(WinRT 互操作),对发光/风格化文字**不可靠**:模型正确画出的 `RambleDesk` 被 OCR 读成 `O`,中文句号被读成 `0`。核验结论只能是"疑似",最终仍要人类肉眼确认。
- `image edit compress --format webp --quality 85` 表现优秀(1536×768 → 1400×700,~1.8MB → ~110KB,17–19×),**这一步没有摩擦**。
- 默认端点 `127.0.0.1:8787`(本地中转)探活失败,`image gen` 直接报 `fetch failed`;我手动 `--endpoint img-cn-65535` 才出图。`image status` 能看到全部端点,但 gen 不会自动回退。
- 英文 banner 需要把参考从 foundation 换成**已定稿的中文 banner 成品**(保证构图/姿态/透视一致 —— 这是用户的一个好直觉)。但订单 `references` 不可改,只能新建 `ord-ramble-banner-en-002` 并把 `en-001` 置为 `cancelled`,产生一个幽灵订单。
- 模板库落差:`official/readme-banner-21x9` 只渲染 repo 名、固定 1536×1024(3:2);用户要的是"标题 + 主 slogan + 次 slogan"层级 + 高度≤700(2:1)。最终走无模板自定义订单绕过。

### 1.3 产品约束(必须保持)

来自 `ARCHITECTURE.md` / Painter skill:

1. **CLI 是唯一 binding surface** —— 排版/质检若新增,必须是 `repochan image …` 子命令,不开第二个真相源。
2. **确定性操作不带模型调用** —— `image edit` 类工具不得隐式调用生成模型(现有 `layout-guide` 已是先例:确定性渲染,非生成)。
3. **Painter 不做 image-edit 装配** —— 切图、去背、排版归 Page Designer / assembly 阶段;但**文字叠加**目前落在任何角色之外,是空洞。
4. **`generationPrompt` 必须完整落档** —— 质检命令不得绕过 create-result 的存档要求。

### 1.4 Non-goals

- 不做模型渲染中文文字的"正确率保证"(那是模型能力问题,不是 CLI 能承诺的)。
- 不做通用的矢量文本编辑器。
- 不把切片/抠图纳入本方案。

## 2. Options

### O1. `repochan image edit compose` —— 确定性文字排版

吃一个 JSON spec,无模型调用:

```json
{
  "source": "art-1536x768.png",
  "output": "banner-1400x700.png",
  "fit": "cover",
  "width": 1400, "height": 700,
  "texts": [
    { "text": "RambleDesk", "x": 80, "y": 120, "size": 68, "font": "Segoe UI", "weight": "bold", "color": "#2E3A4F" },
    { "text": "把人类封装成 API，提供给 Coding Agent。", "x": 82, "y": 235, "size": 34, "font": "Microsoft YaHei", "weight": "bold", "color": "#4A7FB5" }
  ]
}
```

- 复用/扩展现有 `image edit` 的 crop/resize 逻辑,只新增文字绘制。
- 好处:可复现、可参数化、无 PowerShell 编码坑;OG 卡与 banner 从此是**命令**,不是**一次性脚本**。
- 代价:新增子命令与 JSON schema;需要字体/安全区文档。

### O2. `repochan image qa text` —— 生成图文字拼写质检

```bash
repochan image qa text <img> --expect "RambleDesk" "把人类封装成 API，提供给 Coding Agent。"
```

- 内置 OCR(Windows 用 `Windows.Media.Ocr`,其他平台可插拔),对每个 `--expect` 输出 命中/缺失/疑似错拼。
- 明确输出"OCR 对风格化文字可能误报"的置信提示,不取代人类肉眼,但把"拼写翻没翻车"从玄学变成**可判定的信号**。
- 可挂在 Painter 的 create-result 前,或作为 review-loop 的客观输入。

### O3. `repochan order update-references`(或允许编辑 draft 订单的 references)

- 修正错误参考时避免"新建订单 + cancel 旧订单"的幽灵订单模式。
- 至少允许在 `draft`/`approved` 态改 `references`;改后 `resolve-references` 重新解析。

### O4. `image gen` 多端点自动回退

- 默认端点探活失败时,按 `image status` 的端点列表自动回退到下一个健康端点;回退行为记入日志/输出。
- 至少:失败时提示"默认端点不可用,可用:img-cn-65535",而不是裸 `fetch failed`。

### O5. Slogan-banner 模板(slot 化)

- 新增 readme-banner 变体,槽位为 `title` / `hero_slogan` / `secondary`,并把 `--size` 提升为可覆盖模板尺寸(支持 2:1、1.91:1,而非固定 1536×1024)。
- 缓解"标题 + slogan 层级 + 高宽比"场景对无模板自定义订单的依赖。

## 3. Recommendation

**优先实现 O1 和 O2**,它们把本轮最大的两块手工作业(本地排版、文字核验)变成确定性命令;O3/O4 是小而稳的 CLI 摩擦修补,建议随下一个 image 相关改动一起顺手做;O5 依赖模板库扩展,排在最后。

**触发重新评估的条件:**
- 再有第二套社交/横幅资产要走相同流程,且仍需要手写脚本或手搓 OCR —— 立即把 O1/O2 提上日程。
- 多端点环境(本地中转 + 云端点)成为常态,而默认端点仍频繁不可用 —— O4 升优先级。
- 模板库里出现第二个"想渲文字但现有模板渲不了"的请求 —— O5 升优先级。

**落地形态建议:** O1/O2 为 `packages/cli` 新子命令 + `packages/core` schema;Painter skill 补充"文字排版与文本质检"的职责说明,明确 create-result 前可用 `image qa text` 作为客观检查项。
