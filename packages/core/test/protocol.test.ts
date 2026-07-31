import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { symlinkDir } from '../test-support/symlink.js';
import {
  safeProtocolPath,
  initProtocol,
  inspectProtocol,
  protocolVersionPath,
  writeJson,
  readJson,
  exists,
  PROTOCOL_DIR,
} from '../src/protocol/index.js';

describe('protocol primitives', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-test-'));
    projectRoot = tmpRoot;
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('safeProtocolPath rejects paths that escape .repochan', () => {
    const bad = '../outside.json';
    expect(() => safeProtocolPath(projectRoot, bad)).toThrow(/Refusing to access path outside/);
  });

  it('safeProtocolPath accepts valid paths inside .repochan', () => {
    const p = safeProtocolPath(projectRoot, '.repochan/analysis/current.json');
    expect(p).toContain(PROTOCOL_DIR);
    expect(p).toContain('current.json');
  });

  it('initProtocol creates the standard directory layout', async () => {
    await initProtocol(projectRoot);
    const r = path.join(projectRoot, PROTOCOL_DIR);

    const expectedDirs = [
      r,
      path.join(r, 'analysis', 'versions'),
      path.join(r, 'persona', 'versions'),
      path.join(r, 'orders'),
    ];

    for (const d of expectedDirs) {
      expect(await exists(d)).toBe(true);
    }

    expect(await exists(path.join(r, 'config.json'))).toBe(false);
  });

  it('rejects a protocol root symlink without writing to its destination', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-outside-'));
    await symlinkDir(outside, path.join(projectRoot, PROTOCOL_DIR));
    try {
      await expect(initProtocol(projectRoot)).rejects.toThrow(/symbolic link/);
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects nested protocol symlinks for reads and writes', async () => {
    await initProtocol(projectRoot);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-outside-'));
    const analysis = path.join(projectRoot, PROTOCOL_DIR, 'analysis');
    await fs.rm(analysis, { recursive: true, force: true });
    await symlinkDir(outside, analysis);
    const target = path.join(analysis, 'current.json');
    try {
      await expect(writeJson(target, { escaped: true })).rejects.toThrow(/symbolic link/);
      await expect(readJson(target)).rejects.toThrow(/symbolic link/);
      expect(await fs.readdir(outside)).toEqual([]);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('protocolVersionPath produces conventional locations', () => {
    const v1 = protocolVersionPath('analysis/current.json');
    expect(v1).toMatch(/^analysis\/versions\/.*\.json$/);

    const v2 = protocolVersionPath('persona/current.json');
    expect(v2).toMatch(/^persona\/versions\/.*\.json$/);

    const v3 = protocolVersionPath('orders/ord-123/order.json');
    expect(v3).toMatch(/^orders\/ord-123\/versions\/.*\.json$/);
  });

  it('writeJson refuses overwrite by default and succeeds with overwrite=true', async () => {
    await initProtocol(projectRoot);
    const target = path.join(projectRoot, PROTOCOL_DIR, 'analysis', 'current.json');

    await writeJson(target, { hello: 'world' }, false);
    expect(await exists(target)).toBe(true);

    await expect(writeJson(target, { hello: 'again' }, false)).rejects.toThrow(/Refusing to overwrite/);

    await writeJson(target, { hello: 'again' }, true);
    const data = await readJson(target);
    expect(data.hello).toBe('again');
  });

  it('writeJson preserves the published file and removes staging files when serialization fails', async () => {
    await initProtocol(projectRoot);
    const target = path.join(projectRoot, PROTOCOL_DIR, 'analysis', 'current.json');
    await writeJson(target, { stable: true });

    await expect(writeJson(target, { invalid: 1n }, true)).rejects.toThrow();
    expect(await readJson(target)).toEqual({ stable: true });
    const entries = await fs.readdir(path.dirname(target));
    expect(entries.filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
  });

  it('inspectProtocol reports presence of top-level artifacts', async () => {
    await initProtocol(projectRoot);
    const summary1 = await inspectProtocol(projectRoot);
    expect(summary1.exists).toBe(true);
    expect(summary1.analysis).toBe(false);
    expect(summary1.persona).toBe(false);

    // create minimal files
    const r = path.join(projectRoot, PROTOCOL_DIR);
    await writeJson(path.join(r, 'analysis', 'current.json'), { foo: 1 }, true);
    await writeJson(path.join(r, 'persona', 'current.json'), { bar: 2 }, true);

    const summary2 = await inspectProtocol(projectRoot);
    expect(summary2.analysis).toBe(true);
    expect(summary2.persona).toBe(true);
  });
});
