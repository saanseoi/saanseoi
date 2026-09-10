import { dirname, join, resolve } from 'node:path'
import { Database as SQLiteDatabase } from 'bun:sqlite'
import { and, eq } from 'drizzle-orm'
import { resolveLocalD1Path } from '@repo/core/testing/localDb'
import {
  currentSchema,
  historySchema,
  metaSchema,
  type CurrentDatabase,
  type HistoryDatabase,
  type MetaDatabase,
} from '@repo/db'
import type { UploadEnvironment } from '../../../cli/options.ts'
import type { DivisionLookupMaps, DivisionLookupSource } from './hkgovAlsTypes.ts'
import { COUNTRY_NAME_ALIASES, HARBOUR_API_WRANGLER_CONFIG } from './hkgovAlsConfig.ts'
import { normaliseEnKey, normaliseZhKey, sqlLiteral } from './hkgovAlsNormalisation.ts'
import type { ReplayShard } from '@repo/core/pipeline/db/snapshotReplay'
import { loadAlsDivisionHistory } from './hkgovAlsDivisionHistory'

export async function loadDivisionLookupMaps(options: {
  currentDb?: CurrentDatabase
  historyDb?: HistoryDatabase
  historyShards?: ReadonlyMap<string, ReplayShard>
  cohortKey: string
  dbPath?: string
  environment: UploadEnvironment
  metaDb?: MetaDatabase
}): Promise<DivisionLookupMaps> {
  if (options.currentDb && options.metaDb) {
    const snapshot = await options.metaDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaSnapshots.cohortKey, options.cohortKey),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .limit(1)
      .get()
    if (!snapshot) {
      throw new Error(
        `No published Overture division snapshot found for cohort ${options.cohortKey}.`,
      )
    }
    if (options.historyShards) {
      return buildDivisionLookupMaps(
        await loadAlsDivisionHistory(
          options.metaDb,
          snapshot.id,
          options.historyShards,
        ),
      )
    }
    let rows = await options.currentDb
      .select({
        snapshotId: currentSchema.divisions.snapshotId,
        id: currentSchema.divisions.id,
        level: currentSchema.divisions.level,
        type: currentSchema.divisions.type,
        locale: currentSchema.divisionsI18n.locale,
        name: currentSchema.divisionsI18n.name,
      })
      .from(currentSchema.divisions)
      .innerJoin(
        currentSchema.divisionsI18n,
        and(
          eq(
            currentSchema.divisionsI18n.snapshotId,
            currentSchema.divisions.snapshotId,
          ),
          eq(currentSchema.divisionsI18n.divisionId, currentSchema.divisions.id),
        ),
      )
      .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
      .all()
    if (rows.length === 0 && options.historyDb) {
      rows = await options.historyDb
        .select({
          snapshotId: historySchema.divisions.snapshotId,
          id: historySchema.divisions.id,
          level: historySchema.divisions.level,
          type: historySchema.divisions.type,
          locale: historySchema.divisionsI18n.locale,
          name: historySchema.divisionsI18n.name,
        })
        .from(historySchema.divisions)
        .innerJoin(
          historySchema.divisionsI18n,
          and(
            eq(historySchema.divisionsI18n.divisionId, historySchema.divisions.id),
            eq(
              historySchema.divisionsI18n.versionHash,
              historySchema.divisions.versionHash,
            ),
          ),
        )
        .where(eq(historySchema.divisions.snapshotId, snapshot.id))
        .all()
    }
    return buildDivisionLookupMaps(rows)
  }

  const currentSource = resolveDivisionLookupSource(options)
  const snapshotSource = resolveDivisionSnapshotSource(options)
  const snapshotId =
    snapshotSource.kind === 'sqlite'
      ? loadPublishedDivisionSnapshotIdFromSqlite(
          snapshotSource.dbPath,
          options.cohortKey,
        )
      : await loadPublishedDivisionSnapshotIdFromWrangler(
          snapshotSource,
          options.cohortKey,
        )
  const rows =
    currentSource.kind === 'sqlite'
      ? loadDivisionLookupRowsFromSqlite(currentSource.dbPath, snapshotId)
      : await loadDivisionLookupRowsFromWrangler(currentSource, snapshotId)

  return buildDivisionLookupMaps(rows)
}

