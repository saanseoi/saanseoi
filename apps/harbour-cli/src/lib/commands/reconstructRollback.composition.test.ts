import { expect, test } from 'bun:test'
import { fixture, insert } from './reconstructRollback.fixtures.ts'
import { buildAddressSearchSyncSql } from '@repo/core/pipeline/services/addresses/searchIndex'
import { buildDivisionSearchSyncSql } from '@repo/core/pipeline/services/search/divisions'
import { runNativeSqlDelivery } from '../pipeline/local/nativeSqlDelivery.ts'
import { readDeliveryPlan } from '../pipeline/local/sqlDeliveryFiles.ts'
import { verifyRollbackTerminal } from './reconstructRollback.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'

async function composedFixture() {
  const f = await fixture()
  f.meta.exec("UPDATE apiVersions SET familyType='addresses',code='addresses-v0.1'")
  insert(f.meta, 'snapshotLineages', {
    id: 'address-lineage',
    code: 'address-lineage',
    resourceType: 'address',
    regionCode: 'hk',
    identityMode: 'persistent',
    primaryDatasetId: 'dataset',
    versionHash: 'address-lineage',
  })
  insert(f.meta, 'snapshotAssembly', {
    id: 'address-assembly',
    code: 'address-assembly',
    resourceType: 'address',
    version: 1,
    status: 'scoped',
    versionHash: 'address-assembly',
  })
  for (const name of ['old', 'new']) {
    insert(f.meta, 'releases', {
      id: `release-address-${name}`,
      sourceReleaseId: `source-${name}`,
      datasetId: 'dataset',
      code: `release-address-${name}`,
      resourceType: 'address',
      sourceVersion: name,
      status: 'published',
    })
    // These sort before Division snapshots; preparation must resolve dependencies explicitly.
    insert(f.meta, 'snapshots', {
      id: `address-a-${name}`,
      code: `address-a-${name}`,
      resourceType: 'address',
      snapshotLineageId: 'address-lineage',
      parentSnapshotId: name === 'new' ? 'address-a-old' : null,
      cohortKey: '2026',
      revision: name === 'new' ? 1 : 0,
      status: 'published',
    })
    insert(f.meta, 'snapshotSources', {
      snapshotId: `address-a-${name}`,
      datasetId: 'dataset',
      resourceReleaseId: `release-address-${name}`,
      role: 'primary',
    })
    insert(f.meta, 'snapshotShardAssignments', {
      snapshotId: `address-a-${name}`,
      dataShardId: 'history',
    })
    insert(f.meta, 'apiReleaseSetSnapshots', {
      apiReleaseSetId: `set-${name}`,
      snapshotId: `address-a-${name}`,
      role: 'lookup',
      isRequired: 1,
      cohortMatchingMode: 'exact',
    })
    insert(f.meta, 'snapshotAssemblyRuns', {
      id: `assembly-${name}`,
      snapshotId: `address-a-${name}`,
      snapshotAssemblyId: 'address-assembly',
      status: 'selected',
      selectionSummaryJson: { lookupSnapshotIds: { division: `snapshot-${name}` } },
    })
  }
  f.current.exec('PRAGMA foreign_keys=OFF')
  f.current.exec("UPDATE divisions SET id='district-new' WHERE snapshotId='lineage'")
  f.current.exec(
    "UPDATE divisionsI18n SET divisionId='district-new' WHERE snapshotId='lineage'",
  )
  f.current.exec('PRAGMA foreign_keys=ON')
  insert(f.current, 'addressPublicationState', {
    scopeId: 'address-lineage',
    snapshotId: 'address-a-new',
    status: 'current',
    publicationToken: 'address-new-token',
    preparedAt: '2026-01-01',
  })
  insert(f.current, 'address2d', {
    snapshotId: 'address-lineage',
    id: 'home',
    divisionSnapshotId: 'lineage',
    districtId: 'district-new',
    granularity: 'building',
  })
  insert(f.current, 'address2dI18n', {
    snapshotId: 'address-lineage',
    addressId: 'home',
    locale: 'en',
    formattedAddress: 'New District Home',
  })
  for (const statement of buildDivisionSearchSyncSql([
    { scopeId: 'search-main', snapshotId: 'snapshot-new' },
    { scopeId: 'search-other', snapshotId: 'snapshot-other' },
  ]))
    f.current.exec(statement)
  for (const statement of buildAddressSearchSyncSql([
    { scopeId: 'address-search', snapshotId: 'address-a-new' },
  ]))
    f.current.exec(statement)
  const envelope = {
    snapshotId: 'address-a-old',
    sourceReleaseId: 'release-address-old',
    isCurrent: 0,
  }
  insert(f.history, 'address2d', {
    ...envelope,
    id: 'home',
    districtId: 'district',
    granularity: 'building',
    versionHash: 'address-base',
  })
  insert(f.history, 'address2dI18n', {
    ...envelope,
    addressId: 'home',
    locale: 'en',
    formattedAddress: 'Old District Home',
    versionHash: 'address-en',
  })
  for (const [recordType, locale, versionHash] of [
    ['address2d', '', 'address-base'],
    ['address2dI18n', 'en', 'address-en'],
  ])
    insert(f.history, 'snapshotVersionChanges', {
      snapshotId: 'address-a-old',
      recordType,
      recordId: 'home',
      locale,
      versionHash,
      operation: 'upsert',
      sourceReleaseId: 'release-address-old',
    })
  expect(f.current.query('PRAGMA foreign_key_check').all()).toEqual([])
  return f
}

