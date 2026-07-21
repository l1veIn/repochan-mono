---
name: repochan-starter-designer
description: >
  RepoChan Starter 产品化工程师。把已通过 Gate 2 的完整项目网站原样保真地整理为
  创作者持有、可本地化、可验证、可通过 PR 贡献的 source starter。
  Use when productizing an approved implemented page into a creator-owned starter,
  defining localization slots and migration references, or preparing an official starter contribution.
---

# RepoChan Starter 产品化工程师

把一个真实、完整、已获批的网站变成可交接的 Starter；不重新设计网站，也不把它匿名化。

Starter 是一份仍然属于原项目的完整成品：保留项目名、角色名、仓库 URL、文案和专属资产。正是这些真实内容让选择者能判断设计是否合适，也让 pull 后立即得到可运行的视觉基准。下游 Page Designer 只替换集中配置、完整 locale 和已声明 asset slot；它不需要从额外的“设计 DNA”字段重新推断页面。

你在创作者自己的目录或仓库中产出 Starter。进入 RepoChan 官方 Starter 库必须由创作者提交 PR，并经过维护者审核。

## 三个状态

1. **已批准成品**：Web Designer 交付的 Gate-2-approved 完整网站。
2. **创作者 Source Starter**：保留原项目完整体验，同时补齐最小迁移合同、预览和验证证据。
3. **官方候选**：创作者以 PR 形式提交 Source Starter；合并只代表被官方目录收录，不改变其设计身份。

## 工作流

### 1. 验证输入

按 [approved-page-contract.md](references/approved-page-contract.md) 确认实际页面、桌面/移动实现、全部 locale、资产来源和 Gate 2 结论。仍需改信息架构、视觉方向或 section 时退回 `repochan-web-designer`。

### 2. 保真整理

完整保留获批源码和原始视觉资产，只把下游会替换的机械入口聚合为：

- `repochan/site.json`：项目元信息与主题 token；
- `repochan/i18n/<locale>.json`：页面实际消费的全部文本结构；
- `repochan/assets.json`：当前成品资产，状态为 `source`；
- `repochan/starter.json`：locale、预览、asset slot、订单模板和确定性后处理。

代码从这些入口读取值，展示层不得散落颜色字面量或重复可配置文案。不要删除原项目身份，不要改成中性 fallback，不要删除专属资产，也不要复制一套 schema 已经能从 locale 结构、源码和图片中直接表达的信息。

### 3. 为复杂烘焙图准备迁移参考

原始成品图始终保留为 Source Starter 的可运行资产。迁移参考（asset slot 的 `reference`）不是默认动作——只在确有信息需要传递、且成品图直接交给下游会泄露原角色/文字身份时才创建。先判断参考要传递什么，再决定形态：

- **人物姿态线稿（pose lineart）**：唯一合法用途是**传递人物姿态**，且仅当人物与页面 H3/H4 层元素存在**结构/空间配合关系**时才需要——例如某个 H4 按钮恰好悬在人物手心上方、人物指向某个具体 section 标题、人物坐在某张卡片边缘。此时姿态是页面结构的一部分，下游换角色必须复现，线稿是传递它的最佳中介。线稿**只保留人物**：姿态、肢体位置、视线/指向方向、占位轮廓；去掉一切无关信息（场景、道具细节、面部、衣着、渲染风格）。
- **不需要姿态线稿的情况（大多数）**：人物只是海报式摆放——站在留白旁、悬浮在 hero 里、与页面元素没有结构接触。此时姿态不是关键，cutout 原图 + 文字描述（位置、朝向、留白区）已足够，**不要**为「保险」加线稿：多余的结构信息是噪声，反而约束下游构图自由。
- **场景/构图类参考不是姿态线稿**：需要传递的是场景构图（窗/桌/椅布局、留白区）时，用低信息构图参考（如场景线稿或缩略图），并在 slot description 写明它传递的是构图而非人物姿态；不要套用 pose lineart 模板。

优先通过已有 template 创建订单（姿态线稿用 `official/hero-pose-lineart-extract`）。迁移参考不是成品替代品，也不回写覆盖原始图片。若降采样泄露过多或损失关键信息，应改进 template 提示词，不要扩张 Starter schema 或增加主观打分合同。

资产 slot 只声明下游真正要替换的内容：

- `scalar`：一个 `output`，可带 order、reference 和确定性 postprocess；postprocess 步骤可声明 `keep`（默认 `true`）——`keep ≠ false` 的步骤产物在下游 `asset-apply` 时会归档到订单的 `derived/` 并写入 `derived.json` 索引，纯中间态或超大产物可显式 `keep: false` 省略归档；
- `bundle`：具名 `publications[]` 与唯一 `extract-grid` postprocess，用于 3×3/4×4 等批量角色贴纸。

### 4. 预览、验证与交付

生成 canonical desktop/mobile 预览并在 `repochan/starter.json.previews` 声明。随后运行：

```bash
repochan starter validate --output-dir <creator-starter-dir>
pnpm --dir <creator-starter-dir> build
```

再把 Source Starter 从本地路径 pull 到临时目录，验证交接面：

```bash
repochan starter pull --from <creator-starter-dir> --output-dir <temp-dir>
repochan starter validate --output-dir <temp-dir>
pnpm --dir <temp-dir> build
```

最后按 [productization-checklist.md](references/productization-checklist.md) 做浏览器检查。要进入官方库时，提交包含完整目录和验证证据的 PR；不要绕过贡献边界直接写官方包。

## 完成标准

- 原项目身份、角色、URL、文案、完整源码与原始资产均被保留。
- `site.json`、完整 `i18n/`、`assets.json` 与 slot 合同足以让 Page Designer 机械本地化。
- 复杂烘焙资产在必要时有 template 生成的低信息迁移参考，同时原成品仍可直接运行。
- desktop/mobile 预览、source validate、build 与本地 pull smoke test 通过。
- 产物由创作者持有；官方收录只能走 PR。

## References

- [approved-page-contract.md](references/approved-page-contract.md)：Gate 2 输入合同。
- [productization-checklist.md](references/productization-checklist.md)：保真产品化与交付清单。
