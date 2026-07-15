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
  setOrderStatus,
  updateOrder,
  readOrder,
  recoverOrderRecovery,
} from '../src/entities/index.js';
import { initProtocol } from '../src/protocol/index.js';
import { seedUpstream } from '../test-support/fixtures.js';

describe('entities (core business operations)', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-entities-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    await seedUpstream(projectRoot);
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

  it('restores the order tree when materializing the second create reference fails', async () => {
    const first = path.join(projectRoot, 'reference-first.png');
    const second = path.join(projectRoot, 'reference-second.png');
    await fs.writeFile(first, 'first reference bytes');
    await fs.writeFile(second, 'second reference bytes');
    const ordersDir = path.join(projectRoot, '.repochan', 'orders');
    const before = await snapshotDirectory(ordersDir);
    const originalCopy = fs.copyFile.bind(fs);
    vi.spyOn(fs, 'copyFile').mockImplementation(async (source, destination, mode) => {
      if (path.resolve(String(source)) === path.resolve(second)) throw new Error('simulated second reference copy failure');
      return originalCopy(source, destination, mode);
    });

    await expect(createOrders(projectRoot, { order: {
      orderId: 'ord-reference-create-atomic', requestType: 'new_asset', assetType: 'hero',
      brief: { intent: 'atomic references', mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [], acceptanceCriteria: [],
      references: [
        { type: 'file', path: first, role: 'style' },
        { type: 'file', path: second, role: 'composition' },
      ],
    } })).rejects.toThrow(/simulated second reference copy failure/);

    expect(await snapshotDirectory(ordersDir)).toEqual(before);
  });

  it('restores order and reference bytes when an update reference set cannot be staged', async () => {
    const original = path.join(projectRoot, 'reference-original.png');
    const first = path.join(projectRoot, 'reference-update-first.png');
    const second = path.join(projectRoot, 'reference-update-second.png');
    await fs.writeFile(original, 'original reference bytes');
    await fs.writeFile(first, 'first update bytes');
    await fs.writeFile(second, 'second update bytes');
    await createOrders(projectRoot, { order: {
      orderId: 'ord-reference-update-atomic', requestType: 'new_asset', assetType: 'hero',
      brief: { intent: 'stable references', mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [], acceptanceCriteria: [],
      references: [{ type: 'file', path: original, role: 'style' }],
    } });
    const orderRoot = path.join(projectRoot, '.repochan', 'orders', 'ord-reference-update-atomic');
    const before = await snapshotDirectory(orderRoot);
    const originalCopy = fs.copyFile.bind(fs);
    vi.spyOn(fs, 'copyFile').mockImplementation(async (source, destination, mode) => {
      if (path.resolve(String(source)) === path.resolve(second)) throw new Error('simulated updated reference copy failure');
      return originalCopy(source, destination, mode);
    });

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-reference-update-atomic', overwrite: true,
      patch: { references: [
        { type: 'file', path: first, role: 'character' },
        { type: 'file', path: second, role: 'composition' },
      ] },
    })).rejects.toThrow(/simulated updated reference copy failure/);

    expect(await snapshotDirectory(orderRoot)).toEqual(before);
  });

  it('publishes exactly the current file-reference set without orphan assets', async () => {
    const first = path.join(projectRoot, 'reference-exact-first.png');
    const second = path.join(projectRoot, 'reference-exact-second.png');
    await fs.writeFile(first, 'first reference bytes');
    await fs.writeFile(second, 'second reference bytes');
    await createOrders(projectRoot, { order: {
      orderId: 'ord-reference-exact', requestType: 'new_asset', assetType: 'hero',
      brief: { intent: 'exact references', mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [], acceptanceCriteria: [],
      references: [{ type: 'file', path: first, role: 'style' }],
    } });
    const referencesDir = path.join(projectRoot, '.repochan', 'orders', 'ord-reference-exact', 'references');
    expect(await fs.readdir(referencesDir)).toEqual(['reference-exact-first.png']);

    await updateOrder(projectRoot, {
      orderId: 'ord-reference-exact', overwrite: true,
      patch: { references: [{ type: 'file', path: second, role: 'style' }] },
    });
    expect(await fs.readdir(referencesDir)).toEqual(['reference-exact-second.png']);

    await updateOrder(projectRoot, {
      orderId: 'ord-reference-exact', overwrite: true,
      patch: { references: [] },
    });
    await expect(fs.stat(referencesDir)).rejects.toThrow();
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
    expect(res.order.candidateVersions).toEqual([]);

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
    })).rejects.toThrow(/cannot change lifecycle field 'currentVersion'/);
    expect(await fs.readFile(orderFile)).toEqual(before);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-ghost',
      overwrite: true,
      patch: { status: 'delivered' },
    })).rejects.toThrow(/cannot change lifecycle field 'status'/);
    expect(await fs.readFile(orderFile)).toEqual(before);
  });

  it('order.update accepts only the canonical mutable patch and leaves bytes unchanged on rejection', async () => {
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-update-contract', requestType: 'new_asset', assetType: 'icon',
        brief: { intent: 'original intent', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [], acceptanceCriteria: [],
      }],
    });
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-update-contract/order.json');
    const before = await fs.readFile(orderFile);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-contract', overwrite: true,
      patch: { brief: { intent: 42 } },
    })).rejects.toThrow(/validate order\.update/);
    expect(await fs.readFile(orderFile)).toEqual(before);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-contract', overwrite: true,
      patch: { removedField: true },
    })).rejects.toThrow(/additional properties/);
    expect(await fs.readFile(orderFile)).toEqual(before);

    await expect(updateOrder(projectRoot, {
      orderId: 'ord-update-contract', overwrite: true,
      patch: { orderId: 'ord-replaced' },
    })).rejects.toThrow(/additional properties/);
    expect(await fs.readFile(orderFile)).toEqual(before);

    const updated = await updateOrder(projectRoot, {
      orderId: 'ord-update-contract', overwrite: true,
      patch: { brief: { intent: 'canonical update' }, priority: 'high' },
    });
    expect(updated).toMatchObject({
      orderId: 'ord-update-contract', priority: 'high',
      brief: { intent: 'canonical update', mustInclude: [], avoid: [], creativeFreedom: [] },
    });
    expect(await readOrder(projectRoot, 'ord-update-contract')).toEqual(updated);
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
    const first = path.join(projectRoot, 'first-new.png');
    const second = path.join(projectRoot, 'second-new.png');
    await fs.writeFile(first, 'first new bytes');
    await fs.writeFile(second, 'second new bytes');
    const versionDir = path.join(projectRoot, '.repochan/orders/ord-copy-rollback/versions/v1');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-copy-rollback/order.json');
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
    })).rejects.toThrow(/simulated second copy failure/);
    await expect(fs.stat(versionDir)).rejects.toThrow();
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
    const newSource = path.join(projectRoot, 'publish-new.png');
    await fs.writeFile(newSource, 'publish new bytes');
    const versionDir = path.join(projectRoot, '.repochan/orders/ord-publish-rollback/versions/v1');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-publish-rollback/order.json');
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
    })).rejects.toThrow(/simulated order publication failure/);
    await expect(fs.stat(versionDir)).rejects.toThrow();
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
    const newSource = path.join(projectRoot, 'recovery-new.png');
    await fs.writeFile(newSource, 'recovery new bytes');
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
        { destination: 'versions/v1', backup: 'previous-version', kind: 'directory', existedBefore: false },
        { destination: 'order.json', backup: 'previous-order.json', kind: 'file', existedBefore: true },
      ],
    });
    expect((await listOrderRecoveries(projectRoot, 'ord-recovery-retain')).recoveries)
      .toEqual([manifest]);

    vi.restoreAllMocks();
    await expect(createOrderResult(projectRoot, {
      orderId: 'ord-recovery-retain', versionId: 'v2', files: [newSource], tool: 'manual-upload',
    })).rejects.toThrow(/mutations must be serialized.*retained recovery directory/);

    await expect(abortOrderRecovery(projectRoot, 'ord-recovery-retain', path.basename(recoveryDir)))
      .rejects.toThrow(/Cannot abort recovery: current order\.json is missing or invalid/);

    await expect(recoverOrderRecovery(projectRoot, 'ord-recovery-retain', path.basename(recoveryDir)))
      .resolves.toMatchObject({ action: 'recovered' });
    expect(await fs.readFile(orderFile)).toEqual(orderBefore);
    await expect(fs.stat(path.join(projectRoot, '.repochan/orders/ord-recovery-retain/versions/v1'))).rejects.toThrow();
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
    const lockDir = path.join(projectRoot, '.repochan/.locks/orders/ord-recovery-prepared/mutation.lock');
    await fs.mkdir(lockDir, { recursive: true });
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
    const forgedOrder = Buffer.from(`${JSON.stringify({ ...JSON.parse(orderBefore.toString('utf8')), orderId: 'ord-other' }, null, 2)}\n`);
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
    });

    expect(res.version.versionId).toBe('v1');
    expect(res.version.generationPrompt).toBeUndefined();
  });
});
