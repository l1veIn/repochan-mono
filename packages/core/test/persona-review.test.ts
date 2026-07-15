import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createPersonaReview } from '../src/entities/index.js';
import { initProtocol } from '../src/protocol/index.js';
import { personaReviewPath, personaReviewVersionsDir } from '../src/protocol/index.js';
import { seedUpstream } from '../test-support/fixtures.js';

describe('persona review', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-preview-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    await seedUpstream(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('writes review file when persona exists', async () => {
    const result = await createPersonaReview(projectRoot, {
      verdict: 'revise',
      notes: 'Make the character feel more mature — increase age appearance, refine the outfit.',
      reviewerRole: 'user',
    });

    expect(result.review.verdict).toBe('revise');
    expect(result.review.schemaVersion).toBe('repochan.persona-review.v1');
    expect(result.review.notes).toContain('mature');

    // file on disk
    const onDisk = JSON.parse(await fs.readFile(personaReviewPath(projectRoot), 'utf8'));
    expect(onDisk.verdict).toBe('revise');
    expect(onDisk.reviewerRole).toBe('user');
  });

  it('rejects review when persona does not exist', async () => {
    await fs.rm(path.join(projectRoot, '.repochan', 'persona', 'current.json'));

    await expect(
      createPersonaReview(projectRoot, { verdict: 'pass', notes: 'ok' }),
    ).rejects.toThrow(/persona/i);
  });

  it('refuses to overwrite an existing review without overwrite=true', async () => {
    await createPersonaReview(projectRoot, { verdict: 'pass', notes: 'first review' });

    await expect(
      createPersonaReview(projectRoot, { verdict: 'revise', notes: 'second review' }),
    ).rejects.toThrow(/already exists/);
  });

  it('archives prior review and writes new one on overwrite=true', async () => {
    await createPersonaReview(projectRoot, { verdict: 'pass', notes: 'first — looks good' });

    const result = await createPersonaReview(projectRoot, {
      verdict: 'revise',
      notes: 'second — actually wants more mature feel',
      overwrite: true,
    });

    expect(result.review.verdict).toBe('revise');

    // current review reflects the new one
    const onDisk = JSON.parse(await fs.readFile(personaReviewPath(projectRoot), 'utf8'));
    expect(onDisk.verdict).toBe('revise');

    // archive was created
    const archiveDir = personaReviewVersionsDir(projectRoot);
    const archives = await fs.readdir(archiveDir);
    expect(archives.length).toBeGreaterThanOrEqual(1);
    expect(archives[0]).toContain('previous');
  });
});
