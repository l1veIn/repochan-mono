import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {
  createOrders,
  createOrderResult,
  addOrderRevision,
  abortOrderRecovery,
  listOrderRecoveries,
  listOrders,
  listOrderResults,
  readOrderResult,
  setCurrentOrderResult,
  setOrderStatus,
  updateOrder,
  readOrder,
  recoverOrderRecovery,
  persistOrderVersionMetadata,
} from '../src/entities/index.js';
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
    vi.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function snapshotDirectory(dir: string): Promise<Record<string, string>> {
    const snapshot: Record<string, string> = {};
    async function walk(current: string) {
      for (const entry of await fs.readdir(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        const relative = path.relative(dir, absolute).split(path.sep).join('/');
        if (entry.isDirectory()) await walk(absolute);
        else snapshot[relative] = (await fs.readFile(absolute)).toString('base64');
      }
    }
    await walk(dir);
    return snapshot;
  }

  async function anchorTransaction(
    orderId: string,
    transactionId: string,
    kind: 'result_publish' | 'candidate_promotion' | 'version_metadata',
    versionId: string,
    previousVersionId?: string,
  ) {
    const nonce = `test-nonce-${transactionId}`;
    const identities = path.join(projectRoot, '.repochan/orders', orderId, '.transactions');
    await fs.mkdir(identities, { recursive: true });
    await fs.writeFile(path.join(identities, `${transactionId}.json`), `${JSON.stringify({
      schemaVersion: 'repochan.order-transaction-identity.v1', transactionId, orderId, kind, nonce, versionId,
      ...(previousVersionId ? { previousVersionId } : {}),
    }, null, 2)}\n`);
    return nonce;
  }

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

  it('createOrderResult rejects image-gen results without generationPrompt', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-002',
          requestType: 'new_asset',
          assetType: 'icon',
          brief: { intent: 'icon', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-002', 'approved');
    const sourceFile = path.join(projectRoot, 'generated.png');
    await fs.writeFile(sourceFile, 'generated bytes');

    await expect(
      createOrderResult(projectRoot, {
        orderId: 'ord-asset-002',
        versionId: 'v1',
        files: [sourceFile],
        tool: 'image_generate:gpt-image-2',
        promptBrief: 'a short summary only',
        // generationPrompt deliberately omitted — this is the bug we're preventing
        setCurrent: true,
      }),
    ).rejects.toThrow(/generationPrompt is REQUIRED/);

    // also test "image-gen" variant in tool string
    await expect(
      createOrderResult(projectRoot, {
        orderId: 'ord-asset-002',
        versionId: 'v2',
        files: [sourceFile],
        tool: 'image-gen-pi:fal',
        promptBrief: 'another short summary',
        setCurrent: true,
      }),
    ).rejects.toThrow(/generationPrompt is REQUIRED/);
  });

  it('createOrderResult rejects metadata-only or missing-file delivery without changing protocol state', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-evidence',
          requestType: 'new_asset',
          assetType: 'icon',
          brief: { intent: 'observable icon', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-evidence', 'approved');

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-evidence',
      versionId: 'v-empty',
      files: [],
      tool: 'manual-upload',
    })).rejects.toThrow(/files: must not have fewer than 1 items/);

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-evidence',
      versionId: 'v-missing',
      files: ['does-not-exist.png'],
      tool: 'manual-upload',
    })).rejects.toThrow(/does not exist or is not a non-empty regular file/);

    const emptyFile = path.join(projectRoot, 'empty.png');
    await fs.writeFile(emptyFile, '');
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-evidence',
      versionId: 'v-zero-byte',
      files: [emptyFile],
      tool: 'manual-upload',
    })).rejects.toThrow(/non-empty regular file/);

    const reservedFile = path.join(projectRoot, 'meta.json');
    await fs.writeFile(reservedFile, '{"not":"result evidence"}');
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-evidence',
      versionId: 'v-reserved',
      files: [reservedFile],
      tool: 'manual-upload',
    })).rejects.toThrow(/'meta\.json' is reserved/);

    const listed = await listOrders(projectRoot);
    const order = listed.orders.find((item: any) => item.orderId === 'ord-asset-evidence');
    expect(order).toMatchObject({ status: 'approved' });
    expect(order.currentVersion).toBeUndefined();
    await expect(fs.stat(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-evidence', 'versions', 'v-empty'))).rejects.toThrow();
    await expect(fs.stat(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-evidence', 'versions', 'v-missing'))).rejects.toThrow();
    await expect(fs.stat(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-evidence', 'versions', 'v-zero-byte'))).rejects.toThrow();
    await expect(fs.stat(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-evidence', 'versions', 'v-reserved'))).rejects.toThrow();
  });

  it('createOrderResult rejects colliding result basenames before writing a version', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-collision',
          requestType: 'new_asset',
          assetType: 'icon',
          brief: { intent: 'two distinct files', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-collision', 'approved');
    const first = path.join(projectRoot, 'first', 'Icon.png');
    const second = path.join(projectRoot, 'second', 'icon.png');
    await fs.mkdir(path.dirname(first), { recursive: true });
    await fs.mkdir(path.dirname(second), { recursive: true });
    await fs.writeFile(first, 'first');
    await fs.writeFile(second, 'second');

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-collision',
      versionId: 'v1',
      files: [first, second],
      tool: 'manual-upload',
    })).rejects.toThrow(/unique basenames/);
    await expect(fs.stat(path.join(projectRoot, '.repochan', 'orders', 'ord-asset-collision', 'versions', 'v1'))).rejects.toThrow();
  });

  it('createOrderResult overwrite cannot substitute an old file for a missing input with the same basename', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-overwrite',
          requestType: 'new_asset',
          assetType: 'icon',
          brief: { intent: 'replace an icon', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-overwrite', 'approved');
    const sourceFile = path.join(projectRoot, 'first', 'icon.png');
    await fs.mkdir(path.dirname(sourceFile), { recursive: true });
    await fs.writeFile(sourceFile, 'original bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-asset-overwrite',
      versionId: 'v1',
      files: [sourceFile],
      tool: 'manual-upload',
    });

    const missingSameBasename = 'icon.png';
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-overwrite',
      versionId: 'v1',
      files: [missingSameBasename],
      tool: 'manual-upload',
      overwrite: true,
      allowUnapprovedOrder: true,
    })).rejects.toThrow(/does not exist or is not a non-empty regular file/);

    const recorded = path.join(projectRoot, '.repochan', 'orders', 'ord-asset-overwrite', 'versions', 'v1', 'icon.png');
    expect(await fs.readFile(recorded, 'utf8')).toBe('original bytes');
    const order = (await listOrders(projectRoot)).orders.find((item: any) => item.orderId === 'ord-asset-overwrite');
    expect(order).toMatchObject({ status: 'delivered', currentVersion: 'v1' });

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-asset-overwrite',
      versionId: 'v1',
      files: [path.relative(projectRoot, recorded)],
      tool: 'manual-upload',
      overwrite: true,
      allowUnapprovedOrder: true,
    })).resolves.toMatchObject({ version: { files: ['icon.png'] } });
  });

  it('setCurrentOrderResult rejects a version whose recorded file is no longer materialized', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-set-current', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'select result', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-set-current', 'approved');
    const source = path.join(projectRoot, 'select.png');
    await fs.writeFile(source, 'selectable bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-set-current', versionId: 'v1', files: [source], tool: 'manual-upload',
      setCurrent: false, markDelivered: false,
    });
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-set-current/order.json');
    const orderBefore = await fs.readFile(orderFile);
    await fs.rm(path.join(projectRoot, '.repochan/orders/ord-set-current/versions/v1/select.png'));

    await expect(setCurrentOrderResult(projectRoot, 'ord-set-current', 'v1'))
      .rejects.toThrow(/missing or is not a non-empty regular file/);
    expect(await fs.readFile(orderFile)).toEqual(orderBefore);
  });

  it('atomically persists evidence-backed version metadata to stored and embedded mirrors', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-meta-persist', requestType: 'new_asset', assetType: 'sticker_grid',
        brief: { intent: 'persist tiles', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-meta-persist', 'approved');
    const source = path.join(projectRoot, 'grid.png');
    await fs.writeFile(source, 'grid evidence');
    await createOrderResult(projectRoot, {
      orderId: 'ord-meta-persist', versionId: 'v1', files: [source], tool: 'manual-upload',
    });
    const tiles = { rows: 1, cols: 1, cells: [{ row: 0, col: 0 }] };

    await persistOrderVersionMetadata(projectRoot, {
      orderId: 'ord-meta-persist', versionId: 'v1', metadata: { tiles }, evidenceFiles: ['grid.png'],
    });
    const stored = JSON.parse(await fs.readFile(path.join(projectRoot, '.repochan/orders/ord-meta-persist/versions/v1/meta.json'), 'utf8'));
    const order = await readOrder(projectRoot, 'ord-meta-persist');
    const embedded = order.orderAsset.versions.find((entry: any) => entry.versionId === 'v1');
    expect(stored.tiles).toEqual(tiles);
    expect(embedded).toEqual(stored);
  });

  it('rolls back both metadata mirrors when version metadata order publication fails', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-meta-rollback', requestType: 'new_asset', assetType: 'sticker_grid',
        brief: { intent: 'rollback tiles', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-meta-rollback', 'approved');
    const source = path.join(projectRoot, 'rollback-grid.png');
    await fs.writeFile(source, 'grid evidence');
    await createOrderResult(projectRoot, {
      orderId: 'ord-meta-rollback', versionId: 'v1', files: [source], tool: 'manual-upload',
    });
    const metaPath = path.join(projectRoot, '.repochan/orders/ord-meta-rollback/versions/v1/meta.json');
    const orderPath = path.join(projectRoot, '.repochan/orders/ord-meta-rollback/order.json');
    const before = await Promise.all([metaPath, orderPath].map((file) => fs.readFile(file)));
    const originalRename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, destination) => {
      if (!failed && String(sourcePath).includes('.metadata-txn-') && path.basename(String(sourcePath)) === 'order.json' && path.resolve(String(destination)) === path.resolve(orderPath)) {
        failed = true;
        throw new Error('simulated metadata order failure');
      }
      return originalRename(sourcePath, destination);
    });

    await expect(persistOrderVersionMetadata(projectRoot, {
      orderId: 'ord-meta-rollback', versionId: 'v1', metadata: { tiles: { rows: 1, cols: 1 } }, evidenceFiles: ['rollback-grid.png'],
    })).rejects.toThrow(/simulated metadata order failure/);
    const after = await Promise.all([metaPath, orderPath].map((file) => fs.readFile(file)));
    expect(after).toEqual(before);
  });

  it('setCurrentOrderResult deterministically materializes legacy result metadata', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-legacy-current', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'select legacy result', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-legacy-current', 'approved');
    const versionDir = path.join(projectRoot, '.repochan/orders/ord-legacy-current/versions/legacy1');
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, 'legacy.png'), 'legacy bytes');

    await setCurrentOrderResult(projectRoot, 'ord-legacy-current', 'legacy1');
    const metaPath = path.join(versionDir, 'meta.json');
    const firstMetaBytes = await fs.readFile(metaPath);
    expect(JSON.parse(firstMetaBytes.toString('utf8'))).toMatchObject({
      versionId: 'legacy1',
      tool: 'legacy-materialized',
      files: ['legacy.png'],
      provenance: { tool: 'repochan', action: 'order.set_current_result.legacy_materialize' },
    });
    expect((await listOrders(projectRoot)).orders.find((item: any) => item.orderId === 'ord-legacy-current'))
      .toMatchObject({ currentVersion: 'legacy1' });

    await setCurrentOrderResult(projectRoot, 'ord-legacy-current', 'legacy1');
    expect(await fs.readFile(metaPath)).toEqual(firstMetaBytes);
  });

  it('order.update cannot publish delivered state or a current pointer without materialized evidence', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-update-ghost', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'reject ghost result', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-update-ghost', 'approved');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-update-ghost/order.json');
    const before = await fs.readFile(orderFile);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-ghost',
      overwrite: true,
      patch: { currentVersion: 'ghost' },
    })).rejects.toThrow(/stored result version directory is missing/);
    expect(await fs.readFile(orderFile)).toEqual(before);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-ghost',
      overwrite: true,
      patch: { status: 'delivered' },
    })).rejects.toThrow(/cannot produce delivered\/current state without currentVersion/);
    expect(await fs.readFile(orderFile)).toEqual(before);
  });

  it('publishes overwrite as a complete replacement without stale omitted files', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-replace', requestType: 'new_asset', assetType: 'bundle',
        brief: { intent: 'replace bundle', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-replace', 'approved');
    const oldSource = path.join(projectRoot, 'old.png');
    const newSource = path.join(projectRoot, 'new.png');
    await fs.writeFile(oldSource, 'old bytes');
    await fs.writeFile(newSource, 'new bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-replace', versionId: 'v1', files: [oldSource], tool: 'manual-upload',
    });
    await createOrderResult(projectRoot, {
      orderId: 'ord-replace', versionId: 'v1', files: [newSource], tool: 'manual-upload',
      overwrite: true, allowUnapprovedOrder: true,
    });

    const versionDir = path.join(projectRoot, '.repochan/orders/ord-replace/versions/v1');
    expect((await fs.readdir(versionDir)).sort()).toEqual(['meta.json', 'new.png']);
    expect(await fs.readFile(path.join(versionDir, 'new.png'), 'utf8')).toBe('new bytes');
    const meta = JSON.parse(await fs.readFile(path.join(versionDir, 'meta.json'), 'utf8'));
    expect(meta.files).toEqual(['new.png']);
  });

  it('leaves version and order bytes unchanged when staging a multi-file result fails', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-copy-rollback', requestType: 'new_asset', assetType: 'bundle',
        brief: { intent: 'atomic copy', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-copy-rollback', 'approved');
    const oldSource = path.join(projectRoot, 'old-copy.png');
    await fs.writeFile(oldSource, 'old copy bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-copy-rollback', versionId: 'v1', files: [oldSource], tool: 'manual-upload',
    });
    const first = path.join(projectRoot, 'first-new.png');
    const second = path.join(projectRoot, 'second-new.png');
    await fs.writeFile(first, 'first new bytes');
    await fs.writeFile(second, 'second new bytes');
    const versionDir = path.join(projectRoot, '.repochan/orders/ord-copy-rollback/versions/v1');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-copy-rollback/order.json');
    const versionBefore = await snapshotDirectory(versionDir);
    const orderBefore = await fs.readFile(orderFile);
    const originalCopyFile = fs.copyFile.bind(fs);
    let copies = 0;
    vi.spyOn(fs, 'copyFile').mockImplementation(async (...args) => {
      copies += 1;
      if (copies === 2) throw new Error('simulated second copy failure');
      return originalCopyFile(...args);
    });

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-copy-rollback', versionId: 'v1', files: [first, second], tool: 'manual-upload',
      overwrite: true, allowUnapprovedOrder: true,
    })).rejects.toThrow(/simulated second copy failure/);
    expect(await snapshotDirectory(versionDir)).toEqual(versionBefore);
    expect(await fs.readFile(orderFile)).toEqual(orderBefore);
  });

  it('preserves an add-revision that wins while result files are still staging', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-result-cas', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'CAS result publish', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-result-cas', 'approved');
    const source = path.join(projectRoot, 'cas-result.png');
    await fs.writeFile(source, 'cas result bytes');
    const originalCopy = fs.copyFile.bind(fs);
    let releaseCopy!: () => void;
    let stagingStarted!: () => void;
    const release = new Promise<void>((resolve) => { releaseCopy = resolve; });
    const started = new Promise<void>((resolve) => { stagingStarted = resolve; });
    let paused = false;
    vi.spyOn(fs, 'copyFile').mockImplementation(async (from, to) => {
      if (!paused && String(to).includes('.result-txn-')) {
        paused = true;
        stagingStarted();
        await release;
      }
      return originalCopy(from, to);
    });

    const publishing = createOrderResult(projectRoot, {
      orderId: 'ord-result-cas', versionId: 'v1', files: [source], tool: 'manual-upload',
    });
    await started;
    await addOrderRevision(projectRoot, 'ord-result-cas', 'newer revision wins');
    releaseCopy();

    await expect(publishing).rejects.toThrow(/order\.create_result conflict.*newer order mutation was preserved/);
    const order = await readOrder(projectRoot, 'ord-result-cas');
    expect(order.status).toBe('needs_revision');
    expect(order.revisions?.at(-1)?.request).toBe('newer revision wins');
    await expect(fs.stat(path.join(projectRoot, '.repochan/orders/ord-result-cas/versions/v1'))).rejects.toThrow();
    expect((await fs.readdir(path.join(projectRoot, '.repochan/orders/ord-result-cas'))).some((entry) => entry.startsWith('.result-txn-'))).toBe(false);
  });

  it('restores version and order bytes when final order publication fails', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-publish-rollback', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'atomic publish', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-publish-rollback', 'approved');
    const oldSource = path.join(projectRoot, 'publish-old.png');
    const newSource = path.join(projectRoot, 'publish-new.png');
    await fs.writeFile(oldSource, 'publish old bytes');
    await fs.writeFile(newSource, 'publish new bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-publish-rollback', versionId: 'v1', files: [oldSource], tool: 'manual-upload',
    });
    const versionDir = path.join(projectRoot, '.repochan/orders/ord-publish-rollback/versions/v1');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-publish-rollback/order.json');
    const versionBefore = await snapshotDirectory(versionDir);
    const orderBefore = await fs.readFile(orderFile);
    const originalRename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (!failed && String(source).includes('.result-txn-') && path.basename(String(source)) === 'order.json' && path.resolve(String(destination)) === path.resolve(orderFile)) {
        failed = true;
        throw new Error('simulated order publication failure');
      }
      return originalRename(source, destination);
    });

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-publish-rollback', versionId: 'v1', files: [newSource], tool: 'manual-upload',
      overwrite: true, allowUnapprovedOrder: true,
    })).rejects.toThrow(/simulated order publication failure/);
    expect(await snapshotDirectory(versionDir)).toEqual(versionBefore);
    expect(await fs.readFile(orderFile)).toEqual(orderBefore);
    expect((await fs.readdir(path.dirname(orderFile))).some((entry) => entry.startsWith('.result-txn-'))).toBe(false);
  });

  it('retains a named recovery directory and blocks later writes when rollback is incomplete', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-retain', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'retain recovery evidence', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-recovery-retain', 'approved');
    const oldSource = path.join(projectRoot, 'recovery-old.png');
    const newSource = path.join(projectRoot, 'recovery-new.png');
    await fs.writeFile(oldSource, 'recovery old bytes');
    await fs.writeFile(newSource, 'recovery new bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-recovery-retain', versionId: 'v1', files: [oldSource], tool: 'manual-upload',
    });
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-recovery-retain/order.json');
    const orderBefore = await fs.readFile(orderFile);
    const originalRename = fs.rename.bind(fs);
    let publicationFailed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      const sourceText = String(source);
      if (!publicationFailed && sourceText.includes('.result-txn-') && path.basename(sourceText) === 'order.json' && path.resolve(String(destination)) === path.resolve(orderFile)) {
        publicationFailed = true;
        throw new Error('simulated result publication failure');
      }
      if (publicationFailed && path.basename(sourceText) === 'previous-order.json' && path.resolve(String(destination)) === path.resolve(orderFile)) {
        throw new Error('simulated order rollback failure');
      }
      return originalRename(source, destination);
    });

    let failure: Error | undefined;
    try {
      await createOrderResult(projectRoot, {
        orderId: 'ord-recovery-retain', versionId: 'v1', files: [newSource], tool: 'manual-upload',
        overwrite: true, allowUnapprovedOrder: true,
      });
    } catch (error) {
      failure = error as Error;
    }
    expect(failure?.message).toMatch(/rollback was incomplete/);
    expect(failure?.message).toMatch(/Recovery directory retained at:/);
    const recoveryDir = failure!.message.split('Recovery directory retained at: ')[1];
    expect(recoveryDir).toBeTruthy();
    expect(await fs.readFile(path.join(recoveryDir, 'previous-order.json'))).toEqual(orderBefore);

    const manifest = JSON.parse(await fs.readFile(path.join(recoveryDir, 'recovery.json'), 'utf8'));
    expect(manifest).toMatchObject({
      schemaVersion: 'repochan.order-recovery.v1',
      transactionId: path.basename(recoveryDir),
      orderId: 'ord-recovery-retain',
      kind: 'result_publish',
      state: 'recovery_required',
      entries: [
        { destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: true },
        { destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true },
      ],
    });
    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-retain')).recoveries)
      .toEqual([manifest]);

    vi.restoreAllMocks();
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-recovery-retain', versionId: 'v2', files: [newSource], tool: 'manual-upload',
      allowUnapprovedOrder: true,
    })).rejects.toThrow(/mutations must be serialized.*retained recovery directory/);

    await expect(abortOrderRecovery(projectRoot, 'ord-recovery-retain', path.basename(recoveryDir)))
      .rejects.toThrow(/Cannot abort recovery: current order\.json is missing or invalid/);

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-retain', path.basename(recoveryDir)))
      .resolves.toMatchObject({ action: 'recovered' });
    expect(await fs.readFile(orderFile)).toEqual(orderBefore);
    expect(await fs.readFile(path.join(projectRoot, '.repochan/orders/ord-recovery-retain/versions/v1/recovery-old.png'), 'utf8'))
      .toBe('recovery old bytes');
    await expect(fs.stat(recoveryDir)).rejects.toThrow();
  });

  it('atomically aborts a stale recovery marker only when current order state is valid', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-abort', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'abort stale recovery', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const transactionId = '.result-txn-stale';
    const transactionRoot = path.join(projectRoot, '.repochan/orders/ord-recovery-abort', transactionId);
    await fs.mkdir(transactionRoot);
    const nonce = await anchorTransaction('ord-recovery-abort', transactionId, 'result_publish', 'v1');
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), `${JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-abort',
      kind: 'result_publish', nonce, versionId: 'v1', state: 'recovery_required', entries: [],
    }, null, 2)}\n`);

    await expect(abortOrderRecovery(projectRoot, 'ord-recovery-abort', transactionId))
      .resolves.toMatchObject({ action: 'aborted' });
    await expect(fs.stat(transactionRoot)).rejects.toThrow();
    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-abort')).recoveries).toEqual([]);
  });

  it('classifies a crashed pre-manifest staging directory as abort-only', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-unprepared', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'abort unprepared staging', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const transactionId = '.result-txn-unprepared';
    const transactionRoot = path.join(projectRoot, '.repochan/orders/ord-recovery-unprepared', transactionId);
    await fs.mkdir(transactionRoot);
    await anchorTransaction('ord-recovery-unprepared', transactionId, 'result_publish', 'v1');
    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-unprepared')).recoveries)
      .toEqual([{ transactionId, state: 'staging_unprepared', action: 'abort_only' }]);
    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-unprepared', transactionId))
      .rejects.toThrow(/has not entered publication.*recovery abort/);
    await expect(abortOrderRecovery(projectRoot, 'ord-recovery-unprepared', transactionId))
      .resolves.toMatchObject({ action: 'aborted' });
    await expect(fs.stat(transactionRoot)).rejects.toThrow();
  });

  it('reclaims a crashed publish lock and recovers a prepared manifest before any rename', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-prepared', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'recover prepared publish', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-prepared');
    const orderFile = path.join(orderDir, 'order.json');
    const orderBytes = await fs.readFile(orderFile);
    const transactionId = '.result-txn-prepared-crash';
    const transactionRoot = path.join(orderDir, transactionId);
    await fs.mkdir(transactionRoot);
    const nonce = await anchorTransaction('ord-recovery-prepared', transactionId, 'result_publish', 'v1');
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), `${JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-prepared',
      kind: 'result_publish', nonce, versionId: 'v1', state: 'prepared',
      entries: [{
        destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true,
        beforeSha256: createHash('sha256').update(orderBytes).digest('hex'),
      }, {
        destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: false,
      }],
    }, null, 2)}\n`);
    const lockDir = path.join(orderDir, '.order-mutation.lock');
    await fs.mkdir(lockDir);
    await fs.writeFile(path.join(lockDir, 'owner.json'), JSON.stringify({
      schemaVersion: 'repochan.order-mutation-lock.v1', pid: 99_999_999,
      hostname: os.hostname(), operation: 'crashed publish', startedAt: new Date(0).toISOString(),
    }));

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-prepared', transactionId))
      .resolves.toMatchObject({ action: 'recovered' });
    expect(await fs.readFile(orderFile)).toEqual(orderBytes);
    await expect(fs.stat(transactionRoot)).rejects.toThrow();
    await expect(fs.stat(lockDir)).rejects.toThrow();
  });

  it('rejects a recovery destination whose intermediate ancestor is a symlink', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-link', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'reject linked recovery', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-link');
    const orderFile = path.join(orderDir, 'order.json');
    const orderBytes = await fs.readFile(orderFile);
    const transactionId = '.result-txn-linked-backup';
    const transactionRoot = path.join(orderDir, transactionId);
    const outside = path.join(projectRoot, 'outside-recovery');
    await fs.mkdir(transactionRoot);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'keep.txt'), 'outside bytes');
    await fs.rm(path.join(orderDir, 'versions'), { recursive: true });
    await fs.symlink(outside, path.join(orderDir, 'versions'));
    const nonce = await anchorTransaction('ord-recovery-link', transactionId, 'result_publish', 'v1');
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), `${JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-link',
      kind: 'result_publish', nonce, versionId: 'v1', state: 'recovery_required', entries: [{
        destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true,
        beforeSha256: createHash('sha256').update(orderBytes).digest('hex'),
      }, {
        destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: false,
      }],
    }, null, 2)}\n`);

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-link', transactionId))
      .rejects.toThrow(/Recovery destination refuses symlink path/);
    expect(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe('outside bytes');
    expect(await fs.readFile(orderFile)).toEqual(orderBytes);
  });

  it('rejects a tampered recovery manifest targeting arbitrary order files', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-target', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'reject arbitrary target', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-target');
    const orderFile = path.join(orderDir, 'order.json');
    const orderBytes = await fs.readFile(orderFile);
    const referencesDir = path.join(orderDir, 'references');
    await fs.mkdir(referencesDir);
    await fs.writeFile(path.join(referencesDir, 'keep.txt'), 'keep bytes');
    const transactionId = '.result-txn-arbitrary-target';
    const transactionRoot = path.join(orderDir, transactionId);
    await fs.mkdir(transactionRoot);
    const nonce = await anchorTransaction('ord-recovery-target', transactionId, 'result_publish', 'v1');
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), `${JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-target',
      kind: 'result_publish', nonce, versionId: 'v1', state: 'recovery_required', entries: [{
        destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true,
        beforeSha256: createHash('sha256').update(orderBytes).digest('hex'),
      }, {
        destination: 'references', backup: 'previous-references', kind: 'directory', existedBefore: true,
        beforeSha256: 'tampered',
      }],
    }, null, 2)}\n`);

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-target', transactionId))
      .rejects.toThrow(/Invalid recovery manifest/);
    expect(await fs.readFile(path.join(referencesDir, 'keep.txt'), 'utf8')).toBe('keep bytes');
    expect(await fs.readFile(orderFile)).toEqual(orderBytes);
  });

  it('does not follow a symlinked recovery transaction while listing', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-list-link', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'ignore linked transaction', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-list-link');
    const outside = path.join(projectRoot, 'outside-list-transaction');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'recovery.json'), '{}');
    await fs.symlink(outside, path.join(orderDir, '.result-txn-linked'));

    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-list-link')).recoveries).toEqual([]);
    expect(await fs.readFile(path.join(outside, 'recovery.json'), 'utf8')).toBe('{}');
  });

  it('rejects a legal-shape forged recovery directory without a Core identity anchor', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-forged', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'reject forged history', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-forged');
    const transactionId = '.result-txn-forged';
    const transactionRoot = path.join(orderDir, transactionId);
    const orderBytes = await fs.readFile(path.join(orderDir, 'order.json'));
    await fs.mkdir(transactionRoot);
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-forged',
      kind: 'result_publish', nonce: 'forged', versionId: 'v1', state: 'recovery_required', entries: [{
        destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true,
        beforeSha256: createHash('sha256').update(orderBytes).digest('hex'),
      }, {
        destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: false,
      }],
    }));

    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-forged')).recoveries[0])
      .toMatchObject({ transactionId, invalid: true });
    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-forged', transactionId))
      .rejects.toThrow(/Core identity anchor is missing/);
    expect(await fs.readFile(path.join(orderDir, 'order.json'))).toEqual(orderBytes);
  });

  it('rejects a hash-consistent backup whose order semantics do not match the anchored transaction', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-recovery-semantic', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'reject semantic replacement', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderDir = path.join(projectRoot, '.repochan/orders/ord-recovery-semantic');
    const orderPath = path.join(orderDir, 'order.json');
    const orderBefore = await fs.readFile(orderPath);
    const transactionId = '.result-txn-semantic';
    const transactionRoot = path.join(orderDir, transactionId);
    await fs.mkdir(transactionRoot);
    const nonce = await anchorTransaction('ord-recovery-semantic', transactionId, 'result_publish', 'v1');
    const forgedOrder = Buffer.from(`${JSON.stringify({ orderId: 'ord-other', status: 'draft' }, null, 2)}\n`);
    await fs.writeFile(path.join(transactionRoot, 'previous-order.json'), forgedOrder);
    await fs.writeFile(path.join(transactionRoot, 'recovery.json'), JSON.stringify({
      schemaVersion: 'repochan.order-recovery.v1', transactionId, orderId: 'ord-recovery-semantic',
      kind: 'result_publish', nonce, versionId: 'v1', state: 'recovery_required', entries: [{
        destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true,
        beforeSha256: createHash('sha256').update(forgedOrder).digest('hex'),
      }, {
        destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: false,
      }],
    }));

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-semantic', transactionId))
      .rejects.toThrow(/Recovery orderId mismatch/);
    expect(await fs.readFile(orderPath)).toEqual(orderBefore);
    expect(await fs.readFile(path.join(transactionRoot, 'previous-order.json'))).toEqual(forgedOrder);
  });

  it('rejects a symlinked versions ancestor before creating or overwriting result bytes', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-symlink', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'safe result', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-symlink', 'approved');
    const source = path.join(projectRoot, 'safe.png');
    await fs.writeFile(source, 'safe bytes');
    const versionsDir = path.join(projectRoot, '.repochan/orders/ord-symlink/versions');
    const outside = path.join(projectRoot, 'outside-versions');
    await fs.mkdir(outside);
    await fs.rm(versionsDir, { recursive: true });
    await fs.symlink(outside, versionsDir);

    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-symlink', versionId: 'v1', files: [source], tool: 'manual-upload',
    })).rejects.toThrow(/refuses symlink path/);
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-symlink', versionId: 'v1', files: [source], tool: 'manual-upload', overwrite: true,
    })).rejects.toThrow(/refuses symlink path/);
    expect(await fs.readdir(outside)).toEqual([]);
  });

  it('createOrderResult allows non-image-gen results without generationPrompt', async () => {
    await createOrders(projectRoot, {
      orders: [
        {
          orderId: 'ord-asset-003',
          requestType: 'new_asset',
          assetType: 'readme-hero',
          brief: { intent: 'manual asset', mustInclude: [], avoid: [], creativeFreedom: [] },
          deliverables: [],
          acceptanceCriteria: [],
        },
      ],
    });
    await setOrderStatus(projectRoot, 'ord-asset-003', 'approved');

    // A non-image tool (e.g. user manually drops a file) should work without
    // generationPrompt as long as an observable result file exists.
    const sourceFile = path.join(projectRoot, 'manual-asset.png');
    await fs.writeFile(sourceFile, 'manual asset bytes');
    const res = await createOrderResult(projectRoot, {
      orderId: 'ord-asset-003',
      versionId: 'v1',
      files: [sourceFile],
      tool: 'repochan',
      promptBrief: 'manually uploaded asset',
      // no generationPrompt — OK because tool doesn't involve image generation
      setCurrent: true,
    });

    expect(res.version.versionId).toBe('v1');
    expect(res.version.generationPrompt).toBeUndefined();
  });
});
