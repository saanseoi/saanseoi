import { expect, test } from 'bun:test'
import { fixture, insert } from './reconstructRollback.fixtures.ts'
import {
  prepareRollbackMetadata,
  resolveRollbackSelection,
} from './rollbackSelection.ts'

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
