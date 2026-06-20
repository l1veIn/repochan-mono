import { describe, it, expect } from 'vitest';
import {
  normalizeOrder,
  deepMerge,
  isValidStatusTransition,
  isValidOrderStatus,
  requireValidStatus,
  validateOrderId,
  validateVersionId,
  orderIdsFromParams,
  areOrdersApprovedForExecution,
  ORDER_STATUSES,
} from '../src/utils/index.js';
import type { AssetOrder, OrderStatus } from '../src/types.js';

describe('utils (pure)', () => {
  it('normalizeOrder fills defaults and schemaVersion', () => {
    const input: Partial<AssetOrder> = {
      orderId: 'ord-test-001',
      requestType: 'new_asset',
      assetType: 'readme-hero',
      brief: { intent: 'test', mustInclude: [], avoid: [], creativeFreedom: [] },
      deliverables: [],
      acceptanceCriteria: [],
    };

    const out = normalizeOrder(input as AssetOrder, 'batch-xyz');

    expect(out.status).toBe('draft');
    expect(out.priority).toBe('normal');
    expect(out.schemaVersion).toBe('repochan.asset-order.v1');
    expect(out.batchId).toBe('batch-xyz');
    expect(out.createdAt).toBeDefined();
  });

  it('deepMerge merges recursively without mutating originals', () => {
    const base = { a: { b: 1 }, c: 2 };
    const patch = { a: { d: 3 }, e: 4 };

    const result = deepMerge(base, patch);

    expect(result).toEqual({ a: { b: 1, d: 3 }, c: 2, e: 4 });
    expect(base).toEqual({ a: { b: 1 }, c: 2 }); // not mutated
  });

  it('status machine allows and rejects transitions correctly', () => {
    expect(isValidStatusTransition('draft', 'approved')).toBe(true);
    expect(isValidStatusTransition('approved', 'in_progress')).toBe(true);
    expect(isValidStatusTransition('delivered', 'needs_revision')).toBe(true);
    expect(isValidStatusTransition('draft', 'delivered')).toBe(false);
    expect(isValidStatusTransition(undefined, 'approved')).toBe(true);
  });

  it('validate* functions throw on bad ids and pass good ones', () => {
    expect(() => validateOrderId('bad')).toThrow();
    expect(validateOrderId('ord-abc-123')).toBe('ord-abc-123');

    expect(validateVersionId('v1')).toBe('v1');
  });

  it('orderIdsFromParams collects and validates ids from various param shapes', () => {
    const ids = orderIdsFromParams({ orderId: 'ord-1', orderIds: ['ord-2', 'ord-3'] });
    expect(ids).toEqual(['ord-1', 'ord-2', 'ord-3']);
  });

  it('areOrdersApprovedForExecution respects allowUnapproved', () => {
    const orders = [{ status: 'approved' }, { status: 'draft' }];
    expect(areOrdersApprovedForExecution(orders, false)).toBe(false);
    expect(areOrdersApprovedForExecution(orders, true)).toBe(true);
  });
});
