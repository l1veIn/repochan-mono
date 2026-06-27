# Task 03: Page 测试套件

## 目标

为 Task 01-02 添加的 Page 类型、schema、entity 函数编写完整的 vitest 测试。

## 文件

- 创建: `packages/core/test/page.test.ts`

## 前置

- Task 01 完成（类型 + schema 已定义）
- Task 02 完成（entity 函数已实现）

## 上下文：现有测试模式

参考 `packages/core/test/entities.test.ts` 的模式：
- 用 `beforeEach` 创建 tmpdir + initProtocol + 写入 analysis/current.json 和 persona/current.json 作为前置
- 用 `afterEach` 清理 tmpdir
- 每个测试用 `it('描述', async () => { ... })`
- 用 `expect` 断言
- 需要 order + result 的测试：先 createOrders → setOrderStatus → createOrderResult

参考 `packages/core/test/validation-gate.test.ts` 的模式：
- 测试 schema 校验拒绝错误输入时用 `expect(() => ...).rejects.toThrow()`

## Step 1: 创建测试文件

创建 `packages/core/test/page.test.ts`：

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createOrUpdatePage,
  checkPageAssets,
  collectAssetRefs,
  readPage,
} from '../src/entities.js';
import { createOrders, setOrderStatus, createOrderResult } from '../src/entities.js';
import { initProtocol } from '../src/protocol/index.js';
import type { PageData } from '../src/types.js';

