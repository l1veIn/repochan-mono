# Task 02: Protocol 路径 + Entity 函数 + 资产检查

## 目标

在 core 包中实现 Page 的存取逻辑和资源可用性检查。包含三个部分：
1. protocol/index.ts 添加 pages 目录路径
2. entities.ts 添加 `createOrUpdatePage` entity 函数
3. entities.ts 添加 `collectAssetRefs` + `checkPageAssets` 资产检查函数

## 文件

- 修改: `packages/core/src/protocol/index.ts`
- 修改: `packages/core/src/entities.ts`

## 前置

- Task 01 已完成（PageData 等类型和 schema 已定义）

## 上下文：现有模式

### createOrUpdatePersona 的模式（entities.ts）

`createOrUpdatePage` 必须跟 `createOrUpdatePersona` 完全同模式：

1. 调用 `validateInput("page.create", PageCreateParamsSchema, params)` 做 schema gate
2. 调用 `initProtocol(projectRoot)` 初始化目录
3. 调用 `requireAnalysis(projectRoot)` 检查前置
4. 检查 overwrite / versionPrevious 逻辑
5. 版本归档到 versions/ 目录
6. 写入 current.json
7. 返回 `{ versionName, data }`

### resolveOrderReferences 的模式（entities.ts 516-542 行）

`checkPageAssets` 的路径解析逻辑要参考 `resolveOrderReferences`：
- 先 `readOrder` 读 order
- 用 `order.currentVersion` 或显式 `versionId`
- 用 `orderVersionDir` 拼路径
- 用 `exists` 检查目录是否存在
- 用 `fs.readdir` 列文件

### protocol/index.ts 的模式

看现有 `requireAnalysis`、`requirePersona`、`requireInterview` 的实现——都是检查 current.json 是否存在，不存在就 throw。

## Step 1: protocol/index.ts 添加 pages 路径

### 1a. initProtocol 中添加 pages 目录

在 `packages/core/src/protocol/index.ts` 的 `initProtocol` 函数中，找到 `dirs` 数组，在 `"orders"` 之后添加 `"pages"` 和 `"pages"` 的 versions 子目录：

找到这段代码：
```typescript
  const dirs = [
    r,
    path.join(r, "analysis", "versions"),
    path.join(r, "interview", "versions"),
    path.join(r, "persona", "versions"),
    path.join(r, "orders"),
  ];
```

改为：
```typescript
  const dirs = [
    r,
    path.join(r, "analysis", "versions"),
    path.join(r, "interview", "versions"),
    path.join(r, "persona", "versions"),
    path.join(r, "orders"),
    path.join(r, "pages", "versions"),
  ];
```

### 1b. inspectProtocol 中添加 pages 检查

在 `inspectProtocol` 函数中，在 `summary.orders = []` 之后、`summary.assets = []` 之前，添加 pages 相关检查：

```typescript
  summary.page = await exists(path.join(r, "pages", "current.json"));
  try {
    summary.pageVersions = (await fs.readdir(path.join(r, "pages", "versions"))).filter((f) => f.endsWith(".json"));
  } catch {
    summary.pageVersions = [];
  }
```

### 1c. 添加 requirePage 函数

在 `requireInterview` 和 `hasInterview` 函数之后，添加：

```typescript
export async function requirePage(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "pages", "current.json");
  if (!(await exists(file))) throw new Error("Missing .repochan/pages/current.json. Use action='page.create' first.");
}

/** Check whether a page artifact exists, without throwing. */
export async function hasPage(projectRoot: string) {
  const file = path.join(protocolRoot(projectRoot), "pages", "current.json");
  return exists(file);
}
```

## Step 2: entities.ts 添加 Page entity 和资产检查

在 `packages/core/src/entities.ts` 文件**末尾**（在 `resolveOrderReferences` 函数之后）追加以下代码。

### 2a. 先在文件顶部添加 import

在 entities.ts 文件顶部的 import 区域，找到从 `./types.js` 的 import，添加 Page 相关类型：

