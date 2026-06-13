import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createOrders,
  createAssetVersion,
  listOrders,
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

    // seed minimal upstream artifacts so createOrders / createAssetVersion pass their checks
    const r = path.join(projectRoot, '.repochan');
    await fs.writeFile(path.join(r, 'analysis.json'), JSON.stringify({ summary: 'test' }));
    await fs.writeFile(
      path.join(r, 'persona', 'current.json'),
      JSON.stringify({ coreConcept: 'test persona' })
    );
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('createOrders writes normalized orders and optional batch', async () => {
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
      batchId: 'batch-demo-001',
    });

    expect(res.orders.length).toBe(1);
    expect(res.orders[0].status).toBe('draft');
    expect(res.orders[0].schemaVersion).toBe('repochan.asset-order.v1');

    const listed = await listOrders(projectRoot);
    expect(listed.orders.some((o: any) => o.orderId === 'ord-test-001')).toBe(true);
  });

  it('setOrderStatus updates status and archives previous', async () => {
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

    const before = await listOrders(projectRoot);
    const beforeFile = before.orders.find((o: any) => o.orderId === 'ord-test-002');

    await setOrderStatus(projectRoot, 'ord-test-002', 'approved');

    const after = await listOrders(projectRoot);
    const afterOrder = after.orders.find((o: any) => o.orderId === 'ord-test-002');
    expect(afterOrder.status).toBe('approved');

    // version archive should exist
    const versionsDir = path.join(projectRoot, '.repochan', 'orders', 'versions', 'ord-test-002');
    const hasVersion = await fs.readdir(versionsDir).then((f) => f.length > 0).catch(() => false);
    expect(hasVersion).toBe(true);
  });

  it('createAssetVersion enforces approved orders and writes manifest + version', async () => {
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

    const res = await createAssetVersion(projectRoot, {
      assetId: 'asset-readme-hero',
      orderIds: ['ord-asset-001'],
      files: ['hero.png'],
      promptBrief: 'clean hero image',
      setCurrent: true,
    });

    expect(res.manifest.currentVersion).toBeDefined();
    expect(res.version.versionId).toBeDefined();
    expect(res.checkedOrders.length).toBe(1);

    // manifest file should exist
    const manifestPath = path.join(projectRoot, '.repochan', 'assets', 'asset-readme-hero', 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    expect(manifest.assetId).toBe('asset-readme-hero');
    expect(manifest.versions.length).toBeGreaterThan(0);
  });
});
