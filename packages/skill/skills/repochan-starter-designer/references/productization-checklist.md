# Starter 产品化检查表

## 脱模

- 搜索并移除项目名、仓库 URL、角色名、专属口号、订单路径和测试数据。
- 将文案、theme、资产路径分别集中到 `i18n/`、`site.json`、`assets.json`。
- 展示层无颜色字面量、散落文案和环境专属绝对路径。
- 用中性 fallback 替代原项目身份；fallback 不依赖 `.repochan/orders/`。

## 合同

- `repochan/starter.json` 是唯一 manifest，id/name/version 与目录一致。
- 每个 required content path 和 locale 都可由 `starter configure` 表达。
- 每个 asset slot 声明 template、引用角色、fallback output 与 postprocess。
- 每个 section 保留 composition、baked/live layers、safe zone 和 responsive 规则。
- Transition 与共享 pattern 用参数表达，不依赖原页面截图或 orderId。
- 网格资产使用 `publications[]` + 独占 `extract-grid`，并验证所有具名 PNG、逐项状态与 QA 后才可设为 required。

## 可运行性

- Pull 后不生成订单也能用 fallback 安装与构建。
- 默认、窄屏和宽屏无溢出；键盘、locale、外链与 reduced-motion 可用。
- L3/L4 保持语义化、可访问、可翻译；L4 不烘焙进图片。
- 资产缺失或后处理失败时不写半完成 `ready` 状态。

## 验证

- 运行 `repochan starter validate <id>`。
- 运行 source starter build。
- Pull 到临时实例，执行 configure、validate 与 build 的 smoke test。
- 记录 validator 尚未覆盖的 section coverage、transition、production browser evidence 等 gap；pattern seam 和网格投影应使用现有原子命令验证。
