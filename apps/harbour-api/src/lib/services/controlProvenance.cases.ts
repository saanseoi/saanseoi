import { readFixtureLineage } from './controlFixtures.fixtures'
import { expect, test } from 'bun:test'
import { join } from 'node:path'
import addressFixtureOfficialLineage from '../../../../../fixtures/meta/apiFields/api-addresses-v0.1@saanseoi-v1.json'
import { placeDivisionFieldNames } from '@repo/db'
import { requireDefined } from '../../../../../libs/core/src/requireDefined'
import placeFixtureLineage from '../../../../../fixtures/meta/apiFields/api-places-v0.1@overture-v1.json'
import { insertFixtureRelease } from '../../../../../libs/core/src/testing/metaFixtures'
import {
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
  publishSnapshot,
} from '@repo/core/db/metaRegistry'
import { createLocalHarbourDb } from '../../../../../libs/core/src/testing/localDb'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/places/placeAddressAssembly'
import {
  createTempDir,
  handlePublishDataset,
  handleReconcileDraftReleaseSets,
  initDb,
  seedSnapshot,
  seedSnapshotAssembly,
} from './controlFixtures.fixtures.ts'

test('every resource release requires an audit, including deferred publication', async () => {
  const sqlite = initDb(join(createTempDir(), 'mandatory-audits.sqlite'))
  const db = createLocalHarbourDb(sqlite)
  const fixture = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'mandatory-audit-release',
    source: 'overture',
    regionCode: 'hk',
    cohortKey: '2026-06',
    resourceType: 'division',
    sourceVersion: '2026-06-24.0',
    rawObjectKey: 'division.parquet',
    originalFileName: 'division.parquet',
    status: 'staged',
    ingestedAt: '2026-06-24T00:00:00.000Z',
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  })
  const release = { id: fixture.resourceReleaseId }
  sqlite
    .query('DELETE FROM processingAudits WHERE resourceReleaseId = ?')
    .run(release.id)
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
      .query(
        "UPDATE resourceReleases SET resourceType = ?, status = 'staged' WHERE id = ?",
      )
      .run(type, release.id)
    await expect(
      handlePublishDataset(db, {
        resourceReleaseId: release.id,
        deferApiReleaseSet: true,
      }),
    ).rejects.toThrow('requires a verified retained processing result')
    expect(
      sqlite.query('SELECT status FROM resourceReleases WHERE id = ?').get(release.id),
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
    const sourceVersion = datasetType === 'place' ? '2026-06-17.0' : '2026-06-24.0'
    const releaseCode = `dr-hk-${source}-${datasetType}-${sourceVersion}`
    const resourceReleaseId = `release-${releaseCode}`
    const snapshotId = `snapshot-${resourceReleaseId}`
    let supplementarySnapshotCode: string | null = null

    if (datasetType === 'address') {
      // Historical address releases remain published history rather than
      // replacing the newer active API cohort.
      sqlite
        .query(
          `UPDATE apiReleaseSets
           SET regionCode = ?, cohortKey = ?, effectiveFrom = ?
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
      resourceReleaseId,
      source,
      regionCode: 'hk',
      cohortKey: '2026-06',
      resourceType: datasetType,
      sourceVersion,
      rawObjectKey: `hk/${source}/${sourceVersion}/${datasetType}.parquet`,
      originalFileName: `${datasetType}.parquet`,
      status: 'staged',
      ingestedAt: '2026-06-05T00:01:00.000Z',
      createdAt: '2026-06-05T00:01:00.000Z',
      updatedAt: '2026-06-05T00:01:00.000Z',
    })
    sqlite
      .query(
        'UPDATE sourceReleases SET sourceSchemaVersion = ? WHERE id = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ?)',
      )
      .run('1.17.0', resourceReleaseId)
    await expect(handlePublishDataset(db, { resourceReleaseId })).rejects.toThrow(
      'requires a verified retained processing result',
    )
    sqlite
      .query(
        "INSERT INTO processingAudits (resourceReleaseId, stage, ownerId, manifestHash, byteLength, applicationCount, attemptStatus) VALUES (?1, 'ingestion', ?1, ?2, 1, 0, ?3)",
      )
      .run(resourceReleaseId, `sha256:${'0'.repeat(64)}`, 'failed')
    await expect(handlePublishDataset(db, { resourceReleaseId })).rejects.toThrow(
      'failed processing audit attempt',
    )
    expect(
      sqlite
        .query('SELECT status FROM resourceReleases WHERE id = ?')
        .get(resourceReleaseId),
    ).toEqual({ status: 'staged' })
    sqlite
      .query(
        "UPDATE processingAudits SET attemptStatus = 'completed' WHERE resourceReleaseId = ?",
      )
      .run(resourceReleaseId)
    if (datasetType === 'address') {
      sqlite
        .query(
          'UPDATE sourceReleases SET sourceSchemaVersion = ? WHERE id = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ?)',
        )
        .run('3.2', resourceReleaseId)
    }
    seedSnapshot(sqlite, {
      code: `ss-hk-${datasetType === 'address' ? 'hkgov-dpo-address' : 'overture-place'}-${sourceVersion}`,
      datasetId,
      resourceType: datasetType,
      resourceReleaseId,
      snapshotId,
      status: 'draft',
      timestamp: 1762300860000,
    })
    await upsertSnapshotSource(db, snapshotId, resourceReleaseId, 'primary', {
      selectedByRule: `assembly:${datasetType}:source-release:v1`,
      selectionMode: 'exact_ref',
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
        resourceReleaseId: divisionReleaseId,
        source: 'overture',
        regionCode: 'hk',
        cohortKey: '2026-06',
        resourceType: 'division',
        sourceVersion: '2026-06-17.0',
        rawObjectKey: 'hk/overture/2026-06-17.0/division.parquet',
        originalFileName: 'division.parquet',
        status: 'current',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      const divisionDataset = sqlite
        .query(
          'SELECT datasetId FROM resourceReleaseDetails AS resourceReleases WHERE id = ?',
        )
        .get(divisionReleaseId) as { datasetId: string }
      seedSnapshot(sqlite, {
        code: 'ss-hk-overture-division-2026-06-17.0',
        cohortKey: '2026-06',
        datasetId: divisionDataset.datasetId,
        resourceReleaseId: divisionReleaseId,
        status: 'published',
        timestamp: 1762300800000,
      })
      const supplementaryRelease = insertFixtureRelease(sqlite, {
        datasetCode: 'ds-hk-overture-place',
        source: 'overture',
        regionCode: 'hk',
        cohortKey: '2026-06',
        resourceType: 'address',
        sourceVersion: '2026-06-17.0',
        rawObjectKey: 'hk/overture/2026-06-17.0/place.parquet',
        originalFileName: 'place.parquet',
        status: 'current',
        ingestedAt: '2026-06-05T00:01:00.000Z',
        createdAt: '2026-06-05T00:01:00.000Z',
        updatedAt: '2026-06-05T00:01:00.000Z',
      })
      const supplementarySnapshot = await ensureDraftSnapshotForRelease(db, 'address', {
        cohortKey: '2026-06',
        datasetCode: 'ds-hk-overture-place',
        datasetId: 'overture-hk-place',
        regionCode: 'hk',
        sourceReleaseId: supplementaryRelease.resourceReleaseId,
        variant: 'overture-places',
      })
      await upsertSnapshotSource(
        db,
        supplementarySnapshot.id,
        supplementaryRelease.resourceReleaseId,
        'primary',
      )
      seedSnapshotAssembly(sqlite, supplementarySnapshot.id)
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
          role: 'lookup',
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
            const historicalReleases = new Map<string, string>()
            for (const resourceType of ['address', 'division'] as const) {
              const release = insertFixtureRelease(sqlite, {
                source: resourceType === 'address' ? 'hkgov-dpo' : 'overture',
                regionCode: 'hk',
                cohortKey: '2026-01',
                resourceType,
                sourceVersion: '2026-01-21.0',
                rawObjectKey: `${resourceType}.parquet`,
                originalFileName: `${resourceType}.parquet`,
                status: 'current',
                ingestedAt: '2026-01-21T00:00:00.000Z',
                createdAt: '2026-01-21T00:00:00.000Z',
                updatedAt: '2026-01-21T00:00:00.000Z',
              })
              sqlite
                .query(
                  'UPDATE sourceReleases SET sourceSchemaVersion = ? WHERE id = (SELECT sourceReleaseId FROM resourceReleases WHERE id = ?)',
                )
                .run(
                  resourceType === 'address' ? '3.2' : '1.16.0',
                  release.resourceReleaseId,
                )
              historicalReleases.set(resourceType, release.resourceReleaseId)
            }
            const addressSnapshotId = seedSnapshot(sqlite, {
              code: 'ss-hk-address-historical-selection',
              cohortKey: '2026-01',
              datasetId: 'hkgov-dpo-hk-address',
              resourceReleaseId: requireDefined(historicalReleases.get('address')),
              resourceType: 'address',
              snapshotId: 'snapshot-address-historical-selection',
              status: 'published',
            })
            const divisionSnapshotId = seedSnapshot(sqlite, {
              code: 'ss-hk-division-historical-selection',
              cohortKey: '2026-01',
              resourceReleaseId: requireDefined(historicalReleases.get('division')),
              resourceType: 'division',
              snapshotId: 'snapshot-division-historical-selection',
              status: 'published',
            })
            return [
              {
                resourceType: 'address' as const,
                snapshotId: addressSnapshotId,
                variant: 'hkgov-dpo',
              },
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
        handlePublishDataset(db, { resourceReleaseId, deferApiReleaseSet: true }),
      ).rejects.toThrow('supplementary Address dependency')
      const supplementaryReleaseId = `supplementary-${resourceReleaseId}`
      sqlite
        .query(`INSERT INTO resourceReleases (id, sourceReleaseId, code, resourceType, status, createdAt, updatedAt)
        SELECT ?, sourceReleaseId, ?, 'address', 'current', createdAt, updatedAt FROM resourceReleaseDetails AS resourceReleases WHERE id = ?`)
        .run(supplementaryReleaseId, `supplementary-${releaseCode}`, resourceReleaseId)
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
        supplementaryReleaseId,
        'primary',
        { anchorReleaseId: resourceReleaseId },
      )
      seedSnapshotAssembly(sqlite, supplementary.id)
      await publishSnapshot(db, supplementary.id)
      await upsertSnapshotSource(db, snapshotId, supplementaryReleaseId, 'lookup', {
        selectedByRule:
          'api-composition:places/overture:place/overture->address/overture-places',
        selectionMode: 'exact_ref',
      })
      await recordPlaceAddressAssembly(db, {
        snapshotId,
        resourceType: 'place',
        anchorReleaseId: resourceReleaseId,
        dependencies: { supplementaryAddress: supplementary.id },
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
      resourceReleaseId,
    })

    if (datasetType === 'place') {
      // Reconciliation must retain the exact historical references already
      // stored on the draft, even when newer compatible snapshots exist.
      seedSnapshot(sqlite, {
        code: 'ss-hk-address-newer-selection',
        cohortKey: '2026-07',
        datasetId: 'hkgov-dpo-hk-address',
        resourceReleaseId,
        resourceType: 'address',
        snapshotId: 'snapshot-address-newer-selection',
        status: 'published',
      })
      seedSnapshot(sqlite, {
        code: 'ss-hk-division-newer-selection',
        cohortKey: '2026-07',
        resourceReleaseId,
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
      .query('SELECT status FROM resourceReleases WHERE id = ?')
      .get(resourceReleaseId) as { status: string }
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
          INNER JOIN snapshotResourceReleaseDetails ss ON ss.snapshotId = arss.snapshotId
          WHERE arss.snapshotId = ? AND ss.role = 'primary'
          LIMIT 1
        `,
      )
      .get(snapshotId) as {
      apiReleaseSetId: string
      datasetId: string
    }
    const lineage = await readFixtureLineage(
      sqlite,
      publishedReleaseSet.apiReleaseSetId,
    )
    const sourceScopes = new Set(
      lineage?.sourceSchemas
        .filter(
          (scope: { sourceDatasetId: string }) => scope.sourceDatasetId === datasetId,
        )
        .map((scope: { scopeId: string }) => scope.scopeId) ?? [],
    )
    const applicableNodes = new Set(
      lineage?.nodes
        .filter(
          node =>
            node.when.kind === 'compare' &&
            typeof node.when.value === 'string' &&
            sourceScopes.has(node.when.value),
        )
        .map((node: { id: string }) => node.id) ?? [],
    )
    const provenanceFields =
      lineage?.fields.filter((field: { provenance: { assembly: string[] } }) =>
        field.provenance.assembly.some(id => applicableNodes.has(id)),
      ) ?? []
    const supportingSnapshots = sqlite
      .query(
        `
          SELECT s.code, arss.role
          FROM apiReleaseSetSnapshots arss
          INNER JOIN snapshots s ON s.id = arss.snapshotId
          WHERE arss.apiReleaseSetId = ?
            AND arss.role <> 'primary'
          ORDER BY s.code
        `,
      )
      .all(publishedReleaseSet.apiReleaseSetId) as Array<{
      code: string
      role: string
    }>

    if (datasetType === 'place') {
      const divisionDataset = sqlite
        .query<{ id: string }, []>(
          "SELECT id FROM datasets WHERE code='ds-hk-overture-division'",
        )
        .get()!
      const divisionScopes = new Set(
        lineage!.sourceSchemas
          .filter(scope => scope.sourceDatasetId === divisionDataset.id)
          .map(scope => scope.scopeId),
      )
      expect(divisionScopes.size).toBeGreaterThan(0)
      for (const name of placeDivisionFieldNames) {
        const field = lineage!.fields.find(
          field => field.apiField === `attributes.${name}`,
        )!
        expect(field, name).toBeDefined()
        expect(field.completeness, name).toBe('complete')
        const mapping = placeFixtureLineage.fields.find(
          field => field.apiField === `attributes.${name}`,
        )!
        expect(mapping.sourceDatasetCode, name).toBe('ds-hk-overture-division')
      }
    }

    sqlite.close()

    expect(result).toMatchObject({
      apiReleaseSetId: publishedReleaseSet.apiReleaseSetId,
      datasetId: releaseCode,
      releaseCode,
      resourceReleaseId,
      phase: null,
      snapshotId: `snapshot-${resourceReleaseId}`,
      status: 'current',
    })
    if (datasetType === 'address') {
      expect(result.apiReleaseSetStatus).toBe('archived')
      expect(result.metadataDelta?.apiReleaseSets?.[0]?.status).toBe('archived')
    }
    expect(releaseRow).toEqual({
      status: 'current',
    })
    expect(snapshotRow.status).toBe('published')
    expect(snapshotRow.publishedAt).not.toBeNull()
    const expectedFields = (
      datasetType === 'address'
        ? addressFixtureOfficialLineage.fields
        : placeFixtureLineage.fields
    ).filter(
      field =>
        field.sourceDatasetCode ===
        (datasetType === 'address'
          ? 'ds-hk-hkgov-dpo-address'
          : 'ds-hk-overture-place'),
    )
    expect(provenanceFields.length).toBe(
      new Set(
        expectedFields.map(field =>
          JSON.stringify([field.apiField, 'variant' in field ? field.variant : null]),
        ),
      ).size,
    )
    const expectedSupportingSnapshots =
      datasetType === 'address'
        ? (() => {
            if (supplementarySnapshotCode === null)
              throw new Error('Expected the Overture supplementary Address snapshot.')
            return [
              { code: 'ss-hk-overture-division-2026-06-17.0', role: 'lookup' },
              { code: supplementarySnapshotCode, role: 'supplementary' },
            ]
          })()
        : [
            { code: 'ss-hk-address-historical-selection', role: 'lookup' },
            { code: 'ss-hk-division-historical-selection', role: 'lookup' },
            { code: 'ss-hk-overture-place-address-2026-06', role: 'lookup' },
          ]
    expect(supportingSnapshots).toEqual(expectedSupportingSnapshots)
  }
})

