import islandReview from '../../../../../../fixtures/meta/curations/saanseoi-island-review.json'
import type { IslandReviewFixture } from '../islands/islandCuration'
import exclusions from '../../../../../../fixtures/divisions/hk/exclusions.json'
import supplementalNeighbourhoods from '../../../../../../fixtures/divisions/hk/supplemental-neighbourhoods.json'
import classificationFixture from '../../../../../../fixtures/meta/patches/overture-division-classification.json'
import { sql } from 'drizzle-orm'
import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  buildDeterministicReleaseId,
  buildDeterministicSourceReleaseId,
  listCurrentApiCompositionMembersForType,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  publishReleaseArtefacts,
  getDatasetRecordByReleaseId,
  ensureDraftReleaseSetForRelease,
  ensureDraftSnapshotForRelease,
  upsertSnapshotSource,
  upsertSnapshotShardAssignment,
  publishSnapshot,
  recordSnapshotAssemblyRun,
} from '@repo/core/db/metaRegistry'
import { resolveLocalAddressDbContext } from '../../dbCache/localDbCache'
import { assembleCuratedDivisions } from './assemble'
import { readCuratedDivisionRelease } from './releaseMetadata'
import type { UploadTarget } from '../../cli/options'
import {
  normaliseDivisionI18nForStorage,
  normaliseDivisionRow,
} from '@repo/core/pipeline/services/divisions/division'

const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const jsonText = (value: unknown) =>
  value === null || value === undefined ? null : JSON.stringify(value)

/**
 * A reviewed addition normally enters the Overture projection during native
 * ingestion. Merge absent fixture rows here too, so a local curated backfill
 * does not require the much larger upstream snapshot to be reprocessed.
 */
function missingSupplementalDivisionRows(currentRows: Record<string, any>[]) {
  const existingIds = new Set(currentRows.map(row => row.id))
  const divisions: Record<string, any>[] = []
  const names: Record<string, any>[] = []

  for (const raw of supplementalNeighbourhoods) {
    if (existingIds.has(raw.id)) continue
    const normalised = normaliseDivisionRow(raw)
    const { base } = normalised
    divisions.push({
      ...base,
      bbox: jsonText(base.bbox),
      cartography: jsonText(base.cartography),
      geometry: jsonText(base.geometry),
      hierarchies: jsonText(base.hierarchies),
      identifiers: jsonText(base.identifiers),
      sources: jsonText(base.sources),
    })
    names.push(
      ...normaliseDivisionI18nForStorage(normalised.i18n).map(row => ({
        ...row,
        isLocaleInferred: Number(row.isLocaleInferred),
        nameAlts: jsonText(row.nameAlts),
        nameRules: jsonText(row.nameRules),
        nameVariant: jsonText(row.nameVariant),
      })),
    )
  }

  return { divisions, names }
}

