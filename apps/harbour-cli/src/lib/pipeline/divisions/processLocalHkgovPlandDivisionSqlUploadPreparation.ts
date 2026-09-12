import { emptyDivisionHierarchies } from '@repo/db'
import { materialiseDivisionHierarchies } from '@repo/core/pipeline/services/divisions/divisionHierarchies'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/planning-division-normalisation.json'
import { ruleDeclarationFromFixture } from '@repo/core/provenance'
import { eq } from 'drizzle-orm'
import { registerRule, guardSession } from '@repo/core/provenance'
import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { calculateGeoJsonBbox } from '@repo/core/pipeline/geojson'
import { parseWkbGeometry } from '@repo/core/pipeline/services/divisions/division'
import { createHash } from '@repo/core/pipeline/utils'
import { historySchema, metaSchema } from '@repo/db'
import type { LocalPipelineBucket } from '../local/localBucket.ts'
import { resolveSourceReleaseNameTranslationsBatch } from '../../i18n/sourceReleaseTranslations.ts'
import type {
  HkgovPlandDivisionUploadPlan,
  PreparedDivision,
} from './processLocalHkgovPlandDivisionSqlUploadTypes.ts'
import {
  asRecord,
  levelNumber,
  requireString,
  requireValue,
} from './processLocalHkgovPlandDivisionSqlUploadRows.ts'

export async function listCurrentHistoryRows(
  db: HarbourReadableDb,
  source: HkgovPlandDivisionUploadPlan['source'],
) {
  const rows = await db
    .select({
      id: historySchema.divisions.id,
      geometry: historySchema.divisions.geometry,
      bbox: historySchema.divisions.bbox,
      divisionCode: historySchema.divisions.divisionCode,
      identifiers: historySchema.divisions.identifiers,
      level: historySchema.divisions.level,
      category: historySchema.divisions.category,
      class: historySchema.divisions.class,
      wikidata: historySchema.divisions.wikidata,
      hierarchies: historySchema.divisions.hierarchies,
      cartography: historySchema.divisions.cartography,
      sources: historySchema.divisions.sources,
      versionHash: historySchema.divisions.versionHash,
    })
    .from(historySchema.divisions)
    .where(eq(historySchema.divisions.isCurrent, true))
    .all()
  return rows.filter(row => {
    const sources = row.sources as Record<string, unknown>
    const pland = sources.hkgovPland
    return (
      Array.isArray(pland) &&
      pland.some(
        item =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>).sourceVersion !== undefined &&
          (source === 'hkgov-pland-new-town'
            ? (item as Record<string, unknown>).planningLevel === 'newtown'
            : (item as Record<string, unknown>).planningLevel !== 'newtown'),
      )
    )
  })
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
) {
  const file = await createAsyncBufferFromR2(bucket, key)
  const records: PreparedDivision[] = []
  for await (const batch of readParquetObjectsInBatches(file, 512)) {
    for (const raw of batch) {
      records.push(await normalisePreparedDivision(raw, divisionCodesByCanonicalId))
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
          base,
          i18n: record.i18n.toSorted((a, b) => a.locale.localeCompare(b.locale)),
        }),
      }
    }),
  )
}

async function normalisePreparedDivision(
  value: Record<string, unknown>,
  divisionCodesByCanonicalId: ReadonlyMap<string, string>,
) {
  const id = requireString(value.id, 'id')
  const level = requireString(value.planning_level, 'planning_level')
  const sourceProperties = asRecord(value.source_properties)
  const identifiers = asRecord(value.identifiers)
  const sourceCellIds = value.source_cell_ids ?? []
  const i18n = normaliseI18n(value.i18n)
  const geometry = parseWkbGeometry(value.geometry)
  if (!geometry) throw new Error(`Planning division ${id} has invalid geometry.`)
  const base = {
    bbox: calculateGeoJsonBbox(geometry),
    cartography: null,
    divisionCode: resolvePlandDivisionCode(level, id, divisionCodesByCanonicalId),
    geometry,
    hierarchies: emptyDivisionHierarchies(),
    id,
    identifiers,
    level: levelNumber(level),
    sources: {
      hkgovPland: [{ sourceVersion: value.source_version, planningLevel: level }],
    },
    class: `planning-${level}`,
    category: null,
    wikidata: null,
  }
  const versionHash = await createHash(base)
  const cells =
    level === 'subunit' ? normalisePlanningCells(sourceProperties.sourceFeatures) : []
  const newTown = level === 'newtown' ? normaliseNewTown(sourceProperties, i18n) : null
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
    nameZhHans: requireString(name('zh-hans'), 'New Town Simplified Chinese name'),
    nameZhHant: requireString(name('zh-hant'), 'New Town Traditional Chinese name'),
    properties: asRecord(sourceProperties.sourceFeature).properties ?? null,
    sourceGeometry: requireValue(
      sourceProperties.source_geometry,
      'New Town source geometry',
    ),
    sourceRecordId: requireString(sourceProperties.newtown_id, 'newtown_id'),
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