function loadPublishedDivisionSnapshotIdFromSqlite(
  explicitDbPath: string,
  cohortKey: string,
) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    const row = sqlite
      .query(
        `
          SELECT s.id AS snapshotId
          FROM snapshots s
          INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
          WHERE s.resourceType = 'division'
            AND s.status = 'published'
            AND s.cohortKey = ?
            AND sl.variant = 'overture'
          ORDER BY s.revision DESC
          LIMIT 1
        `,
      )
      .get(cohortKey) as { snapshotId: string } | null

    if (!row?.snapshotId) {
      throw new Error(
        `No published Overture division snapshot found for cohort ${cohortKey}.`,
      )
    }

    return row.snapshotId
  } finally {
    sqlite.close()
  }
}

function loadDivisionLookupRowsFromSqlite(explicitDbPath: string, snapshotId: string) {
  const databasePath = resolveLocalD1Path(explicitDbPath)
  const sqlite = new SQLiteDatabase(databasePath, { readonly: true })

  try {
    return sqlite
      .query(
        `
          SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
          FROM divisions d
          JOIN divisionsI18n di
            ON di.snapshotId = d.snapshotId
           AND di.divisionId = d.id
          WHERE d.snapshotId = ?
            AND di.locale IN ('en', 'zh-hant')
        `,
      )
      .all(snapshotId) as Array<DivisionLookupRow>
  } finally {
    sqlite.close()
  }
}

async function loadDivisionLookupRowsFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  snapshotId: string,
) {
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    target.databaseName,
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT d.snapshotId, d.id, d.level, d.type, di.locale, di.name
      FROM divisions d
      JOIN divisionsI18n di
        ON di.snapshotId = d.snapshotId
       AND di.divisionId = d.id
      WHERE d.snapshotId = '${snapshotId}'
        AND di.locale IN ('en', 'zh-hant')
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query divisions from ${target.wranglerEnv} D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: DivisionLookupRow[]
    success?: boolean
  }>
  const firstResult = payload[0]

  if (!firstResult?.success || !Array.isArray(firstResult.results)) {
    throw new Error(
      `Unexpected Wrangler D1 response for ${target.wranglerEnv} environment.`,
    )
  }

  return firstResult.results
}

async function loadPublishedDivisionSnapshotIdFromWrangler(
  target: Extract<DivisionLookupSource, { kind: 'wrangler' }>,
  cohortKey: string,
) {
  const args = [
    'x',
    'wrangler',
    'd1',
    'execute',
    'DB_META',
    `--${target.mode}`,
    '--config',
    HARBOUR_API_WRANGLER_CONFIG,
    '--env',
    target.wranglerEnv,
    '--json',
    '--command',
    `
      SELECT s.id AS snapshotId
      FROM snapshots s
      INNER JOIN snapshotLineages sl ON sl.id = s.snapshotLineageId
      WHERE s.resourceType = 'division'
        AND s.status = 'published'
        AND s.cohortKey = ${sqlLiteral(cohortKey)}
        AND sl.variant = 'overture'
      ORDER BY s.revision DESC
      LIMIT 1
    `,
  ]

  const process = Bun.spawn({
    cmd: ['bun', ...args],
    cwd: resolve(import.meta.dir, '../../../../..'),
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])

  if (exitCode !== 0) {
    throw new Error(
      `Failed to query division snapshot from ${target.wranglerEnv} meta D1.\n${stderr.trim() || stdout.trim()}`,
    )
  }

  const payload = JSON.parse(stdout) as Array<{
    results?: Array<{
      snapshotId?: string
    }>
    success?: boolean
  }>
  const firstResult = payload[0]
  const snapshotId = firstResult?.results?.[0]?.snapshotId

  if (!firstResult?.success || !snapshotId) {
    throw new Error(
      `No published Overture division snapshot found for cohort ${cohortKey} in ${target.wranglerEnv} meta D1.`,
    )
  }

  return snapshotId
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
  type: string
}

function buildDivisionLookupMaps(rows: Array<DivisionLookupRow>): DivisionLookupMaps {
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
    if (!row.name) {
      continue
    }

    if (row.level === 1 || row.type === 'area') {
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

    if (row.level === 2 || row.type === 'district') {
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
