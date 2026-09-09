import { expect, test } from 'bun:test'
import { join } from 'node:path'
import addressFixtureOfficialLineage from '../../../../../fixtures/meta/apiFields/api-addresses-v0.1@official-lineage.json'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
  publishSnapshot,
} from '@repo/core/db/metaRegistry'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/placeAddressAssembly'
import {
  createTempDir,
  handlePublishDataset,
  handleReconcileDraftReleaseSets,
  initDb,
  seedSnapshot,
} from './controlFixtures.fixtures.ts'

test('every resource release requires an audit, including deferred publication', async () => {
  const sqlite = initDb(join(createTempDir(), 'mandatory-audits.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const fixture = insertFixtureRelease(sqlite, {
    releaseId: 'mandatory-audit-release',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-06',
    type: 'division',
    sourceVersion: '2026-06-24.0',
    rawObjectKey: 'division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-24T00:00:00.000Z',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  })
  const release = { id: fixture.releaseId }
  sqlite.query('DELETE FROM releaseProvenance WHERE releaseId = ?').run(release.id)
  for (const type of [
    'division',
    'divisionArea',
    'divisionBoundary',
    'divisionStatistic',
    'address',
    'place',
    'street',
  ]) {
    sqlite
      .query("UPDATE releases SET resourceType = ?, status = 'staged' WHERE id = ?")
      .run(type, release.id)
    await expect(
      handlePublishDataset(db, { releaseId: release.id, deferApiReleaseSet: true }),
    ).rejects.toThrow('requires a verified retained processing result')
    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get(release.id),
    ).toEqual({ status: 'staged' })
  }
  sqlite.close()
})

