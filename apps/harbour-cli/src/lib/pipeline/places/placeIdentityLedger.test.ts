import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
} from '@repo/core/pipeline/services/places/placeIdentity'
import { writePlaceIdentityLedger } from './placeIdentityLedger'

test('ledger is deterministic, immutable and refuses corrupt existing evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'identity-ledger-'))
  try {
    const decisions = matchPlaceIdentities(
      ['b', 'a'].map(id => placeIdentityEvidence({ id }, 114, 22)),
      [],
      'hk',
      'release',
    )
    const input = {
      scope: 'hk',
      sourceVersion: 'release',
      decisions,
      stagingRoot: root,
    }
    const first = await writePlaceIdentityLedger(input)
    expect(first.path.startsWith(root)).toBe(true)
    expect(first.storage).toBe('r2-audit-partitions')
    expect(first).not.toHaveProperty('fixturePath')
    expect(
      await writePlaceIdentityLedger({ ...input, decisions: [...decisions].reverse() }),
    ).toEqual(first)
    const rows = (await readFile(first.path, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(rows[0]).toMatchObject({
      basis: 'automatic',
      records: 2,
      sourceRelease: 'release',
    })
    expect(rows[1].sourceId).toBe('a')
    await writeFile(first.path, 'corrupt')
    await expect(writePlaceIdentityLedger(input)).rejects.toThrow(
      'differs from its hash',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
