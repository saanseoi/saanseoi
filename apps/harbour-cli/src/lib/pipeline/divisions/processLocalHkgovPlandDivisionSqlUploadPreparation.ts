import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { historyVersionSelection } from '@repo/core/pipeline/db/snapshotReplay'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { parseWkbGeometry } from '@repo/core/pipeline/services/divisions/division'
import { materialiseDivisionHierarchies } from '@repo/core/pipeline/services/divisions/divisionHierarchies'
import {
  canonicalDivisionPoint,
  createDivisionPointGuard,
} from '@repo/core/pipeline/services/divisions/divisionPoint'
import { canonicalIdentifiers } from '@repo/core/pipeline/services/sources/canonicalIdentifiers'
import { datasetSourceRecordIdentity } from '@repo/core/pipeline/services/sources/datasetSourceRecordIdentity'
import { recordContent } from '@repo/core/pipeline/services/sources/recordContent'
import { resolveStatisticEvents } from '@repo/core/pipeline/services/statistics/statisticSnapshotRecords'
import { createHash } from '@repo/core/pipeline/utils'
import {
  guardSession,
  registerRule,
  ruleDeclarationFromFixture,
} from '@repo/core/provenance'
import { composeSourceRecordId } from '@repo/core/sourceRecordIdentity'
import { emptyDivisionHierarchies, historySchema, metaSchema } from '@repo/db'
import type { DivisionVersionRow } from '@repo/db/historySchema'
import { eq } from 'drizzle-orm'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/assembly/planning-division-normalisation.json'
import { resolveSourceReleaseNameTranslationsBatch } from '../../i18n/sourceReleaseTranslations.ts'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import { validatePlanningHierarchy } from './planningHierarchy'
import {
  asRecord,
  levelNumber,
  requireString,
  requireValue,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'
import type {
  HkgovPlandDivisionUploadPlan,
  PreparedDivision,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'

export async function listCurrentHistoryRows(
  metaDb: HarbourReadableDb,
  historyDbs: HarbourReadableDb[],
  parentSnapshotId: string | null,
  source: HkgovPlandDivisionUploadPlan['source'],
) {
  if (!parentSnapshotId) return []
  const plan = await resolveSnapshotReplayPlan(metaDb, parentSnapshotId)
  const groups = await resolveStatisticEvents(
    historyDbs,
    plan.map(step => step.snapshotId),
    ['division'],
  )
  const rows: DivisionVersionRow[] = []
  for (const [db, versions] of groups) {
    for (let offset = 0; offset < versions.length; offset += 256) {
      rows.push(
        ...((await db
          .select()
          .from(historySchema.divisions)
          .where(
            historyVersionSelection(
              historySchema.divisions,
              versions.slice(offset, offset + 256),
            ),
          )
          .all()) as DivisionVersionRow[]),
      )
    }
  }
  return rows.filter(row =>
    source === 'hkgov-pland-new-town'
      ? row.class === 'planning-newtown'
      : row.class.startsWith('planning-') && row.class !== 'planning-newtown',
  )
}

export async function loadPlandNewTownDivisionCodes(metaDb: HarbourReadableDb) {
  const rows = await metaDb
    .select({
      canonicalId: metaSchema.metaDivisionCodes.canonicalId,
      divisionCode: metaSchema.metaDivisionCodes.divisionCode,
    })
    .from(metaSchema.metaDivisionCodes)
    .where(eq(metaSchema.metaDivisionCodes.domainCode, 'hkgov-pland-new-town'))
    .all()
  const divisionCodesByCanonicalId = new Map<string, string>()
  for (const row of rows) {
    if (divisionCodesByCanonicalId.has(row.canonicalId)) {
      throw new Error(`Duplicate curated New Town Division target=${row.canonicalId}.`)
    }
    divisionCodesByCanonicalId.set(row.canonicalId, row.divisionCode)
  }
  return divisionCodesByCanonicalId
}

async function readPreparedDivisionsInternal(
  bucket: LocalPipelineBucket,
  key: string,
  sourceRelease: string,
  allowTranslationGeneration: boolean,
  divisionCodesByCanonicalId: ReadonlyMap<string, string>,
  pointGuard = createDivisionPointGuard(),
) {
  const file = await createAsyncBufferFromR2(bucket, key)
  const records: PreparedDivision[] = []
  for await (const batch of readParquetObjectsInBatches(file, 512)) {
    for (const raw of batch) {
      records.push(
        await normalisePreparedDivision(raw, divisionCodesByCanonicalId, pointGuard),
      )
    }
  }
  const translationsByDivisionId = await resolveSourceReleaseNameTranslationsBatch({
    allowGeneration: allowTranslationGeneration,
    records: records.map(record => ({
      localisations: record.i18n,
      recordId: record.base.id,
    })),
    sourceRelease,
  })
  const translated = records.map(record => {
    const resolved = translationsByDivisionId.get(record.base.id)
    if (!resolved) {
      throw new Error(
        `Missing source-release i18n result for ${sourceRelease}/${record.base.id}.`,
      )
    }
    return { ...record, i18n: resolved.localisations }
  })
  const byId = new Map(translated.map(record => [record.base.id, record]))
  return Promise.all(
    translated.map(async record => {
      const rawPath = Array.isArray(record.raw.hierarchy) ? record.raw.hierarchy : []
      validatePlanningHierarchy(
        record.base,
        rawPath.map(entry => {
          const id = (entry as { division_id: string }).division_id
          const parent = byId.get(id)
          if (!parent) throw new Error(`Missing Planning ancestor ${id}.`)
          return parent.base
        }),
      )
      const path = rawPath.map(entry => {
        const id = (entry as { division_id: string }).division_id
        const parent = byId.get(id)
        if (!parent) throw new Error(`Missing Planning ancestor ${id}.`)
        return {
          division_id: id,
          class: parent.base.class,
          i18n: Object.fromEntries(
            parent.i18n.map(row => [row.locale, { name: row.name }]),
          ),
        }
      })
      const base = {
        ...record.base,
        hierarchies: materialiseDivisionHierarchies(record.base.id, [path]),
      }
      return {
        ...record,
        base,
        versionHash: await createHash({
          base: recordContent(base),
          i18n: record.i18n.toSorted((a, b) => a.locale.localeCompare(b.locale)),
        }),
      }
    }),
  )
}

export async function normalisePreparedDivision(
  value: Record<string, unknown>,
  divisionCodesByCanonicalId: ReadonlyMap<string, string>,
  pointGuard = createDivisionPointGuard(),
) {
  const id = requireString(value.id, 'id')
  const level = requireString(value.planning_level, 'planning_level')
  const sourceProperties = asRecord(value.source_properties)
  const identifiers = canonicalIdentifiers(value.identifiers)
  const sourceCellIds =
    typeof value.source_cell_ids === 'string'
      ? JSON.parse(value.source_cell_ids)
      : (value.source_cell_ids ?? [])
  const i18n = normaliseI18n(value.i18n)
  const cells =
    level === 'subunit' ? normalisePlanningCells(sourceProperties.sourceFeatures) : []
  const newTown = level === 'newtown' ? normaliseNewTown(sourceProperties, i18n) : null
  const attributionIds = newTown ? [newTown.sourceRecordId] : sourceCellIds
  if (
    !Array.isArray(attributionIds) ||
    !attributionIds.length ||
    attributionIds.some(id => typeof id !== 'string' || !id)
  )
    throw new Error('Planning attribution requires native source cell IDs.')
  const geometry = canonicalDivisionPoint(parseWkbGeometry(value.geometry), {
    id,
    guard: pointGuard,
  })
  if (!geometry) throw new Error(`Planning division ${id} has invalid geometry.`)
  const base = {
    cartography: null,
    divisionCode: resolvePlandDivisionCode(level, id, divisionCodesByCanonicalId),
    geometry,
    hierarchies: emptyDivisionHierarchies(),
    id,
    identifiers,
    level: levelNumber(level),
    sources: attributionIds.map(recordId => ({
      publisher: 'hkgov-pland',
      dataset: newTown
        ? 'ds-hk-hkgov-pland-division-new-town'
        : 'ds-hk-hkgov-pland-division-pu',
      recordId,
    })),
    class: `planning-${level}`,
    category: null,
  }
  const versionHash = await createHash(recordContent(base))
  return {
    base,
    cells,
    i18n,
    newTown,
    raw: value,
    sourceCellIds,
    versionHash,
  } satisfies PreparedDivision
}

export function resolvePlandDivisionCode(
  planningLevel: string,
  canonicalId: string,
  divisionCodesByCanonicalId: ReadonlyMap<string, string>,
) {
  return planningLevel === 'newtown'
    ? (divisionCodesByCanonicalId.get(canonicalId) ?? null)
    : null
}

export function wasPlanningGeometryRepaired(record: PreparedDivision) {
  return (
    record.cells.some(cell => cell.wasGeometryRepaired) ||
    record.newTown?.wasGeometryRepaired === true ||
    Boolean(
      (record.raw.source_properties as Record<string, unknown> | undefined)
        ?.was_geometry_repaired,
    )
  )
}

function normalisePlanningCells(value: unknown): PreparedDivision['cells'] {
  if (!Array.isArray(value)) {
    throw new Error('Planning subunit source properties require sourceFeatures.')
  }
  return value.map((entry, index) => {
    const cell = asRecord(entry)
    if (!Object.hasOwn(cell, 'properties'))
      throw new Error(
        `Planning sourceFeatures[${index}].properties is missing; prepare the release again.`,
      )
    return {
      ppuCode: requireString(cell.ppuCode, `sourceFeatures[${index}].ppuCode`),
      properties: cell.properties ?? null,
      sourceRecordId: requireString(
        cell.sourceRecordId,
        `sourceFeatures[${index}].sourceRecordId`,
      ),
      sourceGeometry: cell.sourceGeometry ?? null,
      spuCode: requireString(cell.spuCode, `sourceFeatures[${index}].spuCode`),
      subunitCode: requireString(
        cell.subunitCode,
        `sourceFeatures[${index}].subunitCode`,
      ),
      tpuCode: requireString(cell.tpuCode, `sourceFeatures[${index}].tpuCode`),
      wasGeometryRepaired: cell.wasGeometryRepaired === true,
    }
  })
}

function normaliseNewTown(
  sourceProperties: Record<string, unknown>,
  i18n: Array<{ locale: string; name: string }>,
) {
  const name = (locale: string) =>
    i18n.find(entry => entry.locale === locale)?.name ?? null
  return {
    nameEn: requireString(name('en'), 'New Town English name'),
    nameZhHans: name('zh-hans'),
    nameZhHant: requireString(name('zh-hant'), 'New Town Traditional Chinese name'),
    properties: asRecord(sourceProperties.sourceFeature).properties ?? null,
    sourceGeometry: requireValue(
      sourceProperties.source_geometry,
      'New Town source geometry',
    ),
    sourceRecordId: composeSourceRecordId(
      datasetSourceRecordIdentity('ds-hk-hkgov-pland-division-new-town'),
      asRecord(asRecord(sourceProperties.sourceFeature).properties),
    ),
    wasGeometryRepaired: sourceProperties.was_geometry_repaired === true,
  }
}

function normaliseI18n(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    return typeof record.locale === 'string' && typeof record.name === 'string'
      ? [{ locale: record.locale, name: record.name }]
      : []
  })
}

