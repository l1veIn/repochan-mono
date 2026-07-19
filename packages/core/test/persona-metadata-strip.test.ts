import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createOrUpdatePersona, createPersonaCandidate } from '../src/entities/index.js';
import { initProtocol, readPersonaArtifact } from '../src/protocol/index.js';
import { seedAnalysis, canonicalPersona } from '../test-support/fixtures.js';

/**
 * Regression: `persona get` output contains artifact-metadata fields
 * (schemaVersion, generatedAt) that are NOT on PersonaDataSchema. If a caller
 * pipes get-output straight into create/update/candidate, the closed schema
 * rejected them as "additional properties" — a token-wasting trap for agents.
 *
 * createOrUpdatePersona and createPersonaCandidate now silently strip these
 * fields before validation. `provenance` is intentionally NOT stripped (it's
 * a legitimate Optional input that callers may override).
 */
describe('persona artifact-metadata strip (get → update round-trip)', () => {
  let tmpRoot: string;
  let projectRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'repochan-core-pmeta-'));
    projectRoot = tmpRoot;
    await initProtocol(projectRoot);
    await seedAnalysis(projectRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('createOrUpdatePersona accepts persona with schemaVersion + generatedAt (persona get output)', async () => {
    // canonicalPersona() simulates exactly what `repochan persona get --json` returns:
    // it carries schemaVersion + generatedAt + provenance.
    const getOutput = canonicalPersona({ name: 'RoundTripChan' });

    const result = await createOrUpdatePersona(projectRoot, {
      persona: getOutput,
      overwrite: true,
    }, 'create');

    expect(result.data.name).toBe('RoundTripChan');
    expect(result.data.schemaVersion).toBe('repochan.persona.v2');
    // generatedAt is re-injected by the entity, not the caller's value.
    expect(result.data.generatedAt).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('createOrUpdatePersona update mode accepts full get-output round-trip', async () => {
    // First create a persona to update from.
    await createOrUpdatePersona(projectRoot, {
      persona: { name: 'V1', rolePrompt: 'v1 tags', artStyle: 'cel' },
      overwrite: true,
    }, 'create');

    // Simulate: agent did `persona get`, tweaked a field, then `persona update`
    // with the FULL get output (including schemaVersion + generatedAt).
    const getOutput = await readPersonaArtifact(projectRoot);
    const tweaked = { ...getOutput, name: 'V2', motto: 'new field works' };

    const result = await createOrUpdatePersona(projectRoot, {
      persona: tweaked,
      overwrite: true,
    }, 'update');

    expect(result.data.name).toBe('V2');
    expect(result.data.motto).toBe('new field works');
    // generatedAt should be refreshed, not preserved from get output.
    expect(result.data.generatedAt).not.toBe(getOutput.generatedAt);
  });

  it('createPersonaCandidate accepts persona get output with artifact metadata', async () => {
    const getOutput = canonicalPersona({ name: 'CandChan' });

    const result = await createPersonaCandidate(projectRoot, {
      persona: getOutput,
      slug: 'draft-1',
    });

    expect(result.slug).toBe('draft-1');
    expect(result.data.name).toBe('CandChan');
    expect(result.data.schemaVersion).toBe('repochan.persona.v2');
  });

  it('does NOT strip provenance — caller-supplied provenance is preserved', async () => {
    const customProvenance = { tool: 'skill', action: 'repochan-persona', agent: 'codex' };
    const result = await createOrUpdatePersona(projectRoot, {
      persona: {
        name: 'ProvChan',
        rolePrompt: 'tags',
        artStyle: 'cel',
        provenance: customProvenance,
        // also carry artifact metadata to confirm both are handled correctly
        schemaVersion: 'repochan.persona.v2',
        generatedAt: '2020-01-01T00:00:00.000Z',
      },
      overwrite: true,
    }, 'create');

    expect(result.data.provenance).toEqual(customProvenance);
  });

  it('still rejects genuinely unknown fields (closed schema intact)', async () => {
    // mbti is not on PersonaDataSchema and is not in the strip list —
    // the closed schema should still reject it.
    await expect(
      createOrUpdatePersona(projectRoot, {
        persona: { name: 'X', rolePrompt: 'y', artStyle: 'z', mbti: 'INTJ' },
        overwrite: true,
      }, 'create'),
    ).rejects.toThrow(/must not have additional properties|mbti/);
  });
});
