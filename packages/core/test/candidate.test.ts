import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
} from '../src/entities.js';
import { createReview } from '../src/entities.js';
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
    await fs.writeFile(path.join(r, 'persona', 'current.json'), JSON.stringify({ name: 'Test', rolePrompt: 'test' }));
  });

  afterEach(async () => {
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
    ).rejects.toThrow(/snapshot.*retired/i);
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
