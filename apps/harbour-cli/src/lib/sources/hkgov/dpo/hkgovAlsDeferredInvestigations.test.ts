import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { reviewAlsDeletions } from './hkgovAlsDeletionPreflight'
import type { AlsMembership, AlsMembershipAddress } from './hkgovAlsMembership'
const address = (id: string): AlsMembershipAddress => ({
  id,
  level: 'building',
  parentId: null,
  en: `${id} BUILDING`,
  zhHant: `${id}大廈`,
  coordinates: [114.1, 22.3],
  sourceIds: ['source'],
  curations: [],
})
function membership(version: string, id: string): AlsMembership {
  return {
    schemaVersion: 1,
    sourceVersion: version,
    addresses: [address(id)],
    collections: [],
    sources: [{ id: 'source', kind: '2d', canonicalIds: [id] }],
    aliases: [],
  }
}
test('explicit 2026 deferral preserves evidence, permits ingestion, and remains distinct from approval', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-deferred-'))
  try {
    const previous = membership('2025-12-16.0', 'old'),
      current = membership('2026-02-04.0', 'new')
    const input = {
      previous,
      current,
      reportFile: join(directory, 'report.json'),
      approvalsFile: join(directory, 'approvals.json'),
      investigationsDirectory: directory,
    }
    expect((await reviewAlsDeletions(input)).ingestionDisposition).toBe('blocked')
    const report = await reviewAlsDeletions({
      ...input,
      deferAuthority: 'User authorises uncertain 2026 cases to remain pending',
    })
    expect(report.requiresReview).toBe(true)
    expect(report.reviewStatus).toBe('needs-further-investigation')
    expect(report.ingestionDisposition).toBe('ready-with-investigations')
    expect(report.reviewedRetirements).toEqual([])
    const file = report.investigationsFile!
    const queue = JSON.parse(await readFile(file, 'utf8'))
    expect(queue.cases[0].previous).toEqual(previous.addresses[0])
    expect(queue.cases[0].candidates[0].address).toEqual(current.addresses[0])
    expect((await reviewAlsDeletions(input)).reviewStatus).toBe(
      'needs-further-investigation',
    )
    const changed = structuredClone(current)
    changed.addresses[0]!.en = 'Changed successor'
    expect(
      (await reviewAlsDeletions({ ...input, current: changed })).ingestionDisposition,
    ).toBe('blocked')
    queue.cases[0].previous.en = 'Tampered evidence'
    await writeFile(file, JSON.stringify(queue))
    expect((await reviewAlsDeletions(input)).ingestionDisposition).toBe('blocked')
    expect(
      (
        await reviewAlsDeletions({
          ...input,
          current: membership('2025-12-31.0', 'new'),
          deferAuthority: '2026 only',
        })
      ).ingestionDisposition,
    ).toBe('blocked')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('deferred inventories retain all unit IDs and corrupt hierarchy still fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-deferred-inventory-'))
  try {
    const previous = membership('2025-12-16.0', 'old'),
      current = membership('2026-02-04.0', 'new')
    previous.collections = [
      {
        id: 'collection',
        ownerId: 'old',
        sourceIds: ['units-source'],
        units: [['unit-1', '1', 'A', '1/F A', '1樓A']],
      },
    ]
    previous.sources.push({
      id: 'units-source',
      kind: '3d',
      canonicalIds: ['old'],
      units: ['["1","A"]'],
    })
    const input = {
      previous,
      current,
      reportFile: join(directory, 'report.json'),
      approvalsFile: join(directory, 'approvals.json'),
      investigationsDirectory: directory,
      deferAuthority: 'User 2026 investigation policy',
    }
    const report = await reviewAlsDeletions(input)
    const queue = JSON.parse(await readFile(report.investigationsFile!, 'utf8'))
    expect(queue.inventories[0].previous).toEqual(previous.collections[0])
    current.addresses[0]!.parentId = 'missing-parent'
    await expect(reviewAlsDeletions(input)).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('only semantic preparation issues can be deferred and their seal stays exact', async () => {
  const { deferAlsPreparationReview } = await import('./hkgovAlsDeferredInvestigations')
  const directory = await mkdtemp(join(tmpdir(), 'als-prep-deferred-'))
  try {
    const input = {
      sourceVersion: '2026-02-04.0',
      reviewSha256: 'sealed-review',
      issues: [{ code: 'identity-drift', evidence: { previous: 'a', current: 'b' } }],
      authority: 'User 2026 policy',
      directory,
    }
    expect(await deferAlsPreparationReview(input)).toBe(true)
    const street = {
      ...input,
      reviewSha256: 'street-conflict',
      issues: [
        {
          code: 'street-component-conflict',
          record: { id: 'a' },
          decision: { street: 'reviewed' },
          conflicts: [{ actual: 'source', expected: 'reviewed' }],
        },
      ],
    }
    expect(await deferAlsPreparationReview({ ...street, authority: undefined })).toBe(
      false,
    )
    expect(await deferAlsPreparationReview(street)).toBe(true)
    expect(
      await deferAlsPreparationReview({
        ...input,
        reviewSha256: 'reviewed-omission',
        issues: [
          {
            code: 'reviewed-inventory-omission',
            decision: { unitAliasPairs: [['alias', 'canonical']] },
            owner: { id: 'owner' },
          },
        ],
      }),
    ).toBe(true)
    expect(await deferAlsPreparationReview({ ...street, authority: undefined })).toBe(
      true,
    )

    expect(await deferAlsPreparationReview({ ...input, authority: undefined })).toBe(
      true,
    )
    expect(
      await deferAlsPreparationReview({
        ...input,
        authority: undefined,
        reviewSha256: 'different',
      }),
    ).toBe(false)
    expect(
      await deferAlsPreparationReview({
        ...input,
        issues: [{ code: 'division-linkage' }],
      }),
    ).toBe(false)
    expect(
      await deferAlsPreparationReview({
        ...input,
        issues: [{ code: 'invalid-inventory' }],
      }),
    ).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('partial unit-inventory spikes are queued with their prior owners', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'als-unit-spike-'))
  try {
    const previous = membership('2025-12-16.0', 'owner'),
      current = membership('2026-02-04.0', 'owner')
    const units = Array.from(
      { length: 1001 },
      (_, i) =>
        [`unit-${i}`, '1', String(i), `1/F ${i}`, `1樓${i}`] as [
          string,
          string,
          string,
          string,
          string,
        ],
    )
    previous.collections = [
      { id: 'collection', ownerId: 'owner', sourceIds: ['units-source'], units },
    ]
    current.collections = [
      {
        id: 'collection',
        ownerId: 'owner',
        sourceIds: ['units-source'],
        units: units.slice(0, 1),
      },
    ]
    for (const value of [previous, current])
      value.sources.push({
        id: 'units-source',
        kind: '3d',
        canonicalIds: ['owner'],
        units: value.collections[0]!.units.map(([, floor, unit]) =>
          JSON.stringify([floor, unit]),
        ),
      })
    const report = await reviewAlsDeletions({
      previous,
      current,
      reportFile: join(directory, 'report.json'),
      approvalsFile: join(directory, 'approvals.json'),
      investigationsDirectory: directory,
      deferAuthority: 'User-authorised 2026 investigations',
    })
    expect(report.ingestionDisposition).toBe('ready-with-investigations')
    const queue = JSON.parse(await readFile(report.investigationsFile!, 'utf8'))
    expect(queue.cases).toHaveLength(1000)
    expect(queue.cases[0].previous.parentId).toBe('owner')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
