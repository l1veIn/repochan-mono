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

你在创作者自己的目录或仓库中产出 Starter。不要直接修改 `packages/starters/`；进入 RepoChan 官方 Starter 库必须由创作者提交 PR，并经过维护者审核。

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

原始成品图始终保留为 Source Starter 的可运行资产。若复杂 L1/L2/L3 烘焙图会向下游泄露原角色、背景或文字身份，再额外生成低信息迁移参考，供 asset slot 的 `reference` 使用。

优先通过已有 template 创建订单，例如 `official/hero-pose-lineart-extract`：保留姿态、构图、轮廓和留白，降低角色身份、背景细节、材质与渲染风格信息。迁移参考不是成品替代品，也不回写覆盖原始图片。若降采样泄露过多或损失关键构图，应改进 template 提示词，不要扩张 Starter schema 或增加主观打分合同。

资产 slot 只声明下游真正要替换的内容：

- `scalar`：一个 `output`，可带 order、reference 和确定性 postprocess；
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
