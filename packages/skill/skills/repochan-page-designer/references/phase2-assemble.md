# 资产应用与站点验收

## 资产状态

- `repochan/starter.json`: 声明 slot、fallback output、partial order 和 postprocess。
- `repochan/assets.json`: 记录页面实际消费的 `src/status/orderId/versionId`。
- `.repochan/orders/`: 保存 Painter 原始交付和版本历史。
- `.repochan/web-starter/public/`: 保存 starter 本地化与装配阶段的派生文件。

`source` 资产让 scaffold 始终可构建，但它仍属于 Starter 的原项目；`customized` 才表示当前项目已完成替换。判断能否复用订单时，同时检查 asset type、templateId、项目身份、构图和 foundation 引用；不要只因文件存在就跳过视觉判断。

## CLI 边界

```bash
repochan starter create-order <slot> --intent "..." --foundation <order-id>
repochan starter asset-apply <slot> --order <order-id> [--result-version <version-id>] --overwrite
```

`asset-apply` 必须整体成功后才更新 `assets.json`。发生后处理错误时，保留现有站点输出和状态，不要手工拼出半完成状态。只有调试 image-edit 本身时才直接调用 `repochan image edit`。

**派生归档（审计）**：apply 成功后，postprocess 链中每个 `keep` ≠ `false` 的步骤会把产物归档到 `.repochan/orders/<order-id>/derived/<时间戳>--<slot>/`，并向该订单的 `derived.json`（`repochan.order-derived.v1`）追加一条 entry（slot / starter / resultVersion / steps / artifacts）。索引为 append-only，重复 apply 追加而不覆盖。需要回答「这个订单派生出过哪些产物、在哪」时读 `derived.json`，不要去猜 `public/` 的当前状态。归档失败不会阻断 apply（输出里带 `derivedWarning`）。

已经是最终格式的仓库截图或真实 proof 走 `starter asset-import <slot> --file <path>`：CLI 原子复制到声明的 scalar output，并在 `assets.json` 记录 local-file SHA-256 provenance。Bundle/publications 仍必须走 `asset-apply`。

## Extract QA 失败回流

`asset-apply` 因 extract QA 失败时以非零退出；带 `--json` 运行时 stdout 输出结构化信封（人类可读模式下只打印摘要，排查时务必带 `--json` 重跑）：

```json
{
  "ok": false,
  "error": "ExtractError",
  "command": "starter asset-apply",
  "slot": "<slot>",
  "orderId": "<order-id>",
  "resultVersion": "<version-id>",
  "defects": [{ "code": "empty_cell", "key": "empty", "index": 3, "detail": "..." }],
  "strategyUsed": "equal-cell",
  "pipeline": "v1",
  "matteColor": "#00ff00",
  "matteColorSource": "auto-sampled",
  "qa": null
}
```

处理流程：解析信封 → 按下表决定重生动作 → 要求 Painter 重生新版本（Painter 侧的 prompt 改法见 repochan-painter 的 `references/extract-qa-retry.md`）→ 对新 version 重跑 `asset-apply`。不要手切 PNG、不要手工改 `public/` 或 `assets.json` 来绕过失败。

| defect code | 回流动作 |
|------|------|
| `edge_touch` / `sheet_edge_touch` / `empty_cell` / `frame_count_mismatch` | 阻断 apply；要求 Painter 加强 cell margin / 整表留白，并把 layout-guide 作为 gen reference（`sheet_edge_touch` 与 `edge_touch` 同一指引）；同一订单连续 2 次失败建议拆单（按 row 或 single-cell 分别开订单） |
| `matte_subject_collision` / `chroma_residue` | 报告信封中的 `matteColor` 与 `metric`，要求 Painter 换 matte hex 或加强 flat matte prompt |
| `foreground_ratio_low` / `foreground_ratio_high` | 报告 metric；要求 Painter 检查内容过稀或 matte 污染 |
| `ml_unavailable` / `invalid_options` | 修 ML 环境或 starter 的 extract-grid args；不要盲目重生 |

再次强调：只有调试 image-edit 本身时才直接调用 `repochan image edit`（见上「CLI 边界」），正常回流永远走 Painter 重生 + `asset-apply` 重跑。

## 验收顺序

1. `repochan starter validate --output-dir .repochan/web-starter --localized`
2. `pnpm --dir .repochan/web-starter build`
3. 浏览器检查默认 locale 与其他 locale。
4. 检查窄屏、宽屏、键盘焦点、外链和 reduced-motion。
5. 核对角色身份、文字留白、CTA 可读性以及图片裁切。

不要通过降低 required slot、伪造 `customized` 或删除 locale 来绕过 validator。
