import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createOrders,
  createOrderResult,
  listOrders,
  listOrderResults,
  readOrderResult,
  setOrderStatus,
} from '../src/entities.js';
import { initProtocol } from '../src/protocol/index.js';

describe('entities (core business operations)', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-entities-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    // seed minimal upstream artifacts so createOrders / createOrderResult pass their checks
    const r = path.join(projectRoot, '.repochan');
    await fs.writeFile(path.join(r, 'analysis', 'current.json'), JSON.stringify({ summary: 'test' }));
    await fs.writeFile(
      path.join(r, 'persona', 'current.json'),
      JSON.stringify({ coreConcept: 'test persona' })
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('createOrders writes normalized orders', async () => {
    const res = await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-test-001',
          requestType: 'new_asset',
          assetType: 'readme-hero',
          brief: { intent: 'hero image', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });

    expect(res.orders.length).toBe(1);
    expect(res.orders[0].status).toBe('draft');
    expect(res.orders[0].schemaVersion).toBe('repochan.asset-order.v1');

    const listed = await listOrders(projectRoot);
    expect(listed.orders.some((o: any) => o.orderId === 'ord-test-001')).toBe(true);
  });

  it('setOrderStatus updates status in place', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-test-002',
          requestType: 'new_asset',
          assetType: 'icon',
          brief: { intent: 'icon', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });

    await setOrderStatus(projectRoot, 'ord-test-002', 'approved');

    const after = await listOrders(projectRoot);
    const afterOrder = after.orders.find((o: any) => o.orderId === 'ord-test-002');
    expect(afterOrder.status).toBe('approved');
  });

  it('createOrderResult enforces approved orders and writes result version', async () => {
    // first create and approve an order
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-001',
          requestType: 'new_asset',
          assetType: 'readme-hero',
          brief: { intent: 'main hero', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-001', 'approved');

    const sourceFile = path.join(projectRoot, 'hero.png');
    await fs.writeFile(sourceFile, 'fake image bytes');
    const res = await createOrderResult(projectRoot, {
      orderId: 'ord-asset-001',
      versionId: 'v1',
      files: [sourceFile],
      promptBrief: 'clean hero image',
      generationPrompt: 'full generation prompt sent to image_generate',
      revisedPrompt: 'provider revised prompt',
      setCurrent: true,
    });

    expect(res.order.currentVersion).toBe('v1');
    expect(res.version.versionId).toBe('v1');
    expect(res.checkedOrder.orderId).toBe('ord-asset-001');

    const metaPath = path.join(projectRoot, '.repochan', 'orders', 'ord-asset-001', 'versions', 'v1', 'meta.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    expect(meta.files).toEqual(['hero.png']);
    expect(meta.generationPrompt).toBe('full generation prompt sent to image_generate');
    expect(meta.revisedPrompt).toBe('provider revised prompt');
    expect(await fs.readFile(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-001', 'versions', 'v1', 'hero.png'), 'utf8')).toBe('fake image bytes');
    expect(res.order.orderAsset.versions[0].generationPrompt).toBe('full generation prompt sent to image_generate');
    expect(res.order.orderAsset.versions[0].revisedPrompt).toBe('provider revised prompt');

    const listed = await listOrderResults(projectRoot, 'ord-asset-001');
    expect(listed.results.length).toBe(1);
    expect(listed.results[0].generationPrompt).toBe('full generation prompt sent to image_generate');
    const read = await readOrderResult(projectRoot, 'ord-asset-001', 'v1');
    expect(read.version.generationPrompt).toBe('full generation prompt sent to image_generate');
  });
});
