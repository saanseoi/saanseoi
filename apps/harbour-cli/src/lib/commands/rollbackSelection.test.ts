import { expect, test } from 'bun:test'
import { fixture, insert } from './reconstructRollback.fixtures.ts'
import {
  prepareRollbackMetadata,
  resolveRollbackSelection,
} from './rollbackSelection.ts'
import { runNativeSqlDelivery } from '../pipeline/local/nativeSqlDelivery.ts'

test('rollback retains a companion snapshot used by an unrelated catalogue member', async () => {
  const f = await fixture()
  try {
    insert(f.meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: 'set-new',
      snapshotId: 'snapshot-other',
      role: 'companion',
      isRequired: 1,
      cohortMatchingMode: 'exact',
    })
    const selection = resolveRollbackSelection(f.meta, 'release-new')
    expect(selection.changes.map(snapshot => snapshot.id)).toEqual(['snapshot-new'])
    expect(selection.restores.map(snapshot => snapshot.id)).toEqual(['snapshot-old'])
    expect(selection.removedScopes.has('other')).toBe(false)
  } finally {
    await f.close()
  }
})

for (const [label, mutation] of [
  [
    'catalogue membership',
    "DELETE FROM apiCatalogRevisionReleaseSets WHERE apiReleaseSetId='set-other'",
  ],
  [
    'predecessor composition',
    "DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId='set-old'",
  ],
  [
    'predecessor identity',
    "UPDATE snapshots SET cohortKey='2025' WHERE id='snapshot-old'",
  ],
  ['source ownership', "DELETE FROM snapshotSources WHERE snapshotId='snapshot-new'"],
  [
    'predecessor release state',
    "UPDATE releases SET status='revoked' WHERE id='release-old'",
  ],
] as const)
  test(`sealed rollback rejects changed ${label} before claiming current rows`, async () => {
    const f = await fixture()
    try {
      await f.prepare()
      f.meta.exec(mutation)
      await expect(
        runNativeSqlDelivery(f.directory, { files: f.files }),
      ).rejects.toThrow()
      expect(
        f.current
          .query(
            "SELECT status,publicationToken FROM divisionPublicationState WHERE scopeId='lineage'",
          )
          .get(),
      ).toEqual({
        status: 'current',
        publicationToken: 'token-lineage',
      })
      expect(
        f.meta.query("SELECT status FROM releases WHERE id='release-new'").get(),
      ).toEqual({ status: 'published' })
    } finally {
      await f.close()
    }
  })

test('rollback chooses a surviving default domain when removing the original domain', async () => {
  const f = await fixture(false)
  try {
    const prepared = prepareRollbackMetadata(
      f.meta,
      resolveRollbackSelection(f.meta, 'release-new'),
      '2026-02-01T00:00:00.000Z',
    )
    f.meta.transaction(() => {
      for (const statement of prepared.metadata)
        f.meta.query(statement.sql).run(...statement.params)
    })()
    expect(
      f.meta
        .query('SELECT defaultDomainCode FROM apiCatalogRevisions WHERE id=?')
        .get(prepared.terminal.catalogId),
    ).toEqual({ defaultDomainCode: 'hkgov-pland-pu' })
  } finally {
    await f.close()
  }
})

test('rollback preserves an independent publication that only references the release as a lookup', async () => {
  const f = await fixture()
  try {
    insert(f.meta, 'snapshotSources', {
      snapshotId: 'snapshot-other',
      datasetId: 'dataset',
      resourceReleaseId: 'release-new',
      role: 'lookup',
    })
    const selection = resolveRollbackSelection(f.meta, 'release-new')
    expect(selection.selected.map(pair => pair.current.id)).toEqual(['set-new'])
    expect(selection.changes.map(snapshot => snapshot.id)).toEqual(['snapshot-new'])
    expect(
      selection.newMembers.some(member => member.apiReleaseSetId === 'set-other'),
    ).toBe(true)
    const prepared = prepareRollbackMetadata(
      f.meta,
      selection,
      '2026-02-01T00:00:00.000Z',
    )
    f.meta.transaction(() => {
      for (const statement of prepared.metadata)
        f.meta.query(statement.sql).run(...statement.params)
    })()
    const { resolveAcceptedSnapshotParent } = await import(
      '../../../../../libs/core/src/lib/db/snapshotParent.ts'
    )
    const parent = await resolveAcceptedSnapshotParent(f.context.metaDb as never, {
      lineageId: 'other',
      cohortKey: '2026',
      identityMode: 'persistent',
    })
    expect(parent?.id).toBe('snapshot-other')
  } finally {
    await f.close()
  }
})
