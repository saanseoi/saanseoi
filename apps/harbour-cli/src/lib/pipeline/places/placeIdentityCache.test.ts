import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
} from '@repo/core/pipeline/services/places/placeIdentity'
import { writePlaceIdentityLedger } from './placeIdentityLedger'
import { reusePlaceIdentityPreparation } from './placeIdentityCache'
import { withDeliveryLock } from '../local/sqlDeliveryFiles'

test('identity preparation reuse pins source, predecessor and computation and rejects damaged evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-identities-'))
  try {
    const sourcePath = join(root, 'source.jsonl')
    await writeFile(sourcePath, 'source')
    let generated = 0
    const input = {
      sourcePath,
      scope: 'hk',
      sourceVersion: 'October',
      predecessorSnapshotId: 'September',
      computationContract: 'v1',
      releaseRoot: root,
      generate: async () => {
        generated++
        const decisions = matchPlaceIdentities(
          [placeIdentityEvidence({ id: 'publisher' }, 114, 22)],
          [],
          'hk',
          'October',
        )
        const path = join(root, 'identity-places.jsonl')
        await writeFile(
          path,
          decisions
            .map(d =>
              JSON.stringify({
                id: d.id,
                raw: { id: d.sourceId },
                sources: { placeIdentity: d },
              }),
            )
            .join('\n') + '\n',
        )
        const ledger = await writePlaceIdentityLedger({
          scope: 'hk',
          sourceVersion: 'October',
          decisions,
          stagingRoot: root,
        })
        return {
          path,
          ledger,
          bySourceId: new Map(decisions.map(d => [d.sourceId, d])),
        }
      },
    }
    await withDeliveryLock(join(root, 'identity-preparation-lock'), async () => {
      await expect(reusePlaceIdentityPreparation(input)).rejects.toThrow()
    })
    expect(generated).toBe(0)
    const first = await reusePlaceIdentityPreparation(input)
    expect(await reusePlaceIdentityPreparation(input)).toEqual(first)
    expect(generated).toBe(1)
    expect(Object.keys(first.bySourceId.get('publisher')!)).toEqual(['id'])
    const manifest = JSON.parse(
      await readFile(join(root, 'identity-preparation.json'), 'utf8'),
    )
    const assignments = await readFile(manifest.assignmentsPath, 'utf8')
    await writeFile(manifest.assignmentsPath, 'corrupt')
    await expect(reusePlaceIdentityPreparation(input)).rejects.toThrow('checksum')
    await writeFile(manifest.assignmentsPath, assignments)
    const original = await readFile(first.path, 'utf8')
    await writeFile(first.path, original + '\n')
    await expect(reusePlaceIdentityPreparation(input)).rejects.toThrow('checksum')
    await writeFile(first.path, original)
    await reusePlaceIdentityPreparation({
      ...input,
      predecessorSnapshotId: 'different',
    })
    expect(generated).toBe(2)
    await reusePlaceIdentityPreparation({ ...input, computationContract: 'v2' })
    expect(generated).toBe(3)
    await writeFile(sourcePath, 'changed source')
    const last = await reusePlaceIdentityPreparation({
      ...input,
      computationContract: 'v2',
    })
    expect(generated).toBe(4)
    await writeFile(last.ledger.path, 'corrupt')
    await expect(
      reusePlaceIdentityPreparation({ ...input, computationContract: 'v2' }),
    ).rejects.toThrow('checksum')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
