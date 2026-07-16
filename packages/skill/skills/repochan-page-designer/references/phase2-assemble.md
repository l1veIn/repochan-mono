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

已经是最终格式的仓库截图或真实 proof 走 `starter asset-import <slot> --file <path>`：CLI 原子复制到声明的 scalar output，并在 `assets.json` 记录 local-file SHA-256 provenance。Bundle/publications 仍必须走 `asset-apply`。

## 验收顺序

1. `repochan starter validate --output-dir .repochan/web-starter --localized`
2. `pnpm --dir .repochan/web-starter build`
3. 浏览器检查默认 locale 与其他 locale。
4. 检查窄屏、宽屏、键盘焦点、外链和 reduced-motion。
5. 核对角色身份、文字留白、CTA 可读性以及图片裁切。

不要通过降低 required slot、伪造 `customized` 或删除 locale 来绕过 validator。
