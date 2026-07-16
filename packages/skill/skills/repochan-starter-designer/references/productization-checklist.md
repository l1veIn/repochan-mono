# Starter 产品化检查表

## 成品保真

- 保留项目名、仓库 URL、角色名、专属口号、全部源码和原始视觉资产。
- Pull 后无需订单或 RepoChan 协议历史即可安装、构建并看到原始成品。
- `site.json`、完整 `i18n/`、`assets.json` 是明确的本地化入口。
- 展示层无硬编码颜色；可配置文案不在组件中重复散落。

## 最小迁移合同

- `repochan/starter.json` 是唯一 manifest；目录内不维护第二份快照。
- desktop/mobile 预览都被声明且文件存在。
- 所有 supported locale 与 default locale 的键、类型和数组长度完全一致。
- `assets.json` 中原成品资产使用 `source`；每个 required slot 都有可运行的 source output。
- 每个 slot 只描述下游要替换的资产、目标路径、订单模板、迁移参考和确定性后处理。
- Bundle 使用具名 `publications[]` + 唯一 `extract-grid`；Page Designer 不需手工切格或拼状态。

## 复杂烘焙图

- 原始成品图保持完整，不被低信息参考覆盖。
- 只有确实存在身份泄露风险时才创建迁移参考。
- 参考图保留必要构图、姿态、轮廓和安全留白，并移除不该迁移的角色身份、文字、背景细节与渲染风格。
- 降采样质量问题回到对应 template 提示词修复，不增加无人消费的 schema 字段。

## 验证与贡献

- `repochan starter validate --output-dir <creator-starter-dir>` 通过。
- source starter build 通过，桌面/移动、locale、键盘、链接、overflow、裁切和 reduced-motion 经浏览器检查。
- `starter pull --from` 到全新临时目录后，validate 与 build 再次通过。
- 创作者保管产物；官方收录使用 PR，并附预览与验证证据。