test('composed rollback reconstructs Division before Address and validates foreign keys after both projections', async () => {
  const f = await composedFixture()
  try {
    const unrelated = f.current
      .query("SELECT rowid,* FROM divisions WHERE snapshotId='other'")
      .all()
    const plan = await f.prepare()
    const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
    if (!terminal) throw new Error('Expected rollback completion contract')
    expect(terminal.claims.map(claim => claim.table)).toEqual([
      'divisionPublicationState',
      'addressPublicationState',
    ])
    expect(
      f.current
        .query("SELECT districtId FROM address2d WHERE snapshotId='address-lineage'")
        .get(),
    ).toEqual({ districtId: 'district-new' })
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, terminal)
    expect(f.current.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      f.current.query("SELECT id FROM divisions WHERE snapshotId='lineage'").all(),
    ).toEqual([{ id: 'district' }])
    expect(
      f.current
        .query(
          "SELECT divisionSnapshotId,districtId FROM address2d WHERE snapshotId='address-lineage'",
        )
        .get(),
    ).toEqual({ divisionSnapshotId: 'lineage', districtId: 'district' })
    expect(
      f.current
        .query(
          "SELECT snapshotId,status FROM addressPublicationState WHERE scopeId='address-lineage'",
        )
        .get(),
    ).toEqual({ snapshotId: 'address-a-old', status: 'current' })
    expect(
      f.current
        .query(
          "SELECT formattedAddress FROM addressSearchFts WHERE scopeId='address-search'",
        )
        .get(),
    ).toEqual({ formattedAddress: 'Old District Home' })
    expect(
      f.current
        .query(
          "SELECT divisionId,nameText FROM divisionSearchFts WHERE scopeId='search-main' AND locale='en'",
        )
        .get(),
    ).toEqual({ divisionId: 'district', nameText: 'Old Name' })
    expect(
      f.current.query("SELECT rowid,* FROM divisions WHERE snapshotId='other'").all(),
    ).toEqual(unrelated)
  } finally {
    await f.close()
  }
})

test('composition preparation refuses unresolved retained foreign keys before sealing any payload', async () => {
  const f = await composedFixture()
  try {
    insert(f.current, 'address2d', {
      snapshotId: 'unrelated-address',
      id: 'other-home',
      divisionSnapshotId: 'lineage',
      districtId: 'district-new',
    })
    await expect(f.prepare()).rejects.toThrow('invalidate a dependent current family')
    expect(await readDeliveryPlan(f.directory)).toBeNull()
    expect(f.current.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(
      f.current
        .query("SELECT districtId FROM address2d WHERE snapshotId='unrelated-address'")
        .get(),
    ).toEqual({ districtId: 'district-new' })
  } finally {
    await f.close()
  }
})

test('first-publication rollback can leave a completely empty search selection and catalogue', async () => {
  const f = await fixture(false)
  try {
    f.current.exec("DELETE FROM divisionSearchFts WHERE scopeId='search-other'")
    f.current.exec("DELETE FROM divisionSearchScopes WHERE scopeId='search-other'")
    f.current.exec("DELETE FROM divisions WHERE snapshotId='other'")
    f.current.exec("DELETE FROM divisionPublicationState WHERE scopeId='other'")
    f.meta.exec(
      "DELETE FROM apiCatalogRevisionReleaseSets WHERE apiReleaseSetId='set-other'",
    )
    const plan = await f.prepare()
    const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
    if (!terminal) throw new Error('Expected rollback completion contract')
    await runNativeSqlDelivery(f.directory, { files: f.files })
    await verifyRollbackTerminal(f.files, terminal)
    for (const table of [
      'divisionSearchFts',
      'divisionSearchScopes',
      'divisionPublicationState',
      'divisions',
      'divisionsI18n',
    ])
      expect(f.current.query(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({
        n: 0,
      })
    expect(
      f.meta
        .query(
          'SELECT count(*) AS n FROM apiCatalogRevisionReleaseSets WHERE apiCatalogRevisionId=?',
        )
        .get(terminal.catalogId),
    ).toEqual({ n: 0 })
  } finally {
    await f.close()
  }
})
