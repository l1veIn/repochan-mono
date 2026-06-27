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
    const orderFile = path.join(projectRoot, '.repochan', 'orders', orderId, 'order.json');
    if (!(await fs.access(orderFile).then(() => true).catch(() => false))) {
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
    }

    const versionDir = path.join(projectRoot, '.repochan', 'orders', orderId, 'versions', versionId);
    if (await fs.access(versionDir).then(() => true).catch(() => false)) {
      await fs.writeFile(path.join(versionDir, imageName), 'fake-image-data');
      return;
    }

    const sourceDir = path.join(projectRoot, 'source-assets', orderId, versionId);
    await fs.mkdir(sourceDir, { recursive: true });
    const sourceFile = path.join(sourceDir, imageName);
    await fs.writeFile(sourceFile, 'fake-image-data');
    await createOrderResult(projectRoot, {
      orderId,
      versionId,
      files: [sourceFile],
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