export async function publishLocalCuratedDivisions(
  target: UploadTarget,
  options: { cohort?: string; waitForBaseline?: boolean } = {},
) {
  if (target.remote)
    throw Error('Curated division assembly currently requires --target local.')
  const root = resolve(import.meta.dir, '../../../../../..')
  const read = async (name: string) =>
    JSON.parse(await readFile(resolve(root, 'fixtures/divisions/hk', name), 'utf8'))
  const hierarchy = await read('geographic-hierarchy-patch.json'),
    stubs = await read('stub-areas.json'),
    islands = await read('island-areas.json')
  if (options.cohort && options.cohort !== hierarchy.cohort) return null
  if (hierarchy.cohort !== stubs.cohort)
    throw Error('Curated geometry and hierarchy cohorts differ.')
  const release = await readCuratedDivisionRelease(root)
  const ctx = await resolveLocalAddressDbContext(
    target,
    'hk',
    hierarchy.cohort.slice(0, 4),
    { cacheTableProfile: 'divisionGeometry' },
  )
  const files = ctx.state.files!
  const meta = new Database(files.DB_META!, { readonly: true })
  const current = new Database(files.DB_CURRENT!)
  const historyPath = files[`DB_HISTORY_HK_${hierarchy.cohort.slice(0, 4)}`]!
  if (!historyPath) throw Error('History database not found.')
  current.query('ATTACH DATABASE ? AS history').run(historyPath)
  try {
    const base = (type: string) => {
      const publication =
        type === 'division'
          ? 'divisionPublicationState'
          : 'divisionAreaPublicationState'
      const snapshots = meta
        .query(
          `SELECT s.*, l.variant, l.primaryDatasetId FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId WHERE s.resourceType=? AND l.variant='overture' AND s.cohortKey=? AND s.status='published' ORDER BY s.revision DESC`,
        )
        .all(type, hierarchy.cohort) as any[]
      for (const snapshot of snapshots) {
        const receipt = current
          .query(
            `SELECT scopeId FROM ${publication} WHERE snapshotId=? AND status='current'`,
          )
          .get(snapshot.id) as any
        if (receipt) return { ...snapshot, scopeId: receipt.scopeId }
      }
      if (options.waitForBaseline) return null
      throw Error(`No materialised Overture ${type} baseline for ${hierarchy.cohort}`)
    }
    const divisionBase = base('division'),
      areaBase = base('divisionArea')
    if (!divisionBase || !areaBase) return null
    const divisions = current
      .query('SELECT * FROM divisions WHERE snapshotId=?')
      .all(divisionBase.scopeId) as any[]
    const names = current
      .query('SELECT * FROM divisionsI18n WHERE snapshotId=?')
      .all(divisionBase.scopeId) as any[]
    const supplemental = missingSupplementalDivisionRows(divisions)
    const data = assembleCuratedDivisions({
      islandReview: islandReview as IslandReviewFixture,
      excludedIds: exclusions.entries.flatMap(entry => [
        entry.divisionId,
        ...(entry.reviewId ? [entry.reviewId] : []),
      ]),
      classificationPatches: classificationFixture.entries,
      divisions: [...divisions, ...supplemental.divisions],
      names: [...names, ...supplemental.names],
      areas: current
        .query('SELECT * FROM divisionAreas WHERE snapshotId=?')
        .all(areaBase.scopeId) as any[],
      hierarchy,
      stubs,
      islands,
    })
    // A replay with new snapshot IDs but identical records is the same assembly.
    const contentRows = (rows: Record<string, unknown>[]) =>
      rows
        .map(({ snapshotId: _, createdAt: __, updatedAt: ___, ...row }) => row)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    const hash = digest({
      release,
      exclusions,
      hierarchy,
      stubs,
      islands,
      islandReview,
      divisions: contentRows(data.divisions),
      names: contentRows(data.names),
      areas: contentRows(data.areas),
    })
    const reportDirectory = resolve(root, '.local/curated-divisions', hash)
    await mkdir(reportDirectory, { recursive: true })
    await writeFile(
      resolve(reportDirectory, 'inputs.json'),
      JSON.stringify({
        release,
        exclusions,
        hierarchy,
        stubs,
        islands,
        islandReview,
        divisionSnapshotId: divisionBase.id,
        areaSnapshotId: areaBase.id,
      }),
    )
    await writeFile(resolve(reportDirectory, 'assembled.json'), JSON.stringify(data))
    const snapshots: any[] = []
    for (const [resourceType, _baseline, table, rows] of [
      ['division', divisionBase, 'divisions', data.divisions],
      ['divisionArea', areaBase, 'divisionAreas', data.areas],
    ] as const) {
      const datasetCode =
        resourceType === 'division'
          ? 'ds-hk-saanseoi-division'
          : 'ds-hk-saanseoi-division-area'
      const datasetRow = meta
        .query('SELECT id FROM datasets WHERE code=?')
        .get(datasetCode) as any
      if (!datasetRow) throw Error('Sync metadata before assembling curated divisions.')
      const code = `${datasetCode.replace(/^ds-/, 'dr-')}-${release.releaseVersion}`
      const sourceReleaseId = buildDeterministicSourceReleaseId(code)
      const resourceReleaseId = buildDeterministicReleaseId(code)
      const source = { datasetCode, datasetId: datasetRow.id, resourceReleaseId }
      const ingestedAt = new Date().toISOString()
      await ctx.metaDb.run(sql`INSERT INTO sourceReleases
        (id,datasetId,code,sourceVersion,expectedResourceTypes,sourceSchemaVersion,publicationDate,cohortKey,status,ingestedAt)
        VALUES (${sourceReleaseId},${source.datasetId},${code},${release.releaseVersion},${JSON.stringify([resourceType])},${release.sourceSchemaVersion},${release.publicationDate},${release.releaseVersion},'processing',${ingestedAt})
        ON CONFLICT(id) DO NOTHING`)
      await ctx.metaDb.run(sql`INSERT INTO releases
        (id,sourceReleaseId,datasetId,code,resourceType,sourceVersion,sourceSchemaVersion,publicationDate,cohortKey,status,ingestedAt)
        VALUES (${resourceReleaseId},${sourceReleaseId},${source.datasetId},${code},${resourceType},${release.releaseVersion},${release.sourceSchemaVersion},${release.publicationDate},${release.releaseVersion},'processing',${ingestedAt})
        ON CONFLICT(id) DO NOTHING`)
      const existing = meta
        .query(
          "SELECT s.* FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId WHERE l.variant='saanseoi' AND s.resourceType=? AND s.notes=? AND s.status='published'",
        )
        .get(resourceType, hash) as any
      if (existing) {
        const publication =
          resourceType === 'division'
            ? 'divisionPublicationState'
            : 'divisionAreaPublicationState'
        if (
          !current
            .query(
              `SELECT 1 FROM ${publication} WHERE snapshotId=? AND status='current'`,
            )
            .get(existing.id)
        )
          throw Error(
            `Curated snapshot ${existing.id} requires current projection recovery`,
          )
        snapshots.push(existing)
        continue
      }
      const snapshot = await ensureDraftSnapshotForRelease(
        ctx.metaDb as never,
        resourceType,
        {
          cohortKey: release.releaseVersion,
          datasetCode: source.datasetCode,
          datasetId: source.datasetId,
          regionCode: 'hk',
          sourceReleaseId: source.resourceReleaseId,
          variant: 'saanseoi',
          rootSnapshot: true,
          rebuildPublishedSnapshot: true,
        },
      )
      const scope =
        resourceType === 'division'
          ? snapshot.snapshotLineageId
          : JSON.stringify([snapshot.snapshotLineageId, release.releaseVersion])
      const now = new Date().toISOString()
      const put = (database: string, table: string, row: Record<string, any>) => {
        const columns = (
          current.query(`PRAGMA ${database}.table_info(${table})`).all() as any[]
        )
          .map(c => c.name)
          .filter(k => row[k] !== undefined)
        current
          .query(
            `INSERT OR REPLACE INTO ${database}.${table} (${columns.map(k => `"${k}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...columns.map(k => row[k]))
        // Retained rows need membership journal entries for pinned-release replay.
        if (database === 'history') {
          const recordType =
            table === 'divisions'
              ? 'division'
              : table === 'divisionsI18n'
                ? 'divisionI18n'
                : 'divisionArea'
          current
            .query(`INSERT OR REPLACE INTO history.snapshotVersionChanges
            (snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId,createdAt,updatedAt)
            VALUES (?,?,?,?,?,'upsert',?,?,?)`)
            .run(
              row.snapshotId,
              recordType,
              row.divisionId && table === 'divisionsI18n' ? row.divisionId : row.id,
              row.locale ?? '',
              row.versionHash,
              row.sourceReleaseId ?? source.resourceReleaseId,
              row.createdAt,
              row.updatedAt,
            )
        }
      }
      current.transaction(() => {
        if (resourceType === 'division')
          current.query('DELETE FROM divisionsI18n WHERE snapshotId=?').run(scope)
        current.query(`DELETE FROM ${table} WHERE snapshotId=?`).run(scope)
        const hashes = new Map<string, string>()
        for (const row of rows) {
          const { snapshotId: _, createdAt: __, updatedAt: ___, ...value } = row
          const versionHash = digest({ value, snapshot: snapshot.id })
          hashes.set(row.id, versionHash)
          put('main', table, {
            ...value,
            snapshotId: scope,
            createdAt: now,
            updatedAt: now,
          })
          put('history', table, {
            ...value,
            snapshotId: snapshot.id,
            versionHash,
            sourceReleaseId: source.resourceReleaseId,
            isCurrent: 1,
            createdAt: now,
            updatedAt: now,
          })
        }
        if (resourceType === 'division') {
          for (const row of data.names) {
            put('main', 'divisionsI18n', {
              ...row,
              snapshotId: scope,
              createdAt: now,
              updatedAt: now,
            })
            put('history', 'divisionsI18n', {
              ...row,
              snapshotId: snapshot.id,
              versionHash: hashes.get(row.divisionId),
              sourceReleaseId: source.resourceReleaseId,
              isCurrent: 1,
              createdAt: now,
              updatedAt: now,
            })
          }
          current
            .query(
              'INSERT OR REPLACE INTO divisionSearchScopes(scopeId,snapshotId) VALUES (?,?)',
            )
            .run(scope, snapshot.id)
        }
        put(
          'main',
          resourceType === 'division'
            ? 'divisionPublicationState'
            : 'divisionAreaPublicationState',
          {
            scopeId: scope,
            snapshotId: snapshot.id,
            status: 'current',
            publicationToken: hash,
            preparedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        )
      })()
      await upsertSnapshotSource(
        ctx.metaDb as never,
        snapshot.id,
        source.datasetId,
        source.resourceReleaseId,
        'primary',
        {
          selectedByRule: 'saanseoi-curated-division-assembly-v1',
          selectionMode: 'exact_ref',
          sourceCohortKey: release.releaseVersion,
        },
      )
      for (const baselineSnapshot of [divisionBase, areaBase])
        for (const input of meta
          .query('SELECT * FROM snapshotSources WHERE snapshotId=?')
          .all(baselineSnapshot.id) as any[]) {
          await upsertSnapshotSource(
            ctx.metaDb as never,
            snapshot.id,
            input.datasetId,
            input.resourceReleaseId,
            'enrichment',
            {
              selectedByRule: 'saanseoi-curated-division-assembly-v1',
              selectionMode: 'exact_ref',
              anchorReleaseId: source.resourceReleaseId,
              sourceCohortKey: hierarchy.cohort,
            },
          )
        }
      const shard = meta
        .query(
          "SELECT id FROM dataShards WHERE shardType='history' AND bindingName=? AND environment='preview'",
        )
        .get(`DB_HISTORY_HK_${hierarchy.cohort.slice(0, 4)}`) as any
      await upsertSnapshotShardAssignment(ctx.metaDb as never, snapshot.id, shard.id)
      await recordSnapshotAssemblyRun(ctx.metaDb as never, {
        snapshotId: snapshot.id,
        resourceType,
        anchorReleaseId: source.resourceReleaseId,
        anchorCohortKey: release.releaseVersion,
      })
      await ctx.metaDb.run(
        sql`UPDATE snapshots SET notes=${hash} WHERE id=${snapshot.id}`,
      )
      await publishSnapshot(ctx.metaDb as never, snapshot.id)
      await ctx.metaDb.run(
        sql`UPDATE releases SET status='published' WHERE id=${resourceReleaseId}`,
      )
      await ctx.metaDb.run(
        sql`UPDATE sourceReleases SET status='published' WHERE id=${sourceReleaseId}`,
      )
      snapshots.push({ ...snapshot, status: 'published' })
    }
    const selected = meta
      .query(
        "SELECT s.id FROM apiReleaseSets s JOIN apiReleaseSetSnapshots m ON m.apiReleaseSetId=s.id WHERE s.status='current' AND s.domainCode='geographic' AND m.snapshotId=?",
      )
      .get(snapshots[0].id)
    if (!selected) {
      const releaseSet = await ensureDraftReleaseSetForRelease(
        ctx.metaDb as never,
        'division',
        { cohortKey: release.releaseVersion, regionCode: 'hk' },
        { domainCode: 'geographic' },
      )
      const source = meta
        .query(
          "SELECT resourceReleaseId FROM snapshotSources WHERE snapshotId=? AND role='primary'",
        )
        .get(snapshots[0].id) as any
      const dataset = await getDatasetRecordByReleaseId(
        ctx.metaDb as never,
        source.resourceReleaseId,
      )
      if (!dataset) throw Error('Missing assembly anchor dataset')
      const companions = []
      for (const member of await listCurrentApiCompositionMembersForType(
        ctx.metaDb as never,
        'division',
      )) {
        if (member.domainCode !== 'geographic' || member.variant === 'saanseoi')
          continue
        const companion = await (member.cohortMatchingMode === 'exact_ref'
          ? resolvePublishedSnapshotForResourceTypeRegionCohortKey(
              ctx.metaDb as never,
              member.resourceType,
              'hk',
              release.releaseVersion,
              { variant: member.variant },
            )
          : resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
              ctx.metaDb as never,
              member.resourceType,
              'hk',
              release.releaseVersion,
              { variant: member.variant },
            ))
        if (!companion && member.isRequired)
          throw Error(
            `Missing required companion ${member.resourceType}/${member.variant}`,
          )
        if (companion)
          companions.push({
            resourceType: member.resourceType,
            snapshotId: companion.id,
            variant: member.variant,
          })
      }
      await publishReleaseArtefacts(ctx.metaDb as never, {
        carriedSnapshots: [
          ...companions,
          {
            resourceType: 'divisionArea',
            snapshotId: snapshots[1].id,
            variant: 'saanseoi',
          },
        ],
        currentRelease: null,
        currentReleaseIsCorrected: false,
        dataset,
        publishedAt: new Date().toISOString(),
        releaseSetId: releaseSet.id,
        snapshotId: snapshots[0].id,
        snapshotVariant: 'saanseoi',
        resourceType: 'division',
        updateDatasetRelease: false,
      })
    }
    return {
      hash,
      reportDirectory,
      snapshots,
      divisions: data.divisions.length,
      areas: data.areas.length,
      drawings: stubs.features.length,
      islands: data.islandCount,
    }
  } finally {
    current.close()
    meta.close()
    ctx.cleanup()
  }
}
