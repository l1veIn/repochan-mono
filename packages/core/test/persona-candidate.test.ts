import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  createOrUpdatePersona,
  createPersonaCandidate,
  promotePersonaCandidate,
  listPersonaCandidates,
} from '../src/entities/index.js';
import { initProtocol } from '../src/protocol/index.js';
import { personaCandidatePath } from '../src/protocol/index.js';

function makePersona(name: string) {
  return { name, rolePrompt: `${name} visual tags` };
}

describe('persona candidate', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-pcand-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);

    const r = path.join(projectRoot, '.repochan');
    await fs.writeFile(path.join(r, 'analysis', 'current.json'), JSON.stringify({ summary: 'test' }));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('writes candidate to candidates/<slug>.json without touching current.json', async () => {
    const result = await createPersonaCandidate(projectRoot, {
      persona: makePersona('Reyna'),
      slug: 'mature',
    });

    expect(result.slug).toBe('mature');
    expect(result.data.name).toBe('Reyna');
    expect(result.data.schemaVersion).toBe('repochan.persona.v1');

    // current.json should NOT exist — candidate doesn't promote
    const currentExists = await fs.access(
      path.join(projectRoot, '.repochan', 'persona', 'current.json'),
    ).then(() => true).catch(() => false);
    expect(currentExists).toBe(false);

    // candidate file exists
    const onDisk = JSON.parse(await fs.readFile(personaCandidatePath(projectRoot, 'mature'), 'utf8'));
    expect(onDisk.name).toBe('Reyna');
  });

  it('allows multiple candidates to coexist', async () => {
    await createPersonaCandidate(projectRoot, { persona: makePersona('A'), slug: 'mature' });
    await createPersonaCandidate(projectRoot, { persona: makePersona('B'), slug: 'playful' });
    await createPersonaCandidate(projectRoot, { persona: makePersona('C'), slug: 'serious' });

    const slugs = await listPersonaCandidates(projectRoot);
    expect(slugs).toEqual(['mature', 'playful', 'serious']);
  });

  it('promotes candidate to current, archives old current, deletes candidate file', async () => {
    // First establish a current persona
    await createOrUpdatePersona(projectRoot, {
      persona: makePersona('Original'),
      overwrite: true,
    });

    // Create a candidate
    await createPersonaCandidate(projectRoot, { persona: makePersona('NewChoice'), slug: 'mature' });

    // Promote it
    const result = await promotePersonaCandidate(projectRoot, 'mature');
    expect(result.data.name).toBe('NewChoice');
    expect(result.previousArchived).toBe(true);

    // current.json now has the promoted data
    const current = JSON.parse(await fs.readFile(
      path.join(projectRoot, '.repochan', 'persona', 'current.json'), 'utf8',
    ));
    expect(current.name).toBe('NewChoice');

    // old current was archived
    const versionsDir = path.join(projectRoot, '.repochan', 'persona', 'versions');
    const archives = (await fs.readdir(versionsDir)).filter((f) => f.includes('previous'));
    expect(archives.length).toBeGreaterThanOrEqual(1);

    // candidate file was deleted
    const candidateExists = await fs.access(
      personaCandidatePath(projectRoot, 'mature'),
    ).then(() => true).catch(() => false);
    expect(candidateExists).toBe(false);
  });

  it('rejects promotion of a non-existent candidate', async () => {
    await expect(
      promotePersonaCandidate(projectRoot, 'nonexistent'),
    ).rejects.toThrow(/does not exist/);
  });

  it('refuses to overwrite an existing candidate without overwrite=true', async () => {
    await createPersonaCandidate(projectRoot, { persona: makePersona('A'), slug: 'mature' });

    await expect(
      createPersonaCandidate(projectRoot, { persona: makePersona('B'), slug: 'mature' }),
    ).rejects.toThrow(/already exists/);
  });
});