test('publishes LandsD snapshots for curated assembly without an API release set', async () => {
  const tempDir = createTempDir()
  const dbPath = join(tempDir, 'harbour-publish-landsd-division.sqlite')
  const sqlite = initDb(dbPath)
  const db = createLocalHarbourDb(sqlite)
  const { resourceReleaseId } = insertFixtureRelease(sqlite, {
    resourceReleaseId: 'release-dr-hk-hkgov-landsd-division-2026-06-10.0',
    source: 'hkgov-landsd',
    regionCode: 'hk',
    cohortKey: '2026-06',
    resourceType: 'division',
    sourceVersion: '2026-06-10.0',
    rawObjectKey: 'hk/hkgov-landsd/2026-06-10.0/division.geojson',
    originalFileName: 'division.geojson',
    status: 'staged',
    ingestedAt: '2026-06-10T00:00:00.000Z',
    createdAt: '2026-06-10T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  })
  const snapshotId = seedSnapshot(sqlite, {
    code: 'ss-hk-division-hkgov-landsd-2026-06-10.0',
    cohortKey: '2026-06',
    datasetId: 'hkgov-landsd-hk-division',
    resourceReleaseId,
    status: 'draft',
  })

  const releaseSetsBefore = sqlite
    .query('SELECT count(*) AS count FROM apiReleaseSets')
    .get()
  const cataloguesBefore = sqlite
    .query('SELECT count(*) AS count FROM apiCatalogRevisions')
    .get()
  const result = await handlePublishDataset(db, { resourceReleaseId })
  const snapshot = sqlite
    .query('SELECT status,revision FROM snapshots WHERE id=?')
    .get(snapshotId)
  const releaseSets = sqlite.query('SELECT count(*) AS count FROM apiReleaseSets').get()
  const catalogues = sqlite
    .query('SELECT count(*) AS count FROM apiCatalogRevisions')
    .get()
  sqlite.close()

  expect(result).toMatchObject({ resourceReleaseId, snapshotId, status: 'current' })
  expect(result.apiReleaseSetId).toBeUndefined()
  expect(snapshot).toEqual({ status: 'published', revision: 0 })
  expect(releaseSets).toEqual(releaseSetsBefore)
  expect(catalogues).toEqual(cataloguesBefore)
})