function validatePreparedDivisionsInternal(
  records: PreparedDivision[],
  expectedCount: number,
) {
  if (records.length !== expectedCount) {
    throw new Error(
      `Planning Department division parquet expected ${expectedCount} records; found ${records.length}.`,
    )
  }
  const ids = new Set<string>()
  for (const record of records) {
    if (ids.has(record.base.id))
      throw new Error(`Duplicate planning division ${record.base.id}.`)
    ids.add(record.base.id)
    for (const parent of record.base.hierarchies.full.flat()) {
      if (typeof parent.id === 'string' && !ids.has(parent.id)) {
        // Parent rows are emitted before their children; this guards accidental cross-domain links.
        throw new Error(
          `Planning division ${record.base.id} references unavailable parent ${parent.id}.`,
        )
      }
    }
  }
}

export const planningDivisionRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  (args: Parameters<typeof readPreparedDivisionsInternal>) =>
    readPreparedDivisionsInternal(...args),
)

export function readPreparedDivisions(
  ...args: Parameters<typeof readPreparedDivisionsInternal>
) {
  return planningDivisionRule.execute(args)
}
export function validatePreparedDivisions(
  ...args: Parameters<typeof validatePreparedDivisionsInternal>
) {
  return guardSession([
    {
      id: 'planning-prepared-divisions',
      summary:
        'Require expected Planning record coverage, unique identities and parent-before-child hierarchy.',
      consequence: 'block-ingestion',
    },
  ]).check('planning-prepared-divisions', () =>
    validatePreparedDivisionsInternal(...args),
  )
}
