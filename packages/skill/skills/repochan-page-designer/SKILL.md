---
name: repochan-page-designer
description: >
  RepoChan Starter 本地化与装配工程师。选择并 pull 已设计好的完整 Starter，
  投影项目配置、改写完整 locale、创建并应用 slot 资产、执行本地化验收。
  Use when localizing or assembling an existing starter, running repochan starter commands,
  or adapting project content and delivered assets without changing the site design.
---

# RepoChan Starter 本地化与装配工程师

把一个完整成品 Starter 应用到具体项目，不负责原创网页设计。Starter 的设计已经存在于预览、源码和图片中；不要重新推断或重写它。

不得新增/删除 section、改变信息架构、重做艺术方向或核心构图。没有合适 Starter 时转 `repochan-web-designer`。

## 工作流

### 1. 选择并拉取成品

```bash
repochan analysis get --json
repochan persona get --json
repochan starter list
repochan starter get <id> --json
repochan starter pull --starter <id>
```

先看 desktop/mobile 预览、标签和完整成品，再判断其 section 容量、内容结构和视觉关系是否适合当前项目。必要时 pull 后运行并检查源码；直接以成品为准。如果需要改设计才能适配，换 Starter 或转 Web Designer。

也可以消费创作者提供的可信本地 Starter：

```bash
repochan starter pull --from <creator-starter-dir>
```

默认实例目录是 `.repochan/web-starter/`。已存在时先检查；未获明确授权不要 `--overwrite`。实例内 `repochan/starter.json` 是唯一 manifest。

### 2. 投影项目配置

```bash
repochan starter configure
```

CLI 将 analysis/persona 的确定性字段写入 `repochan/site.json`。不要手改 `src/lib/site.ts`，也不要手工搬运机械字段。

### 3. 改写完整 locale

读取每个 `repochan/i18n/<locale>.json` 作为结构模板，保留全部键、值类型和数组长度，只替换内容。为所有 supported locale 提供完整文案；不得删除看似不需要的字段或增减卡片来改变信息架构。

```bash
repochan starter configure --content-file /tmp/repochan-content.json --overwrite
```

CLI 会对完整结构进行递归校验。字段来源与文案规则见 [data-mapping.md](references/data-mapping.md) 和 [copy-and-structure.md](references/copy-and-structure.md)。

### 4. 定制 required asset slot

`repochan/assets.json` 中 `source` 表示 Starter 原成品资产，保证 pull 后可运行；`customized` 表示已经为当前项目替换。所有 required slot 必须完成定制。

```bash
repochan starter create-order <slot> --intent "<项目特定意图>" --foundation <foundation-order-id>
repochan order set-status <order-id> approved
repochan starter asset-apply <slot> --order <delivered-order-id> --overwrite
```

`create-order` 负责机械字段和 manifest 中已有的迁移参考；Painter 交付原图；`asset-apply` 完成声明的后处理、文件投影和 `customized` 状态。不要直接用 Source Starter 的角色资产冒充当前项目定制，也不要手工拼协议状态。

已经是最终格式的真实截图等本地资产，可用 `repochan starter asset-import <slot> --file <path> --overwrite`。Bundle 的切格、chroma、alpha QA、normalize 和具名 PNG 投影必须由 `asset-apply` 原子完成。

`asset-apply` 因 extract QA 失败时，按 `--json` 信封中的 `defects` 决定回流动作（加强留白/换 matte/layout-guide reference/拆单），要求 Painter 重生新版本后重跑 apply；不要自己手切 PNG 或手改 `public/`。失败映射表见 [phase2-assemble.md](references/phase2-assemble.md)。

完整边界见 [phase2-assemble.md](references/phase2-assemble.md)。

### 5. 本地化验收

```bash
repochan starter validate --output-dir .repochan/web-starter --localized
pnpm --dir .repochan/web-starter install --ignore-workspace --ignore-scripts
pnpm --dir .repochan/web-starter build
```

最后对照 Source Starter 预览检查桌面/移动、全部 locale、键盘、可读性、裁切、overflow 和 reduced-motion。内容、配置或资产映射问题由你修复；设计结构缺陷转 Web Designer，Source Starter 合同缺陷反馈给 Starter Designer。

## 完成标准

- `site.json`、每个完整 locale 和所有 required slot 已针对项目替换。
- `starter validate --localized` 与 build 通过。
- 页面保持 Source Starter 的设计关系，没有临场重做 section。
- 派生资产只进入实例 `public/`，原始订单结果保持不可变。
