# Task 08: Pi Tool Wiring — Page Actions

## 目标

在 `packages/pi/extensions/unified.ts` 中新增 4 个 page action：
- `page.create` — 创建/更新页面 JSON
- `page.get` — 读取当前或指定版本的页面
- `page.check_assets` — 检查页面引用的图片资源是否齐全
- `page.render` — 渲染页面为静态 HTML（调用 page-renderer）

## 文件

- 修改: `packages/pi/extensions/unified.ts`
- 修改: `packages/pi/package.json`（添加 `@repochan/page-renderer` 依赖）

## 前置

- Task 01-07 已完成（core page types + entity + page-renderer 包）

## 上下文

`unified.ts` 的模式：
1. 顶部 import core 函数，加 `as core` 前缀
2. `ActionSchema` 是 Type.Union of Type.Literal — 新 action 加在这里
3. 每个 action 有一个 async handler 函数
4. `registerRepoChan` 的 `switch` 里分派到 handler
5. `promptGuidelines` 数组里有每个 action 的说明文档

## Step 1: 修改 package.json 添加依赖

在 `packages/pi/package.json` 的 `dependencies` 中添加：

```json
"@repochan/page-renderer": "workspace:*"
```

然后运行 `pnpm install`。

## Step 2: 修改 unified.ts — 添加 import

在 `unified.ts` 文件顶部的 import 区，在 `@repochan/core` 的 import 块中，添加以下 core 函数到已有的 import 列表（按字母序插入）：

```typescript
  createOrUpdatePage as coreCreateOrUpdatePage,
  readPage as coreReadPage,
  checkPageAssets as coreCheckPageAssets,
  collectAssetRefs as coreCollectAssetRefs,
```

然后在 `@repochan/core` import 之后，添加 page-renderer 的 import：

```typescript
import { renderPage as rendererRenderPage, assetKey as rendererAssetKey } from "@repochan/page-renderer";
```

## Step 3: 修改 ActionSchema

在 `ActionSchema` 的 `Type.Union` 数组中，在 `Type.Literal("protocol.append_version")` 之后添加：

```typescript
  Type.Literal("page.create"),
  Type.Literal("page.get"),
  Type.Literal("page.check_assets"),
  Type.Literal("page.render"),
```

## Step 4: 添加 handler 函数

在 `unified.ts` 文件中，在 `findFoundation` 函数之后（`getBuiltinTemplatesDir` 之前），添加以下 handler 函数：

```typescript
// ---------------------------------------------------------------------------
// Page actions
// ---------------------------------------------------------------------------

async function createPage(ctx: ExtensionContext, params: JsonObject) {
  const { versionName, data } = await coreCreateOrUpdatePage(ctx.cwd, params);
  return ok(`Wrote page current and page/versions/${versionName}`, data);
}

async function getPage(ctx: ExtensionContext, params: JsonObject) {
  const versionId = typeof params.versionId === "string" && params.versionId
    ? params.versionId.replace(/\.json$/, "")
    : undefined;

  if (versionId) {
    const file = path.join(root(ctx.cwd), "pages", "versions", `${versionId}.json`);
    const data = await readJson(file);
    return ok(JSON.stringify(data, null, 2), data);
  }

  const data = await coreReadPage(ctx.cwd);
  if (!data) throw new Error("No page found. Use action='page.create' first.");
  return ok(JSON.stringify(data, null, 2), data);
}

async function checkPageAssets(ctx: ExtensionContext, params: JsonObject) {
  // Accept either a page object directly, or read current.json
  let page;
  if (isPlainObject(params.page)) {
    page = params.page;
  } else {
    const current = await coreReadPage(ctx.cwd);
    if (!current) throw new Error("No page found. Use action='page.create' first, or pass params.page.");
    page = current;
  }

  const result = await coreCheckPageAssets(ctx.cwd, page);

  if (result.ok) {
    return ok(`All ${result.total} asset(s) resolved.`, result);
  }

  const lines = result.missing.map((m) => `  ✗ ${m.ref.orderId}/${m.ref.versionId ?? "current"}/${m.ref.file}: ${m.error}`);
  return ok(`Missing ${result.missing.length} of ${result.total} asset(s):\n${lines.join("\n")}`, result);
}

async function renderPageToDisk(ctx: ExtensionContext, params: JsonObject) {
  // 1. Read page (current or from params)
  const page = isPlainObject(params.page) ? params.page : await coreReadPage(ctx.cwd);
  if (!page) throw new Error("No page found. Use action='page.create' first, or pass params.page.");

  // 2. Check assets first — refuse to render if missing
  const assetCheck = await coreCheckPageAssets(ctx.cwd, page);
  if (!assetCheck.ok) {
    const missing = assetCheck.missing
      .map((m) => `  ${m.ref.orderId}/${m.ref.versionId ?? "current"}/${m.ref.file}: ${m.error}`)
      .join("\n");
    throw new Error(
      `Cannot render: ${assetCheck.missing.length} of ${assetCheck.total} asset(s) are missing.\n${missing}\n\n` +
      "Fix these first: create orders via action='order.create', generate images via Painter, then re-render.",
    );
  }

  // 3. Build resolved assets map
  const resolvedAssets = new Map<string, string>();
  for (const r of assetCheck.resolved) {
    const key = rendererAssetKey(r.ref);
    resolvedAssets.set(key, `assets/${r.ref.file}`);
  }

  // 4. Render
  const result = rendererRenderPage(page, resolvedAssets);

  // 5. Write output files
  const outputDir = params.outputDir
    ? path.resolve(ctx.cwd, params.outputDir as string)
    : path.join(root(ctx.cwd), "pages", "site");

  const { promises: fs } = await import("node:fs");
  await fs.mkdir(path.join(outputDir, "assets"), { recursive: true });

  // Write index.html
  await fs.writeFile(path.join(outputDir, "index.html"), result.html, "utf8");

  // Copy asset files
  const copied: string[] = [];
  for (const r of assetCheck.resolved) {
    const dest = path.join(outputDir, "assets", r.ref.file);
    await fs.copyFile(r.resolvedPath!, dest);
    copied.push(`assets/${r.ref.file}`);
  }

  return ok(
    `Rendered page to ${path.relative(ctx.cwd, outputDir) || outputDir}\n` +
    `  index.html (${result.html.length} bytes)\n` +
    `  assets/ (${copied.length} files: ${copied.join(", ")})`,
    { outputDir, html: result.html.length, assets: copied },
  );
}
```