describe('page entity and asset checking', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-page-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    // seed analysis + persona (required by createOrUpdatePage)
    const r = path.join(projectRoot, '.repochan');
    await fs.writeFile(
      path.join(r, 'analysis', 'current.json'),
      JSON.stringify({ summary: 'test analysis' }),
    );
    await fs.writeFile(
      path.join(r, 'persona', 'current.json'),
      JSON.stringify({ name: 'Test', rolePrompt: 'test' }),
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ── Helper: minimal valid page data ──────────────────────

  function makePage(overrides?: Partial<PageData>): PageData {
    return {
      title: 'Test Project',
      description: 'A test landing page.',
      theme: {
        primary: '#3B82F6',
        secondary: '#10B984',
        accent: '#F59E0B',
        background: '#FFFFFF',
        style: 'modern',
      },
      sections: [
        {
          type: 'hero',
          variant: 'centered',
          content: {
            headline: 'Test Headline',
            subheadline: 'Test subheadline.',
            primaryCta: { label: 'Get Started', href: '#start' },
          },
        },
        {
          type: 'cta',
          variant: 'centered',
          content: {
            heading: 'Try it now',
            buttonText: 'Get Started',
            buttonHref: '#start',
          },
        },
      ],
      ...overrides,
    };
  }

  // ── Helper: seed an order with an image result ───────────

  async function seedOrderWithImage(
    orderId: string,
    versionId: string,
    imageName: string,
  ) {
    await createOrders(projectRoot, {
      orders: [{
        orderId,
        requestType: 'new_asset',
        assetType: 'hero_illustration',
        brief: { intent: 'test', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [],
        acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, orderId, 'approved');

    // Create a fake image file
    const versionDir = path.join(projectRoot, '.repochan', 'orders', orderId, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, imageName), 'fake-image-data');
    await fs.writeFile(
      path.join(versionDir, 'meta.json'),
      JSON.stringify({ versionId, createdAt: new Date().toISOString(), files: [imageName] }),
    );

    await createOrderResult(projectRoot, {
      orderId,
      versionId,
      files: [imageName],
      tool: 'manual',
      allowUnapprovedOrder: true,
    });
  }

  // ── createOrUpdatePage tests ─────────────────────────────

  it('createOrUpdatePage writes page to current.json and versions/', async () => {
    const result = await createOrUpdatePage(projectRoot, {
      page: makePage(),
    });

    expect(result.data.schemaVersion).toBe('repochan.page.v1');
    expect(result.data.generatedAt).toBeTruthy();
    expect(result.versionName).toMatch(/^\d{4}-\d{2}-\d{2}T.*page\.json$/);

    const current = await readPage(projectRoot);
    expect(current).toBeDefined();
    expect(current!.title).toBe('Test Project');

    const versions = await fs.readdir(path.join(projectRoot, '.repochan', 'pages', 'versions'));
    expect(versions.length).toBe(1);
    expect(versions[0]).toBe(result.versionName);
  });

  it('createOrUpdatePage rejects overwrite without flag', async () => {
    await createOrUpdatePage(projectRoot, { page: makePage() });

    await expect(
      createOrUpdatePage(projectRoot, { page: makePage() }),
    ).rejects.toThrow('already exists');
  });

  it('createOrUpdatePage archives previous version on overwrite', async () => {
    await createOrUpdatePage(projectRoot, {
      page: makePage({ title: 'V1' }),
    });
    await createOrUpdatePage(projectRoot, {
      page: makePage({ title: 'V2' }),
      overwrite: true,
    });

    const current = await readPage(projectRoot);
    expect(current!.title).toBe('V2');

    const versions = await fs.readdir(path.join(projectRoot, '.repochan', 'pages', 'versions'));
    // Should have: original + previous archive + new version
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const previousArchive = versions.find((v) => v.includes('previous'));
    expect(previousArchive).toBeDefined();
  });

  it('createOrUpdatePage rejects invalid section type', async () => {
    const badPage = makePage();
    (badPage.sections[0] as any).type = 'nonexistent';

    await expect(
      createOrUpdatePage(projectRoot, { page: badPage }),
    ).rejects.toThrow();
  });

  it('createOrUpdatePage rejects invalid variant for section type', async () => {
    const badPage = makePage();
    (badPage.sections[0] as any).variant = 'nonexistent-variant';

    await expect(
      createOrUpdatePage(projectRoot, { page: badPage }),
    ).rejects.toThrow();
  });

  // ── collectAssetRefs tests ───────────────────────────────

  it('collectAssetRefs extracts refs from hero and gallery', () => {
    const page = makePage({
      sections: [
        {
          type: 'hero',
          variant: 'split-right',
          content: {
            headline: 'H',
            subheadline: 'S',
            primaryCta: { label: 'Go', href: '#' },
            image: { orderId: 'ord-a-001', file: 'hero.png' },
          },
        },
        {
          type: 'gallery',
          variant: 'grid',
          content: {
            images: [
              { orderId: 'ord-b-001', file: 'a.png' },
              { orderId: 'ord-b-001', file: 'b.png' },
            ],
          },
        },
        {
          type: 'cta',
          variant: 'centered',
          content: { heading: 'H', buttonText: 'Go', buttonHref: '#' },
        },
      ],
    });

    const refs = collectAssetRefs(page.sections);
    expect(refs.length).toBe(3);
    expect(refs[0].orderId).toBe('ord-a-001');
    expect(refs[1].file).toBe('a.png');
    expect(refs[2].file).toBe('b.png');
  });

  it('collectAssetRefs extracts image refs from features items', () => {
    const page = makePage({
      sections: [
        {
          type: 'features',
          variant: 'grid-3',
          content: {
            items: [
              { title: 'A', description: 'd', image: { orderId: 'ord-x-001', file: 'icon-a.png' } },
              { title: 'B', description: 'd' },
              { title: 'C', description: 'd', image: { orderId: 'ord-x-001', file: 'icon-c.png' } },
            ],
          },
        },
      ],
    });

    const refs = collectAssetRefs(page.sections);
    expect(refs.length).toBe(2);
  });

  it('collectAssetRefs extracts logo from footer', () => {
    const page = makePage({
      sections: [
        {
          type: 'footer',
          variant: 'standard',
          content: {
            brand: 'Test',
            logo: { orderId: 'ord-logo-001', file: 'logo.png' },
          },
        },
      ],
    });

    const refs = collectAssetRefs(page.sections);
    expect(refs.length).toBe(1);
    expect(refs[0].file).toBe('logo.png');
  });

  // ── checkPageAssets tests ────────────────────────────────

  it('checkPageAssets returns ok when all assets exist', async () => {
    await seedOrderWithImage('ord-hero-001', 'v1', 'hero.png');

    const page = makePage({
      sections: [
        {
          type: 'hero',
          variant: 'split-right',
          content: {
            headline: 'H',
            subheadline: 'S',
            primaryCta: { label: 'Go', href: '#' },
            image: { orderId: 'ord-hero-001', file: 'hero.png' },
          },
        },
      ],
    });

    const result = await checkPageAssets(projectRoot, page);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(1);
    expect(result.resolved.length).toBe(1);
    expect(result.missing.length).toBe(0);
  });

  it('checkPageAssets reports missing order', async () => {
    const page = makePage({
      sections: [
        {
          type: 'hero',
          variant: 'split-right',
          content: {
            headline: 'H',
            subheadline: 'S',
            primaryCga: { label: 'Go', href: '#' },
            image: { orderId: 'ord-nonexist-001', file: 'hero.png' },
          },
        },
      ],
    });

    const result = await checkPageAssets(projectRoot, page);
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBe(1);
    expect(result.missing[0].error).toContain("not found");
  });

  it('checkPageAssets reports missing file with available alternatives', async () => {
    await seedOrderWithImage('ord-hero-002', 'v1', 'different-name.png');

    const page = makePage({
      sections: [
        {
          type: 'hero',
          variant: 'split-right',
          content: {
            headline: 'H',
            subheadline: 'S',
            primaryCta: { label: 'Go', href: '#' },
            image: { orderId: 'ord-hero-002', file: 'wrong-filename.png' },
          },
        },
      ],
    });

    const result = await checkPageAssets(projectRoot, page);
    expect(result.ok).toBe(false);
    expect(result.missing[0].error).toContain('wrong-filename.png');
    expect(result.missing[0].error).toContain('Available image files');
    expect(result.missing[0].error).toContain('different-name.png');
  });

  it('checkPageAssets returns ok=true when page has no asset refs', async () => {
    const page = makePage(); // hero centered, no image; cta centered, no image
    const result = await checkPageAssets(projectRoot, page);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(0);
  });

  it('checkPageAssets handles multiple refs across sections', async () => {
    await seedOrderWithImage('ord-multi-001', 'v1', 'a.png');
    await seedOrderWithImage('ord-multi-001', 'v1', 'b.png');
    await seedOrderWithImage('ord-multi-002', 'v1', 'c.png');

    const page = makePage({
      sections: [
        {
          type: 'gallery',
          variant: 'grid',
          content: {
            images: [
              { orderId: 'ord-multi-001', file: 'a.png' },
              { orderId: 'ord-multi-001', file: 'b.png' },
              { orderId: 'ord-multi-002', file: 'c.png' },
            ],
          },
        },
      ],
    });

    const result = await checkPageAssets(projectRoot, page);
    expect(result.ok).toBe(true);
    expect(result.total).toBe(3);
  });
});
```

## Step 2: 运行测试

```bash
cd ~/Desktop/repochan-mono
pnpm --filter @repochan/core test
```

预期：60 (existing) + 12 (new page tests) = 72 tests passed。

如果有测试失败，修复代码（不是修测试——除非测试本身有 typo）。

## Step 3: 提交

```bash
cd ~/Desktop/repochan-mono
git add packages/core/test/page.test.ts
git commit -m "test(page): add comprehensive page entity and asset check tests"
```