找到：
```typescript
import type { AssetOrder, InterviewQuestion, InterviewReport, InterviewResponse, JsonObject, OrderReference, OrderResultVersion, OrderStatus } from "./types.js";
```

改为：
```typescript
import type { AssetOrder, AssetRef, InterviewQuestion, InterviewReport, InterviewResponse, JsonObject, OrderReference, OrderResultVersion, OrderStatus, PageData, PageSection } from "./types.js";
```

然后在从 `./schemas/index.js` 的 import 中添加 PageCreateParamsSchema：

找到：
```typescript
import {
  InterviewAppendParamsSchema,
  InterviewCreateParamsSchema,
  OrderCreateParamsSchema,
  OrderCreateResultParamsSchema,
  OrderAddRevisionParamsSchema,
  OrderSetCurrentResultParamsSchema,
  OrderSetStatusParamsSchema,
  OrderUpdateParamsSchema,
  PersonaCreateParamsSchema,
  PersonaUpdateParamsSchema,
} from "./schemas/index.js";
```

改为：
```typescript
import {
  InterviewAppendParamsSchema,
  InterviewCreateParamsSchema,
  OrderCreateParamsSchema,
  OrderCreateResultParamsSchema,
  OrderAddRevisionParamsSchema,
  OrderSetCurrentResultParamsSchema,
  OrderSetStatusParamsSchema,
  OrderUpdateParamsSchema,
  PageCreateParamsSchema,
  PersonaCreateParamsSchema,
  PersonaUpdateParamsSchema,
} from "./schemas/index.js";
```

然后在从 `./protocol/index.js` 的 import 中添加 `requirePage`：

找到：
```typescript
import {
  exists,
  initProtocol,
  orderJsonPath,
  orderVersionDir,
  orderVersionsDir,
  protocolRoot,
  readJson,
  readJsonIfExists,
  relativeProtocolPath,
  requireAnalysis,
  requirePersona,
  stamp,
  stampForPath,
  writeJson,
} from "./protocol/index.js";
```

改为（在 `requirePersona` 之后加 `requirePage`）：
```typescript
import {
  exists,
  initProtocol,
  orderJsonPath,
  orderVersionDir,
  orderVersionsDir,
  protocolRoot,
  readJson,
  readJsonIfExists,
  relativeProtocolPath,
  requireAnalysis,
  requirePersona,
  requirePage,
  stamp,
  stampForPath,
  writeJson,
} from "./protocol/index.js";
```

### 2b. 在文件末尾追加 entity 函数