test('requires retained processing audits for Addresses and Places before publishing their API provenance', async () => {
  for (const datasetType of ['address', 'place'] as const) {
    const tempDir = createTempDir()
    const dbPath = join(tempDir, `harbour-publish-${datasetType}-fixture-gap.sqlite`)
    const sqlite = initDb(dbPath)
    const db = createLocalHarbourDb(sqlite)
    const source = datasetType === 'address' ? 'hkgov-dpo' : 'overture'
    const datasetId =
      datasetType === 'address' ? 'hkgov-dpo-hk-address' : 'overture-hk-place'
    const releaseCode = `dr-hk-${source}-${datasetType}-2026-06-24.0`
    const releaseId = `release-${releaseCode}`
    const snapshotId = `snapshot-${releaseId}`
    let supplementarySnapshotCode: string | null = null

    if (datasetType === 'address') {
      // Historical address releases remain published history rather than
      // replacing the newer active API cohort.
      sqlite
        .query(
          `UPDATE apiReleaseSets
           SET regionCode = ?, cohortKey = ?, validFrom = ?, validTo = null
           WHERE id = ?`,
        )
        .run(
          'hk',
          '2026-07',
          '2026-07-22T00:00:00.000Z',
          'api-release-set-data-hk-addresses-2026-06-17.0',
        )
    }

    if (datasetType === 'place') {
      sqlite.exec(`
        INSERT OR IGNORE INTO datasets (
          id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, sourceUrl, versionHash, createdAt, updatedAt
        ) VALUES (
          'overture-hk-place',
          'publisher-overture',
          'ds-hk-overture-place',
          'hk',
          'static',
          'monthly',
          'places',
          'https://docs.overturemaps.org/schema/reference/places/place/',
          'vh-dataset-overture-hk-place-v1',
          1718236800000,
          1718236800000
        );

        UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'place') WHERE id = 'overture-hk-place' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'place');
      `)
    }

    insertFixtureRelease(sqlite, {
      releaseId,
      source,
      regionCode: 'hk',
      cohortKey: '2026-06',
      type: datasetType,
      sourceVersion: '2026-06-24.0',
      rawObjectKey: `hk/${source}/2026-06-24.0/${datasetType}.parquet`,
      originalFileName: `${datasetType}.parquet`,
      status: 'staged',
      ingestedAt: '2026-06-05T00:01:00.000Z',
      createdAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:01:00.000Z',
    })
    sqlite
      .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
      .run('1.17.0', releaseId)
    await expect(handlePublishDataset(db, { releaseId })).rejects.toThrow(
      'requires a verified retained processing result',
    )
    sqlite
      .query(
        'INSERT INTO releaseProvenance (releaseId, manifestHash, byteLength, applicationCount, attemptStatus) VALUES (?, ?, 1, 0, ?)',
      )
      .run(releaseId, `sha256:${'0'.repeat(64)}`, 'failed')
    await expect(handlePublishDataset(db, { releaseId })).rejects.toThrow(
      'failed processing audit attempt',
    )
    expect(
      sqlite.query('SELECT status FROM releases WHERE id = ?').get(releaseId),
    ).toEqual({ status: 'staged' })
    sqlite
      .query(
        "UPDATE releaseProvenance SET attemptStatus = 'completed' WHERE releaseId = ?",
      )
      .run(releaseId)
    if (datasetType === 'address') {
      sqlite
        .query('UPDATE releases SET sourceSchemaVersion = ? WHERE id = ?')
        .run('3.2', releaseId)
    }
    seedSnapshot(sqlite, {
      code: `ss-hk-${datasetType}-2026-06-24.0`,
      datasetId,
      resourceType: datasetType,
      releaseId,
      snapshotId,
      status: 'draft',
      timestamp: 1762300860000,
    })
    await upsertSnapshotSource(db, snapshotId, datasetId, releaseId, 'primary', {
      selectedByRule: `snapshot-assembly-${datasetType}-v1`,
      selectionMode: 'exact_ref',
      sourceCohortKey: '2026-06',
    })

    if (datasetType === 'address') {
      sqlite.exec(`
        INSERT OR IGNORE INTO datasets (
          id, publisherId, code, regionCode, releaseType, releaseFrequency, theme,
          sourceUrl, versionHash, createdAt, updatedAt
        ) VALUES (
          'overture-hk-place', 'publisher-overture', 'ds-hk-overture-place', 'hk',
          'static', 'monthly', 'places',
          'https://docs.overturemaps.org/schema/reference/places/place/',
          'vh-dataset-overture-hk-place-v1', 1718236800000, 1718236800000
        );
        UPDATE datasets
        SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address')
        WHERE id = 'overture-hk-place'
          AND NOT EXISTS (
            SELECT 1 FROM json_each(resourceTypes) WHERE value = 'address'
          );
      `)
      const divisionReleaseId = 'release-dr-hk-overture-division-2026-06-17.0'
      insertFixtureRelease(sqlite, {
        releaseId: divisionReleaseId,
        source: 'overture',
        regionCode: 'hk',
        cohortKey: '2026-06',
        type: 'division',
        sourceVersion: '2026-06-17.0',
        rawObjectKey: 'hk/overture/2026-06-17.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'published',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      const divisionDataset = sqlite
        .query('SELECT datasetId FROM releases WHERE id = ?')
        .get(divisionReleaseId) as { datasetId: string }
      seedSnapshot(sqlite, {
        code: 'ss-hk-division-2026-06-17.0',
        cohortKey: '2026-06',
        datasetId: divisionDataset.datasetId,
        releaseId: divisionReleaseId,
        status: 'published',
        timestamp: 1762300800000,
      })
      const supplementaryRelease = insertFixtureRelease(sqlite, {
        datasetCode: 'ds-hk-overture-place',
        source: 'overture',
        regionCode: 'hk',
        cohortKey: '2026-06',
        type: 'address',
        sourceVersion: '2026-06-17.0',
        rawObjectKey: 'hk/overture/2026-06-17.0/place.parquet',
        originalFileName: 'place.parquet',
        status: 'published',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      const supplementarySnapshot = await ensureDraftSnapshotForRelease(db, 'address', {
        cohortKey: '2026-06',
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'overture-hk-place',
        regionCode: 'hk',
        sourceReleaseId: supplementaryRelease.releaseId,
        variant: 'overture-places',
      })
      await upsertSnapshotSource(
        db,
        supplementarySnapshot.id,
        'overture-hk-place',
        supplementaryRelease.releaseId,
        'primary',
      )
      await publishSnapshot(db, supplementarySnapshot.id)
      supplementarySnapshotCode = supplementarySnapshot.code
      const { listCurrentApiCompositionMembersForType } = await import(
        '@repo/core/db/metaRegistry'
      )
      expect(
        await listCurrentApiCompositionMembersForType(db, 'address'),
      ).toContainEqual(
        expect.objectContaining({
          resourceType: 'division',
          role: 'supporting',
          variant: 'overture',
        }),
      )
    }

    const carriedSnapshots:
      | Array<{
          resourceType: 'address' | 'division'
          snapshotId: string
          variant?: string
        }>
      | undefined =
      datasetType === 'place'
        ? (() => {
            const addressSnapshotId = seedSnapshot(sqlite, {
              code: 'ss-hk-address-historical-selection',
              cohortKey: '2026-01',
              datasetId: 'hkgov-dpo-hk-address',
              releaseId,
              resourceType: 'address',
              snapshotId: 'snapshot-address-historical-selection',
              status: 'published',
            })
            const divisionSnapshotId = seedSnapshot(sqlite, {
              code: 'ss-hk-division-historical-selection',
              cohortKey: '2026-01',
              releaseId,
              resourceType: 'division',
              snapshotId: 'snapshot-division-historical-selection',
              status: 'published',
            })
            return [
              { resourceType: 'address' as const, snapshotId: addressSnapshotId },
              {
                resourceType: 'division' as const,
                snapshotId: divisionSnapshotId,
                variant: 'overture',
              },
            ]
          })()
        : undefined

    if (datasetType === 'place') {
      await expect(
        handlePublishDataset(db, { releaseId, deferApiReleaseSet: true }),
      ).rejects.toThrow('supplementary Address analysis')
      const supplementaryReleaseId = `supplementary-${releaseId}`
      sqlite
        .query(`INSERT INTO releases (id, sourceReleaseId, datasetId, code, resourceType, sourceVersion, sourceSchemaVersion, cohortKey, status, createdAt, updatedAt)
        SELECT ?, sourceReleaseId, datasetId, ?, 'address', sourceVersion, sourceSchemaVersion, cohortKey, 'published', createdAt, updatedAt FROM releases WHERE id = ?`)
        .run(supplementaryReleaseId, `supplementary-${releaseCode}`, releaseId)
      const supplementary = await ensureDraftSnapshotForRelease(db, 'address', {
        cohortKey: '2026-06',
        datasetId,
        datasetCode: 'ds-hk-overture-place',
        regionCode: 'hk',
        sourceReleaseId: supplementaryReleaseId,
        variant: 'overture-places',
      })
      await upsertSnapshotSource(
        db,
        supplementary.id,
        datasetId,
        supplementaryReleaseId,
        'primary',
        { anchorReleaseId: releaseId },
      )
      await publishSnapshot(db, supplementary.id)
      await upsertSnapshotSource(
        db,
        snapshotId,
        datasetId,
        supplementaryReleaseId,
        'lookup',
        {
          selectedByRule:
            'api-composition:places/overture:place/default->address/overture-places',
          selectionMode: 'exact_ref',
        },
      )
      await recordPlaceAddressAssembly(db, {
        snapshotId,
        resourceType: 'place',
        anchorReleaseId: releaseId,
        anchorCohortKey: '2026-06',
        selectionSummaryJson: {
          supplementaryAddressSnapshotId: supplementary.id,
          addressReviewRequired: 0,
        },
      })
      carriedSnapshots?.push({
        resourceType: 'address',
        snapshotId: supplementary.id,
        variant: 'overture-places',
      })
    }
    const result = await handlePublishDataset(db, {
      ...(carriedSnapshots ? { carriedSnapshots } : {}),
      ...(datasetType === 'place' ? { deferApiReleaseSet: true } : {}),
      releaseId,
    })

    if (datasetType === 'place') {
      // Reconciliation must retain the exact historical references already
      // stored on the draft, even when newer compatible snapshots exist.
      seedSnapshot(sqlite, {
        code: 'ss-hk-address-newer-selection',
        cohortKey: '2026-07',
        datasetId: 'hkgov-dpo-hk-address',
        releaseId,
        resourceType: 'address',
        snapshotId: 'snapshot-address-newer-selection',
        status: 'published',
      })
      seedSnapshot(sqlite, {
        code: 'ss-hk-division-newer-selection',
        cohortKey: '2026-07',
        releaseId,
        resourceType: 'division',
        snapshotId: 'snapshot-division-newer-selection',
        status: 'published',
      })
      const reconciliation = await handleReconcileDraftReleaseSets(db, {
        apiFamily: 'places',
        regionCode: 'hk',
      })
      if (!result.apiReleaseSetCode) {
        throw new Error('Expected a draft Places release-set code.')
      }
      expect(reconciliation.publishedReleaseSetCodes).toContain(
        result.apiReleaseSetCode,
      )
    }

    const releaseRow = sqlite
      .query('SELECT status FROM releases WHERE id = ?')
      .get(releaseId) as { status: string }
    const snapshotRow = sqlite
      .query('SELECT status, publishedAt FROM snapshots WHERE id = ?')
      .get(snapshotId) as {
      publishedAt: number | null
      status: string
    }
    const publishedReleaseSet = sqlite
      .query(
        `
          SELECT arss.apiReleaseSetId AS apiReleaseSetId, ss.datasetId AS datasetId
          FROM apiReleaseSetSnapshots arss
          INNER JOIN snapshotSources ss ON ss.snapshotId = arss.snapshotId
          WHERE arss.snapshotId = ? AND ss.role = 'primary'
          LIMIT 1
        `,
      )
      .get(snapshotId) as {
      apiReleaseSetId: string
      datasetId: string
    }
    const provenanceCount = sqlite
      .query(
        `
          SELECT COUNT(*) AS count
          FROM apiFieldProvenance
          WHERE apiReleaseSetId = ?
            AND sourceDatasetId = ?
        `,
      )
      .get(publishedReleaseSet.apiReleaseSetId, publishedReleaseSet.datasetId) as {
      count: number
    }
    const supportingSnapshots = sqlite
      .query(
        `
          SELECT s.code, arss.role
          FROM apiReleaseSetSnapshots arss
          INNER JOIN snapshots s ON s.id = arss.snapshotId
          WHERE arss.apiReleaseSetId = ?
            AND arss.role = 'supporting'
          ORDER BY s.code
        `,
      )
      .all(publishedReleaseSet.apiReleaseSetId) as Array<{
      code: string
      role: string
    }>

    sqlite.close()

    expect(result).toMatchObject({
      apiReleaseSetId: publishedReleaseSet.apiReleaseSetId,
      datasetId: releaseCode,
      releaseCode,
      releaseId,
      phase: null,
      snapshotId: `snapshot-${releaseId}`,
      status: 'current',
    })
    if (datasetType === 'address') {
      expect(result.apiReleaseSetStatus).toBe('archived')
      expect(result.metadataDelta?.apiReleaseSets?.[0]?.status).toBe('archived')
    }
    expect(releaseRow).toEqual({
      status: 'published',
    })
    expect(snapshotRow.status).toBe('published')
    expect(snapshotRow.publishedAt).not.toBeNull()
    expect(provenanceCount.count).toBe(
      datasetType === 'address'
        ? addressFixtureOfficialLineage.fields.filter(
            field => field.sourceDatasetCode === 'ds-hk-hkgov-dpo-address',
          ).length
        : 0,
    )
    expect(supportingSnapshots).toEqual(
      datasetType === 'address'
        ? [
            { code: supplementarySnapshotCode, role: 'supporting' },
            { code: 'ss-hk-division-2026-06-17.0', role: 'supporting' },
          ]
        : [
            { code: 'ss-hk-address-historical-selection', role: 'supporting' },
            { code: 'ss-hk-address-overture-places-2026-06', role: 'supporting' },
            { code: 'ss-hk-division-historical-selection', role: 'supporting' },
          ],
    )
  }
})

test('publishes LandsD divisions in their own API domain', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-landsd-division.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { releaseId } = insertFixtureRelease(sqlite, {
    releaseId: 'release-dr-hk-hkgov-landsd-division-2026-06-10.0',
    source: 'hkgov-landsd',
    regionCode: 'hk',
    cohortKey: '2026-06',
    type: 'division',
    sourceVersion: '2026-06-10.0',
    rawObjectKey: 'hk/hkgov-landsd/2026-06-10.0/division.geojson',
    originalFileName: 'division.geojson',
    status: 'staged',
    ingestedAt: '2026-06-10T00:00:00.000Z',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  })
  const snapshotId = seedSnapshot(sqlite, {
    code: 'ss-hk-division-2026-06-10.0',
    cohortKey: '2026-06',
    datasetId: 'hkgov-landsd-hk-division',
    releaseId,
    status: 'draft',
  })

  const result = await handlePublishDataset(db, { releaseId })
  if (!result.apiReleaseSetId) {
    throw new Error(
      'Expected the LandsD division publish result to include a release set.',
    )
  }
  const releaseSet = sqlite
    .query('SELECT domainCode, status FROM apiReleaseSets WHERE id = ?')
    .get(result.apiReleaseSetId) as {
    domainCode: string
    status: string
  }

  sqlite.close()

  expect(result).toMatchObject({ releaseId, snapshotId, status: 'current' })
  expect(releaseSet).toEqual({
    domainCode: 'hkgov-landsd',
    status: 'current',
  })
})
