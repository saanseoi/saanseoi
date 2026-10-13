import { addTownLookup, type TownLookup } from './hkgovAlsTowns'
import { addLandformLookup, type LandformLookup } from './hkgovAlsLandforms'
import type { DivisionHierarchies } from '@repo/db'
import { dirname, join, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { sql } from 'drizzle-orm'
import {
  createDivisionMembership,
  type MembershipArea,
} from '../../../pipeline/divisions/divisionMembership'
import { readGeometrySnapshot } from '../../../pipeline/divisions/readGeometrySnapshot'
import { resolveLocalD1Path } from '@repo/core/testing/localDb'
import type { CurrentDatabase, HistoryDatabase, MetaDatabase } from '@repo/db'
import type { UploadEnvironment } from '../../../cli/options.ts'
import type { DivisionLookupMaps, DivisionLookupSource } from './hkgovAlsTypes.ts'
import { COUNTRY_NAME_ALIASES, HARBOUR_API_WRANGLER_CONFIG } from './hkgovAlsConfig.ts'
import { normaliseEnKey, normaliseZhKey, sqlLiteral } from './hkgovAlsNormalisation.ts'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import { loadAlsDivisionHistory } from './hkgovAlsDivisionHistory'

type LookupOptions = {
  currentDb?: CurrentDatabase
  historyDb?: HistoryDatabase
  historyShards?: ReadonlyMap<string, ReplayShard>
  cohortKey: string
  dbPath?: string
  environment: UploadEnvironment
  metaDb?: MetaDatabase
}

export function alsDivisionSnapshotSelectionSql(cohortKey: string) {
  return `
    SELECT s.id,s.cohortKey,l.variant FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId
    WHERE l.resourceType='division' AND s.status='published' AND l.regionCode='hk'
      AND (l.variant='saanseoi' OR (l.variant='overture' AND s.cohortKey=${sqlLiteral(cohortKey)}))
    ORDER BY CASE WHEN l.variant='saanseoi' THEN 0 ELSE 1 END,s.cohortKey DESC,s.revision DESC LIMIT 1`
}

export async function loadDivisionLookupMaps(
  options: LookupOptions,
): Promise<DivisionLookupMaps> {
  const query = async <T>(
    kind: 'current' | 'meta',
    statement: string,
  ): Promise<T[]> => {
    const db = kind === 'current' ? options.currentDb : options.metaDb
    if (db) return (await db.all(sql.raw(statement))) as T[]
    const source =
      kind === 'current'
        ? resolveDivisionLookupSource(options)
        : resolveDivisionSnapshotSource(options)
    if (source.kind === 'sqlite') {
      const sqlite = new SQLiteDatabase(source.dbPath, { readonly: true })
      try {
        return sqlite.query(statement).all() as T[]
      } finally {
        sqlite.close()
      }
    }
    const process = Bun.spawn({
      cmd: [
        'bun',
        'x',
        'wrangler',
        'd1',
        'execute',
        source.databaseName,
        `--${source.mode}`,
        '--config',
        HARBOUR_API_WRANGLER_CONFIG,
        '--env',
        source.wranglerEnv,
        '--json',
        '--command',
        statement,
      ],
      cwd: resolve(import.meta.dir, '../../../../..'),
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])
    if (code) throw new Error(`Division lookup failed: ${stderr || stdout}`)
    const result = JSON.parse(stdout)[0]
    if (!result?.success || !Array.isArray(result.results))
      throw new Error('Invalid division lookup response.')
    return result.results as T[]
  }
  // Curated HK editions are independent of Overture's monthly cohorts. Fresh
  // ingestion uses the latest reviewed edition and records its immutable IDs.
  const [snapshot] = await query<{
    id: string
    cohortKey: string
    variant: string
  }>('meta', alsDivisionSnapshotSelectionSql(options.cohortKey))
  if (!snapshot)
    throw new Error('No published division snapshot found for ALS preparation.')
  let rows: DivisionLookupRow[]
  if (options.metaDb && options.historyShards) {
    rows = await loadAlsDivisionHistory(
      options.metaDb,
      snapshot.id,
      options.historyShards,
    )
  } else {
    rows = await query<DivisionLookupRow>(
      'current',
      `
      SELECT p.snapshotId,d.id,d.level,d.class,d.hierarchies,di.locale,di.name
      FROM divisions d JOIN divisionPublicationState p ON p.scopeId=d.snapshotId
      JOIN divisionsI18n di ON di.snapshotId=d.snapshotId AND di.divisionId=d.id
      WHERE p.snapshotId=${sqlLiteral(snapshot.id)} AND p.preparedAt IS NOT NULL AND p.publicationToken<>''`,
    )
  }
  const maps = buildDivisionLookupMaps(rows)
  const [areaSnapshot] = await query<{ id: string }>(
    'meta',
    `
    SELECT s.id FROM snapshots s JOIN snapshotLineages l ON l.id=s.snapshotLineageId
    WHERE l.resourceType='divisionArea' AND s.status='published' AND l.regionCode='hk'
      AND l.variant=${sqlLiteral(snapshot.variant)} AND s.cohortKey=${sqlLiteral(snapshot.cohortKey)}
    ORDER BY s.revision DESC LIMIT 1`,
  )
  if (!areaSnapshot)
    throw new Error(
      `ALS preparation requires published ${snapshot.variant} divisionArea geometry for ${snapshot.cohortKey}.`,
    )
  let areas: MembershipArea[]
  if (options.currentDb && options.metaDb && options.historyShards) {
    const geometryRows = await readGeometrySnapshot(
      {
        currentDb: options.currentDb,
        metaDb: options.metaDb,
        historyTargets: [...options.historyShards.values()] as never,
      },
      'divisionArea',
      areaSnapshot.id,
    )
    areas = geometryRows.map(row => ({
      divisionId: (row as { divisionId: string }).divisionId,
      geometry: row.geometry,
    }))
  } else {
    const [receipt] = await query<{ scopeId: string }>(
      'current',
      `SELECT scopeId FROM divisionAreaPublicationState WHERE snapshotId=${sqlLiteral(areaSnapshot.id)} AND preparedAt IS NOT NULL AND publicationToken<>''`,
    )
    if (!receipt)
      throw new Error(
        `DivisionArea ${areaSnapshot.id} requires a complete local projection or history replay.`,
      )
    areas = await query<MembershipArea>(
      'current',
      `SELECT divisionId,geometry FROM divisionAreas WHERE snapshotId=${sqlLiteral(receipt.scopeId)}`,
    )
  }
  return {
    ...maps,
    areaSnapshotId: areaSnapshot.id,
    membership: createDivisionMembership(rows, areas),
  }
}

export function resolveDivisionLookupSource(
  options: {
    dbPath?: string
    environment: UploadEnvironment
  },
  resolveLocalDbPath: (explicitPath?: string) => string = resolveLocalD1Path,
): DivisionLookupSource {
  if (options.dbPath) {
    return {
      dbPath: resolveLocalDbPath(options.dbPath),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'dev') {
    return {
      dbPath: resolveLocalDbPath(),
      kind: 'sqlite',
    }
  }

  if (options.environment === 'production') {
    return {
      databaseName: 'DB_CURRENT',
      kind: 'wrangler',
      mode: 'remote',
      wranglerEnv: 'production',
    }
  }

  return {
    databaseName: 'DB_CURRENT',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: 'preview',
  }
}

function resolveLocalMetaD1Path(explicitPath?: string) {
  const databasePath = resolveLocalD1Path(explicitPath)

  return join(dirname(databasePath), 'metadata.sqlite')
}

export function resolveDivisionSnapshotSource(
  options: {
    dbPath?: string
    environment: UploadEnvironment
  },
  resolveLocalMetaDbPath: (explicitPath?: string) => string = resolveLocalMetaD1Path,
) {
  if (options.dbPath || options.environment === 'dev') {
    return {
      dbPath: resolveLocalMetaDbPath(options.dbPath),
      kind: 'sqlite',
    } satisfies DivisionLookupSource
  }

  return {
    databaseName: 'DB_META',
    kind: 'wrangler',
    mode: 'remote',
    wranglerEnv: options.environment === 'production' ? 'production' : 'preview',
  } satisfies DivisionLookupSource
}

type DivisionLookupRow = {
  snapshotId: string
  id: string
  level: number | null
  locale: string
  name: string | null
  class: string
  hierarchies?: DivisionHierarchies | string
}

function buildDivisionLookupMaps(rows: Array<DivisionLookupRow>): DivisionLookupMaps {
  const towns: TownLookup = new Map()
  const landforms: LandformLookup = new Map()
  const areaByEn = new Map<string, string>()
  const areaByZh = new Map<string, string>()
  const ambiguousAreaEn = new Set<string>()
  const ambiguousAreaZh = new Set<string>()
  const districtByEn = new Map<string, string>()
  const districtByZh = new Map<string, string>()
  const ambiguousDistrictEn = new Set<string>()
  const ambiguousDistrictZh = new Set<string>()
  let countryId: string | null = null
  const snapshotId = rows[0]?.snapshotId ?? null

  if (!snapshotId) {
    throw new Error('No published division snapshot found in current database.')
  }

  for (const row of rows) {
    addTownLookup(towns, row)
    addLandformLookup(landforms, row)
    if (!row.name) {
      continue
    }

    if (row.class === 'area') {
      if (row.locale === 'en') {
        addDivisionLookupEntry(
          areaByEn,
          ambiguousAreaEn,
          normaliseEnKey(row.name),
          row.id,
        )
      }

      if (row.locale === 'zh-hant') {
        addDivisionLookupEntry(
          areaByZh,
          ambiguousAreaZh,
          normaliseZhKey(row.name),
          row.id,
        )
      }
    }

    if (row.class === 'district') {
      if (row.locale === 'en') {
        addDivisionLookupEntry(
          districtByEn,
          ambiguousDistrictEn,
          normaliseEnKey(row.name),
          row.id,
        )
      }

      if (row.locale === 'zh-hant') {
        addDivisionLookupEntry(
          districtByZh,
          ambiguousDistrictZh,
          normaliseZhKey(row.name),
          row.id,
        )
      }
    }

    if (row.level === 0 && row.locale === 'en') {
      const normalised = normaliseEnKey(row.name)

      if (COUNTRY_NAME_ALIASES.some(alias => normalised === normaliseEnKey(alias))) {
        countryId = row.id
      }
    }
  }

  return {
    towns,
    landforms,
    areaByEn,
    areaByZh,
    ambiguousAreaEn,
    ambiguousAreaZh,
    countryId,
    districtByEn,
    districtByZh,
    ambiguousDistrictEn,
    ambiguousDistrictZh,
    snapshotId,
  }
}

function addDivisionLookupEntry(
  map: Map<string, string>,
  ambiguousKeys: Set<string>,
  key: string,
  id: string,
) {
  if (ambiguousKeys.has(key)) return
  const existingId = map.get(key)
  if (existingId && existingId !== id) {
    map.delete(key)
    ambiguousKeys.add(key)
    return
  }
  map.set(key, id)
}

export function resolveMappedDivision(input: {
  ambiguousEn: Set<string>
  ambiguousZh: Set<string>
  byEn: Map<string, string>
  byZh: Map<string, string>
  en: string | null
  zh: string | null
}) {
  const ids = new Set<string>()
  let ambiguous = false

  if (input.en) {
    const key = normaliseEnKey(input.en)
    const id = input.byEn.get(key)
    if (id) ids.add(id)
    if (input.ambiguousEn.has(key)) ambiguous = true
  }
  if (input.zh) {
    const key = normaliseZhKey(input.zh)
    const id = input.byZh.get(key)
    if (id) ids.add(id)
    if (input.ambiguousZh.has(key)) ambiguous = true
  }

  if (ids.size > 1 || ambiguous) {
    // Do not let one language silently choose a row when another language or
    // the snapshot itself indicates that the label is ambiguous.
    return { id: null, status: 'ambiguous' as const }
  }

  const id = ids.values().next().value ?? null
  return id
    ? { id, status: 'matched' as const }
    : { id: null, status: 'unmatched' as const }
}