```typescript
// ---------------------------------------------------------------------------
// Page entity (static page generation)
// ---------------------------------------------------------------------------

export async function createOrUpdatePage(projectRoot: string, params: JsonObject) {
  validateInput("page.create", PageCreateParamsSchema, params);
  await initProtocol(projectRoot);
  await requireAnalysis(projectRoot);

  if (!isPlainObject(params.page)) throw new Error("params.page is required and must be an object.");
  const current = path.join(protocolRoot(projectRoot), "pages", "current.json");
  const currentExists = await exists(current);
  const overwrite = params.overwrite === true;
  const versionPrevious = params.versionPrevious !== false;
  if (currentExists && !overwrite) {
    throw new Error(".repochan/pages/current.json already exists. Use page.get, or ask the user before page.create with overwrite=true.");
  }

  const ts = stampForPath();
  if (currentExists && overwrite && versionPrevious) {
    await writeJson(path.join(protocolRoot(projectRoot), "pages", "versions", `${ts}-previous.json`), await readJson(current), false);
  }

  const provenance = params.page.provenance ?? params.provenance ?? { tool: "repochan", action: "page.create" };
  const data: PageData = {
    ...(params.page as PageData),
    schemaVersion: "repochan.page.v1",
    generatedAt: stamp(),
    provenance,
  };

  const slug = typeof params.slug === "string" ? params.slug : "page";
  if (!/^[a-z0-9-]+$/.test(slug)) throw new Error("slug must match ^[a-z0-9-]+$.");
  const versionName = `${ts}-${slug}.json`;
  await writeJson(path.join(protocolRoot(projectRoot), "pages", "versions", versionName), data, false);
  await writeJson(current, data, currentExists || overwrite);
  return { versionName, data };
}

// ---------------------------------------------------------------------------
// Page asset reference checking
// ---------------------------------------------------------------------------

export type AssetResolution = {
  ref: AssetRef;
  exists: boolean;
  resolvedPath?: string;
  error?: string;
};

export type AssetCheckResult = {
  ok: boolean;
  total: number;
  resolved: AssetResolution[];
  missing: AssetResolution[];
};

/**
 * Extract all AssetRefs from a page's sections.
 * Walks every section type and collects image references.
 */
export function collectAssetRefs(sections: PageSection[]): AssetRef[] {
  const refs: AssetRef[] = [];
  for (const s of sections) {
    switch (s.type) {
      case "hero":
        if (s.content.image) refs.push(s.content.image);
        break;
      case "gallery":
        refs.push(...s.content.images);
        break;
      case "features":
        for (const item of s.content.items) {
          if (item.image) refs.push(item.image);
        }
        break;
      case "footer":
        if (s.content.logo) refs.push(s.content.logo);
        break;
    }
  }
  return refs;
}

/**
 * Check whether all image assets referenced by a page are resolvable.
 *
 * For each AssetRef:
 *  1. Read the referenced order
 *  2. Determine versionId (explicit or currentVersion)
 *  3. Check the version directory exists
 *  4. Check the specific file exists in that directory
 *
 * Returns ok=false if any asset is missing, with detailed error messages
 * that include available files for guided correction.
 */
export async function checkPageAssets(
  projectRoot: string,
  page: PageData,
): Promise<AssetCheckResult> {
  const refs = collectAssetRefs(page.sections);
  const resolved: AssetResolution[] = [];
  const missing: AssetResolution[] = [];

  for (const ref of refs) {
    // 1. Read order
    const order = await readOrder(projectRoot, ref.orderId).catch(() => null);
    if (!order) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' not found`,
      });
      continue;
    }

    // 2. Resolve versionId
    const versionId = ref.versionId ?? order.currentVersion;
    if (!versionId) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' has no currentVersion and no versionId specified`,
      });
      continue;
    }

    // 3. Check version directory exists
    const dir = orderVersionDir(projectRoot, ref.orderId, versionId);
    if (!(await exists(dir))) {
      missing.push({
        ref,
        exists: false,
        error: `order '${ref.orderId}' has no result version '${versionId}'`,
      });
      continue;
    }

    // 4. Check file exists in version directory
    const filePath = path.join(dir, ref.file);
    if (!(await exists(filePath))) {
      const available = (await fs.readdir(dir).catch(() => []))
        .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()));
      missing.push({
        ref,
        exists: false,
        error: `file '${ref.file}' not found in ${ref.orderId}/${versionId}/. Available image files: [${available.join(", ")}]`,
      });
      continue;
    }

    resolved.push({ ref, exists: true, resolvedPath: filePath });
  }

  return {
    ok: missing.length === 0,
    total: refs.length,
    resolved,
    missing,
  };
}

/**
 * Read the current page artifact.
 */
export async function readPage(projectRoot: string): Promise<PageData | undefined> {
  const file = path.join(protocolRoot(projectRoot), "pages", "current.json");
  if (!(await exists(file))) return undefined;
  return readJson(file) as Promise<PageData>;
}
```

## Step 3: 验证编译

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/core build
```

预期：编译通过。

## Step 4: 验证现有测试

```bash
pnpm --filter @repochan/core test
```

预期：60/60 passed（不应受影响——只添加了新函数，没改老代码的行为）。

## Step 5: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/core/src/protocol/index.ts packages/core/src/entities.ts
git commit -m "feat(page): add page entity, asset reference checking to core"
```
