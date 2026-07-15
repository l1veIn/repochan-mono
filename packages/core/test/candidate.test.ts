import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  createOrders,
  setOrderStatus,
  createOrderResult,
  createOrderCandidate,
  promoteCandidate,
  listOrderResults,
  readOrder,
  addOrderRevision,
} from '../src/entities/index.js';
import { createReview } from '../src/entities/index.js';
import { initProtocol } from '../src/protocol/index.js';

describe('candidate state', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-candidate-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    const r = path.join(projectRoot, '.repochan');
    await fs.writeFile(path.join(r, 'analysis', 'current.json'), JSON.stringify({ summary: 'test' }));
    await fs.writeFile(path.join(r, 'persona', 'current.json'), JSON.stringify({ name: 'Test', rolePrompt: 'test', artStyle: 'cel-shaded' }));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  // ── Helper: seed an order + approve it (ready for candidate creation) ──

  async function seedApprovedOrder(orderId: string) {
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

  // ── Helper: create a candidate from a source file ──

  async function makeCandidate(orderId: string, versionId: string, marker: string) {
    const sourceDir = path.join(projectRoot, 'source-assets', orderId, versionId);
    await fs.mkdir(sourceDir, { recursive: true });
    const sourceFile = path.join(sourceDir, `${marker}.png`);
    await fs.writeFile(sourceFile, `fake-${marker}`);
    return createOrderCandidate(projectRoot, {
      orderId,
      versionId,
      files: [sourceFile],
      tool: 'manual',
    });
  }

  // ── createOrderCandidate ──────────────────────────────────

  it('writes role=candidate, does not change currentVersion or status', async () => {
    await seedApprovedOrder('ord-cand-001');

    const result = await makeCandidate('ord-cand-001', 'c1', 'draft1');

    expect(result.version.role).toBe('candidate');

    const order = await readOrder(projectRoot, 'ord-cand-001');
    expect(order.currentVersion).toBeUndefined(); // not promoted
    expect(order.status).toBe('approved'); // unchanged — candidate is not a delivery

    // listOrderResults sees it with role=candidate
    const listed = await listOrderResults(projectRoot, 'ord-cand-001');
    expect(listed.results).toHaveLength(1);
    expect(listed.results[0].role).toBe('candidate');
  });

  it('accumulates multiple candidates without promoting any', async () => {
    await seedApprovedOrder('ord-cand-002');

    await makeCandidate('ord-cand-002', 'c1', 'draft1');
    await makeCandidate('ord-cand-002', 'c2', 'draft2');
    await makeCandidate('ord-cand-002', 'c3', 'draft3');

    const order = await readOrder(projectRoot, 'ord-cand-002');
    expect(order.currentVersion).toBeUndefined();

    const listed = await listOrderResults(projectRoot, 'ord-cand-002');
    expect(listed.results).toHaveLength(3);
    expect(listed.results.every((v) => v.role === 'candidate')).toBe(true);
  });

  // ── promoteCandidate ─────────────────────────────────────

  it('promotes candidate to current, demotes previous current to snapshot', async () => {
    await seedApprovedOrder('ord-cand-003');

    // First, create a normal delivered result (becomes current, role unset = legacy current)
    const sourceDir = path.join(projectRoot, 'source-assets', 'ord-cand-003', 'v1');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'v1.png'), 'fake');
    await createOrderResult(projectRoot, {
      orderId: 'ord-cand-003',
      versionId: 'v1',
      files: [path.join(sourceDir, 'v1.png')],
      tool: 'manual',
    });
    // now v1 is current, order is delivered

    // Create a candidate
    await makeCandidate('ord-cand-003', 'c1', 'draft1');

    // Promote c1
    const result = await promoteCandidate(projectRoot, 'ord-cand-003', 'c1');

    expect(result.promotedVersion.versionId).toBe('c1');
    expect(result.promotedVersion.role).toBe('current');
    expect(result.previousCurrent?.versionId).toBe('v1');

    const order = await readOrder(projectRoot, 'ord-cand-003');
    expect(order.currentVersion).toBe('c1');

    // v1 should now be snapshot
    const listed = await listOrderResults(projectRoot, 'ord-cand-003');
    const v1 = listed.results.find((v) => v.versionId === 'v1');
    const c1 = listed.results.find((v) => v.versionId === 'c1');
    expect(v1?.role).toBe('snapshot');
    expect(c1?.role).toBe('current');
  });

  it('listOrderResults shows all versions with correct roles after promote', async () => {
    await seedApprovedOrder('ord-cand-004');

    await makeCandidate('ord-cand-004', 'c1', 'd1');
    await makeCandidate('ord-cand-004', 'c2', 'd2');
    await makeCandidate('ord-cand-004', 'c3', 'd3');

    // Promote c2
    await promoteCandidate(projectRoot, 'ord-cand-004', 'c2');

    const listed = await listOrderResults(projectRoot, 'ord-cand-004');
    expect(listed.results).toHaveLength(3);
    expect(listed.currentVersion).toBe('c2');

    const roles = Object.fromEntries(listed.results.map((v) => [v.versionId, v.role]));
    expect(roles.c1).toBe('candidate');  // not chosen, still candidate
    expect(roles.c2).toBe('current');    // promoted
    expect(roles.c3).toBe('candidate');  // not chosen, still candidate
  });

  // ── promoteCandidate guards ──────────────────────────────

  it('rejects promotion of a non-existent version', async () => {
    await seedApprovedOrder('ord-cand-005');
    await makeCandidate('ord-cand-005', 'c1', 'd1');

    await expect(
      promoteCandidate(projectRoot, 'ord-cand-005', 'nonexistent'),
    ).rejects.toThrow(/no version 'nonexistent'/);
  });

  it('rejects promotion of a snapshot (only candidates can be promoted)', async () => {
    await seedApprovedOrder('ord-cand-006');

    // Create v1 as current via normal result
    const sourceDir = path.join(projectRoot, 'source-assets', 'ord-cand-006', 'v1');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'v1.png'), 'fake');
    await createOrderResult(projectRoot, {
      orderId: 'ord-cand-006', versionId: 'v1',
      files: [path.join(sourceDir, 'v1.png')], tool: 'manual',
    });

    // Create candidate c1 and promote it (v1 becomes snapshot)
    await makeCandidate('ord-cand-006', 'c1', 'd1');
    await promoteCandidate(projectRoot, 'ord-cand-006', 'c1');

    // Now try to promote the snapshot v1
    await expect(
      promoteCandidate(projectRoot, 'ord-cand-006', 'v1'),
    ).rejects.toThrow(/not a candidate.*role=candidate/i);
  });

  it('rejects promotion when the candidate artifact is missing without changing current state', async () => {
    await seedApprovedOrder('ord-cand-008');
    await makeCandidate('ord-cand-008', 'c1', 'draft1');
    const versionDir = path.join(projectRoot, '.repochan', 'orders', 'ord-cand-008', 'versions', 'c1');
    await fs.rm(versionDir, { recursive: true });

    await expect(
      promoteCandidate(projectRoot, 'ord-cand-008', 'c1'),
    ).rejects.toThrow(/Cannot promote candidate.*version directory is missing/);

    const order = await readOrder(projectRoot, 'ord-cand-008');
    expect(order.currentVersion).toBeUndefined();
    expect(order.orderAsset?.currentVersion).toBeUndefined();
    expect(order.orderAsset?.versions.find((version) => version.versionId === 'c1')?.role).toBe('candidate');
    await expect(fs.stat(versionDir)).rejects.toThrow();
  });

  it('does not use an external path in embedded metadata as candidate promotion evidence', async () => {
    await seedApprovedOrder('ord-cand-009');
    const created = await makeCandidate('ord-cand-009', 'c1', 'draft1');
    const externalFile = path.join(projectRoot, 'source-assets', 'ord-cand-009', 'c1', 'draft1.png');
    created.order.orderAsset!.versions.find((version) => version.versionId === 'c1')!.files = [externalFile];
    await fs.writeFile(
      path.join(projectRoot, '.repochan', 'orders', 'ord-cand-009', 'order.json'),
      JSON.stringify(created.order),
    );
    await expect(
      promoteCandidate(projectRoot, 'ord-cand-009', 'c1'),
    ).rejects.toThrow(/embedded and stored result file lists do not match/);

    const order = await readOrder(projectRoot, 'ord-cand-009');
    expect(order.currentVersion).toBeUndefined();
    expect(order.orderAsset?.currentVersion).toBeUndefined();
    expect(order.orderAsset?.versions.find((version) => version.versionId === 'c1')?.role).toBe('candidate');
    expect(await fs.readFile(path.join(projectRoot, '.repochan/orders/ord-cand-009/versions/c1/draft1.png'), 'utf8')).toBe('fake-draft1');
  });

  it('requires the embedded and stored result roles to both be candidate', async () => {
    await seedApprovedOrder('ord-cand-010');
    const created = await makeCandidate('ord-cand-010', 'c1', 'draft1');
    delete created.order.orderAsset!.versions.find((version) => version.versionId === 'c1')!.role;
    await fs.writeFile(
      path.join(projectRoot, '.repochan', 'orders', 'ord-cand-010', 'order.json'),
      JSON.stringify(created.order),
    );
    await expect(promoteCandidate(projectRoot, 'ord-cand-010', 'c1'))
      .rejects.toThrow(/not a candidate.*role=candidate/);
  });

  it('rejects a symlinked candidate version directory without writing outside protocol storage', async () => {
    await seedApprovedOrder('ord-cand-011');
    await makeCandidate('ord-cand-011', 'c1', 'draft1');
    const versionDir = path.join(projectRoot, '.repochan', 'orders', 'ord-cand-011', 'versions', 'c1');
    const outside = path.join(projectRoot, 'outside-candidate');
    await fs.mkdir(outside);
    await fs.rm(versionDir, { recursive: true });
    await fs.symlink(outside, versionDir);

    await expect(promoteCandidate(projectRoot, 'ord-cand-011', 'c1'))
      .rejects.toThrow(/refuses symlink path/);
    expect(await fs.readdir(outside)).toEqual([]);
    const order = await readOrder(projectRoot, 'ord-cand-011');
    expect(order.currentVersion).toBeUndefined();
  });

  it('rejects a symlinked previous-version meta before promotion', async () => {
    await seedApprovedOrder('ord-cand-012');
    const source = path.join(projectRoot, 'previous.png');
    await fs.writeFile(source, 'previous bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-cand-012', versionId: 'v1', files: [source], tool: 'manual',
    });
    await makeCandidate('ord-cand-012', 'c1', 'draft1');
    const previousMeta = path.join(projectRoot, '.repochan/orders/ord-cand-012/versions/v1/meta.json');
    const outsideMeta = path.join(projectRoot, 'outside-meta.json');
    await fs.writeFile(outsideMeta, 'outside bytes');
    await fs.rm(previousMeta);
    await fs.symlink(outsideMeta, previousMeta);

    await expect(promoteCandidate(projectRoot, 'ord-cand-012', 'c1'))
      .rejects.toThrow(/Previous result metadata refuses symlink path/);
    expect(await fs.readFile(outsideMeta, 'utf8')).toBe('outside bytes');
    expect((await readOrder(projectRoot, 'ord-cand-012')).currentVersion).toBe('v1');
  });

  it('rolls back previous meta, target meta, and order bytes when promotion publication fails', async () => {
    await seedApprovedOrder('ord-cand-013');
    const source = path.join(projectRoot, 'promotion-previous.png');
    await fs.writeFile(source, 'previous bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-cand-013', versionId: 'v1', files: [source], tool: 'manual',
    });
    await makeCandidate('ord-cand-013', 'c1', 'draft1');
    const orderFile = path.join(projectRoot, '.repochan/orders/ord-cand-013/order.json');
    const previousMeta = path.join(projectRoot, '.repochan/orders/ord-cand-013/versions/v1/meta.json');
    const targetMeta = path.join(projectRoot, '.repochan/orders/ord-cand-013/versions/c1/meta.json');
    const before = await Promise.all([orderFile, previousMeta, targetMeta].map((file) => fs.readFile(file)));
    const originalRename = fs.rename.bind(fs);
    let failed = false;
    vi.spyOn(fs, 'rename').mockImplementation(async (sourcePath, destination) => {
      if (!failed && String(sourcePath).includes('.promotion-txn-') && path.basename(String(sourcePath)) === 'order.json' && path.resolve(String(destination)) === path.resolve(orderFile)) {
        failed = true;
        throw new Error('simulated promotion order failure');
      }
      return originalRename(sourcePath, destination);
    });

    await expect(promoteCandidate(projectRoot, 'ord-cand-013', 'c1'))
      .rejects.toThrow(/simulated promotion order failure/);
    const after = await Promise.all([orderFile, previousMeta, targetMeta].map((file) => fs.readFile(file)));
    expect(after).toEqual(before);
    expect((await readOrder(projectRoot, 'ord-cand-013')).currentVersion).toBe('v1');
  });

  it('preserves an add-revision that wins while candidate promotion is still staging', async () => {
    await seedApprovedOrder('ord-cand-014');
    const source = path.join(projectRoot, 'promotion-cas-previous.png');
    await fs.writeFile(source, 'previous bytes');
    await createOrderResult(projectRoot, {
      orderId: 'ord-cand-014', versionId: 'v1', files: [source], tool: 'manual',
    });
    await makeCandidate('ord-cand-014', 'c1', 'draft1');
    const targetMeta = path.join(projectRoot, '.repochan/orders/ord-cand-014/versions/c1/meta.json');
    const targetBefore = await fs.readFile(targetMeta);
    const originalWrite = fs.writeFile.bind(fs);
    let releaseWrite!: () => void;
    let stagingStarted!: () => void;
    const release = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const started = new Promise<void>((resolve) => { stagingStarted = resolve; });
    let paused = false;
    vi.spyOn(fs, 'writeFile').mockImplementation(async (file, data, options) => {
      if (!paused && String(file).includes('.promotion-txn-') && path.basename(String(file)) === 'target-meta.json') {
        paused = true;
        stagingStarted();
        await release;
      }
      return originalWrite(file, data, options as any);
    });

    const promotion = promoteCandidate(projectRoot, 'ord-cand-014', 'c1');
    await started;
    await addOrderRevision(projectRoot, 'ord-cand-014', 'newer promotion revision wins');
    releaseWrite();

    await expect(promotion).rejects.toThrow(/order\.promote_candidate conflict.*newer order mutation was preserved/);
    const order = await readOrder(projectRoot, 'ord-cand-014');
    expect(order.currentVersion).toBe('v1');
    expect(order.status).toBe('needs_revision');
    expect(order.revisions?.at(-1)?.request).toBe('newer promotion revision wins');
    expect(await fs.readFile(targetMeta)).toEqual(targetBefore);
    expect((await fs.readdir(path.join(projectRoot, '.repochan/orders/ord-cand-014'))).some((entry) => entry.startsWith('.promotion-txn-'))).toBe(false);
  });

  // ── review compatibility with candidates ─────────────────

  it('allows reviewing a candidate version (orderResultExists finds it)', async () => {
    await seedApprovedOrder('ord-cand-007');
    await makeCandidate('ord-cand-007', 'c1', 'draft1');

    // Review the candidate — this should succeed because orderResultExists
    // checks the filesystem, and the candidate's version directory exists.
    const review = await createReview(projectRoot, {
      orderId: 'ord-cand-007',
      versionId: 'c1',
      verdict: 'pass',
      notes: 'This candidate looks promising.',
    });

    expect(review.review.verdict).toBe('pass');
    expect(review.review.versionId).toBe('c1');
  });
});