## Step 5: 在 switch 语句中添加 case

在 `registerRepoChan` 的 `async execute` 函数的 `switch` 语句中，在 `case "protocol.append_version"` 之后、`default` 之前，添加：

```typescript
        case "page.create":
          return createPage(ctx, params);
        case "page.get":
          return getPage(ctx, params);
        case "page.check_assets":
          return checkPageAssets(ctx, params);
        case "page.render":
          return renderPageToDisk(ctx, params);
```

## Step 6: 更新 promptGuidelines

在 `promptGuidelines` 数组末尾（最后一个 guideline 之后），添加以下条目：

```typescript
      "page.create params: { page, slug?, overwrite=false, versionPrevious=true, provenance? }. Requires analysis. Creates or replaces .repochan/pages/current.json with a Page JSON artifact and writes a versioned copy to pages/versions/. The page object must contain: title, description, theme { primary, secondary, accent, background, style }, and sections (an array of section objects with type+variant+content). If page exists, ask before overwrite=true.",
      "page.get params: optional { versionId }. Without versionId, reads .repochan/pages/current.json. With versionId, reads pages/versions/<versionId>.json.",
      "page.check_assets params: optional { page? }. Without params.page, reads the current page and checks whether all image AssetRefs across all sections are resolvable to actual files in .repochan/orders/. Returns ok=true if all resolved, or lists missing assets with available file suggestions. Use this BEFORE page.render to verify the page is ready.",
      "page.render params: optional { page?, outputDir? }. Renders the page to static HTML. Without params.page, reads current page. Checks assets first — REFUSES to render if any are missing (run page.check_assets first). Output goes to outputDir (default: .repochan/pages/site/). Produces index.html + copies of all referenced image files to assets/. The output is a zero-JS static site that can be deployed anywhere.",
      "Page section types: navbar (simple, with-cta), hero (centered, split-right, split-left, full-bg), features (grid-2, grid-3, grid-4), stats (row, grid), gallery (grid, masonry), cta (centered, banner), footer (standard, minimal). Each section has a content object whose shape depends on type+variant.",
      "Page AssetRef: { orderId, versionId?, file, alt? }. References an image file inside .repochan/orders/<orderId>/versions/<versionId>/. When versionId is omitted, uses the order's currentVersion. The renderer copies referenced files to the output assets/ directory.",
      "Page Designer two-phase workflow: Phase 1 — design page structure + audit assets (use page.check_assets); create orders for missing images via order.create, generate via Painter. Phase 2 — when all assets are delivered, assemble final Page JSON via page.create, then render via page.render.",
```

## Step 7: 更新工具 description

在 `registerRepoChan` 的 `description` 字符串中，将末尾的：
```
...and protocol-safe reads/writes/versioning. Use action strings like 'analysis.run', 'interview.create', 'persona.get', 'order.list', and 'order.create_result' with action-specific params.
```
改为：
```
...protocol-safe reads/writes/versioning, and static page generation. Use action strings like 'analysis.run', 'interview.create', 'persona.get', 'order.list', 'order.create_result', and 'page.render' with action-specific params.
```

## Step 8: 安装依赖 + 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm install
pnpm --filter @repochan/pi build
```

如果 pi 没有 build script（只有 tsc），则直接运行 tsc：

```bash
cd packages/pi && npx tsc --noEmit
```

预期：编译通过。

## Step 9: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/pi/extensions/unified.ts packages/pi/package.json pnpm-lock.yaml
git commit -m "feat(pi): add page.create, page.get, page.check_assets, page.render actions"
```
