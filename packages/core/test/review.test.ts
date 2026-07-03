import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createReview } from '../src/entities/index.js';
import { createOrders, setOrderStatus, createOrderResult } from '../src/entities/index.js';
import { initProtocol } from '../src/protocol/index.js';
import { reviewJsonPath } from '../src/protocol/index.js';
import { readOrder } from '../src/entities/index.js';

describe('review entity', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-review-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    // seed analysis + persona (required upstream artifacts)
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

  // ── Helper: seed an order with a delivered result version ──
  // After this completes, the order is in 'delivered' status with the given
  // versionId as currentVersion — the typical state a review targets.

  async function seedDeliveredOrder(orderId: string, versionId: string) {
    await createOrders(projectRoot, {
      orders: [{
        orderId,
        requestType: 'new_asset',
        assetType: 'hero_illustration',
        brief: { intent: 'test', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [],
        acceptanceCriteria: ['character is recognizable'],
      }],
    });
    await setOrderStatus(projectRoot, orderId, 'approved');

    // createOrderResult needs a source file to copy
    const sourceDir = path.join(projectRoot, 'source-assets', orderId, versionId);
    await fs.mkdir(sourceDir, { recursive: true });
    const sourceFile = path.join(sourceDir, 'hero.png');
    await fs.writeFile(sourceFile, 'fake-image-data');
    await createOrderResult(projectRoot, {
      orderId,
      versionId,
      files: [sourceFile],
      tool: 'manual',
    });
    // createOrderResult with markDelivered default sets status -> delivered
  }

  // ── createReview: happy paths ─────────────────────────────

  it('writes review file and leaves order unchanged on verdict=pass', async () => {
    await seedDeliveredOrder('ord-test-001', 'v1');

    const result = await createReview(projectRoot, {
      orderId: 'ord-test-001',
      versionId: 'v1',
      verdict: 'pass',
      reviewerRole: 'art-director',
      notes: 'Looks good.',
    });

    expect(result.review.verdict).toBe('pass');
    expect(result.review.schemaVersion).toBe('repochan.review.v1');
    expect(result.statusChanged).toBe(false);

    // order stays delivered
    const order = await readOrder(projectRoot, 'ord-test-001');
    expect(order.status).toBe('delivered');

    // review file exists on disk
    const file = reviewJsonPath(projectRoot, 'ord-test-001', 'v1');
    const onDisk = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(onDisk.verdict).toBe('pass');
    expect(onDisk.reviewerRole).toBe('art-director');
  });

  it('pushes delivered order back to needs_revision on verdict=revise', async () => {
    await seedDeliveredOrder('ord-test-002', 'v1');

    const result = await createReview(projectRoot, {
      orderId: 'ord-test-002',
      versionId: 'v1',
      verdict: 'revise',
      notes: 'Colors are off — main palette doesn\'t match the persona.',
    });

    expect(result.statusChanged).toBe(true);
    const order = await readOrder(projectRoot, 'ord-test-002');
    expect(order.status).toBe('needs_revision');
    // a revision record was appended
    expect(order.revisions).toHaveLength(1);
    expect(order.revisions[0].request).toContain('Colors are off');
  });

  // ── createReview: verdict side-effect boundaries ──────────

  it('does not change status when reviewing a non-delivered order', async () => {
    // seed an order that's in_progress (not yet delivered)
    await createOrders(projectRoot, {
      orders: [{
        orderId: 'ord-test-003',
        requestType: 'new_asset',
        assetType: 'hero_illustration',
        brief: { intent: 'test', mustInclude: [], avoid: [], creativeFreedom: [] },
        deliverables: [],
        acceptanceCriteria: [],
      }],
    });
    await setOrderStatus(projectRoot, 'ord-test-003', 'approved');
    await setOrderStatus(projectRoot, 'ord-test-003', 'in_progress');

    // create a result version without markDelivered
    const sourceDir = path.join(projectRoot, 'source-assets', 'ord-test-003', 'v1');
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, 'hero.png'), 'fake');
    await createOrderResult(projectRoot, {
      orderId: 'ord-test-003',
      versionId: 'v1',
      files: [path.join(sourceDir, 'hero.png')],
      tool: 'manual',
      markDelivered: false, // keep it in_progress
    });

    const result = await createReview(projectRoot, {
      orderId: 'ord-test-003',
      versionId: 'v1',
      verdict: 'reject',
      notes: 'Bad.',
    });

    expect(result.statusChanged).toBe(false);
    const order = await readOrder(projectRoot, 'ord-test-003');
    expect(order.status).toBe('in_progress'); // unchanged
  });

  // ── createReview: guards ──────────────────────────────────

  it('rejects review of a non-existent version', async () => {
    await seedDeliveredOrder('ord-test-004', 'v1');

    await expect(
      createReview(projectRoot, {
        orderId: 'ord-test-004',
        versionId: 'v-does-not-exist',
        verdict: 'pass',
      }),
    ).rejects.toThrow(/no result version 'v-does-not-exist'/);
  });

  it('rejects review when analysis is missing', async () => {
    // remove analysis to simulate missing upstream
    await fs.rm(path.join(projectRoot, '.repochan', 'analysis', 'current.json'));

    await expect(
      createReview(projectRoot, {
        orderId: 'ord-any',
        versionId: 'v1',
        verdict: 'pass',
      }),
    ).rejects.toThrow(/analysis/);
  });

  // ── createReview: overwrite semantics ─────────────────────

  it('archives prior review and writes new one on overwrite=true', async () => {
    await seedDeliveredOrder('ord-test-005', 'v1');

    // first review
    await createReview(projectRoot, {
      orderId: 'ord-test-005',
      versionId: 'v1',
      verdict: 'revise',
      notes: 'First pass — needs work.',
    });

    // second review replaces the first (order was pushed to needs_revision,
    // so the second review won't change status again since it's no longer delivered)
    const result = await createReview(projectRoot, {
      orderId: 'ord-test-005',
      versionId: 'v1',
      verdict: 'pass',
      notes: 'Second pass — fixed.',
      overwrite: true,
    });

    expect(result.review.verdict).toBe('pass');
    expect(result.review.notes).toBe('Second pass — fixed.');

    // current review file reflects the new review
    const file = reviewJsonPath(projectRoot, 'ord-test-005', 'v1');
    const onDisk = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(onDisk.verdict).toBe('pass');

    // an archive was created
    const archiveDir = path.join(projectRoot, '.repochan', 'orders', 'ord-test-005', 'reviews', 'versions');
    const archives = await fs.readdir(archiveDir);
    expect(archives.length).toBeGreaterThanOrEqual(1);
    expect(archives[0]).toContain('v1-previous');
  });

  it('refuses to overwrite an existing review without overwrite=true', async () => {
    await seedDeliveredOrder('ord-test-006', 'v1');

    await createReview(projectRoot, {
      orderId: 'ord-test-006',
      versionId: 'v1',
      verdict: 'pass',
    });

    await expect(
      createReview(projectRoot, {
        orderId: 'ord-test-006',
        versionId: 'v1',
        verdict: 'revise',
      }),
    ).rejects.toThrow(/already exists/);
  });
});
