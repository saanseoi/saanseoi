import { createHash, createHmac } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { Database, constants } from 'bun:sqlite'

export type Shard = { binding: string; path: string }
type Row = Record<string, unknown>
type Column = { name: string; type: string; notnull: number; pk: number }
type ForeignKey = { id: number; seq: number; table: string; from: string; to: string }
type Edge = { target: string; pairs: [string, string][] }
const q = (name: string) => `"${name.replaceAll('"', '""')}"`
export const SHARED_GROUP = '__shared__'
const kinds = ['META', 'CURRENT', 'HISTORY', 'SOURCE']

export async function discover(): Promise<Shard[]> {
  const root = resolve(import.meta.dirname, '../../..')
  const config = await Bun.file(resolve(root, 'apps/harbour-api/wrangler.jsonc')).json()
  return config.d1_databases.flatMap((entry: Record<string, string>) => {
    if (
      !/^DB_(META|CURRENT|HISTORY_[A-Z]{2}_(\d{4}|BEFORE)|SOURCE_[A-Z]{2}_(\d{4}|BEFORE))$/.test(
        entry.binding,
      )
    )
      return []
    const key = createHash('sha256').update('miniflare-D1DatabaseObject').digest()
    const first = createHmac('sha256', key)
      .update(entry.preview_database_id ?? entry.database_id ?? entry.binding)
      .digest()
      .subarray(0, 16)
    const second = createHmac('sha256', key).update(first).digest().subarray(0, 16)
    const path = resolve(
      root,
      '.local/d1/dev/v3/d1/miniflare-D1DatabaseObject',
      `${Buffer.concat([first, second]).toString('hex')}.sqlite`,
    )
    return [{ binding: entry.binding, path }]
  })
}

export class ReviewDatabase {
  shards: Array<Shard & { db: Database }> = []
  missing: string[] = []
  constructor(shards: Shard[]) {
    const meta = shards.find(s => s.binding === 'DB_META')
    if (!meta || !existsSync(meta.path))
      throw new Error('Local DB_META not found. Initialise the local database first.')
    try {
      for (const shard of shards) {
        if (!existsSync(shard.path)) {
          this.missing.push(shard.binding)
          continue
        }
        const db = new Database(
          shard.path,
          constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
        )
        this.shards.push({ ...shard, db })
        db.exec('PRAGMA busy_timeout=5000')
        db.query('ATTACH DATABASE ? AS review_meta').run(`file:${meta.path}?mode=ro`)
        db.exec('PRAGMA query_only=ON')
      }
    } catch (error) {
      this.close()
      throw error
    }
  }
  close() {
    for (const shard of this.shards) shard.db.close()
  }
  selected(kind: string) {
    if (!kinds.includes(kind)) throw new Error('Unknown shard type')
    return this.shards.filter(
      s => s.binding === `DB_${kind}` || s.binding.startsWith(`DB_${kind}_`),
    )
  }
  names(db: Database) {
    return db
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE '%Fts%' ORDER BY name`,
      )
      .all()
      .map(r => r.name)
  }
  columns(db: Database, table: string) {
    return db.query<Column, []>(`PRAGMA table_info(${q(table)})`).all()
  }
  revision(kind: string) {
    const relevant = this.shards.filter(
      s => s.binding === 'DB_META' || this.selected(kind).includes(s),
    )
    const files = relevant
      .flatMap(s => [s.path, `${s.path}-wal`])
      .map(path => {
        try {
          const stat = statSync(path)
          return path.endsWith('-wal') && stat.size === 0
            ? [path, null]
            : [path, stat.size, stat.mtimeMs, stat.ctimeMs]
        } catch {
          return [path, null]
        }
      })
    return createHash('sha256').update(JSON.stringify(files)).digest('hex')
  }
  validateGroup(kind: string, group: string) {
    this.selected(kind)
    if (kind === 'META') {
      if (
        !this.names(this.shards.find(s => s.binding === 'DB_META')!.db).includes(group)
      )
        throw new Error('Unknown group')
    } else if (group !== SHARED_GROUP) {
      const meta = this.shards.find(s => s.binding === 'DB_META')!.db
      if (
        !meta
          .query(
            `SELECT 1 FROM ${kind === 'SOURCE' ? 'resourceReleases' : 'snapshotLineages'} WHERE id=?`,
          )
          .get(group)
      )
        throw new Error('Unknown group')
    }
  }
  catalogue(kind: string) {
    const selected = this.selected(kind)
    const meta = this.shards.find(s => s.binding === 'DB_META')!.db
    let groups =
      kind === 'META'
        ? this.names(meta).map(id => ({ id, label: id }))
        : meta
            .query<{ id: string; label: string }, []>(
              `SELECT id, code AS label FROM ${kind === 'SOURCE' ? 'resourceReleases' : 'snapshotLineages'} ORDER BY code`,
            )
            .all()
    if (kind !== 'META') {
      const available = new Set<string>()
      const snapshots = new Map(
        meta
          .query<{ id: string; snapshotLineageId: string }, []>(
            'SELECT id,snapshotLineageId FROM snapshots',
          )
          .all()
          .map(s => [s.id, s.snapshotLineageId]),
      )
      let shared = false
      for (const { db } of selected) {
        const names = this.names(db)
        const graph = this.edges(db, names)
        for (const name of names) {
          const columns = new Set(this.columns(db, name).map(c => c.name))
          const key =
            kind === 'SOURCE'
              ? 'resourceReleaseId'
              : columns.has('scopeId')
                ? 'scopeId'
                : columns.has('snapshotLineageId')
                  ? 'snapshotLineageId'
                  : 'snapshotId'
          if (columns.has(key)) {
            for (const row of db
              .query(`SELECT DISTINCT ${q(key)} AS value FROM ${q(name)}`)
              .all() as Array<{ value: string }>) {
              if (key === 'snapshotId') {
                const lineage = snapshots.get(row.value)
                if (lineage) available.add(lineage)
              } else if (key === 'scopeId') {
                try {
                  const value = JSON.parse(row.value)
                  available.add(Array.isArray(value) ? value[0] : row.value)
                } catch {
                  available.add(row.value)
                }
              } else available.add(row.value)
            }
          } else if (
            kind === 'CURRENT' &&
            name === 'statsRecords' &&
            columns.has('sourceReleaseId')
          ) {
            for (const row of db
              .query(
                `SELECT DISTINCT s.snapshotLineageId AS value FROM ${q(name)} r JOIN review_meta.resourceReleases rr ON rr.sourceReleaseId=r.sourceReleaseId JOIN review_meta.snapshotResourceReleases sr ON sr.resourceReleaseId=rr.id JOIN review_meta.snapshots s ON s.id=sr.snapshotId`,
              )
              .all() as Array<{ value: string }>)
              available.add(row.value)
          }
          if (
            !shared &&
            !this.filter(db, name, kind, graph).sql.includes('?1') &&
            db.query(`SELECT 1 FROM ${q(name)} LIMIT 1`).get()
          )
            shared = true
        }
      }
      groups = groups.filter(g => available.has(g.id))
      if (shared)
        groups.push({
          id: SHARED_GROUP,
          label: 'Shared supporting and operational tables',
        })
    }
    return {
      groups,
      revision: this.revision(kind),
      shards: selected.map(s => s.binding),
      missing: this.missing.filter(s => s.startsWith(`DB_${kind}`)),
    }
  }
  // SQL subqueries keep group membership in SQLite, with one bound parameter.
  direct(db: Database, table: string, kind: string, alias: string): string | null {
    const columns = new Set(this.columns(db, table).map(c => c.name))
    const col = (name: string) => `${alias}.${q(name)}`
    if (kind === 'SOURCE' && columns.has('resourceReleaseId'))
      return `${col('resourceReleaseId')} = ?1`
    if (
      kind === 'CURRENT' &&
      table === 'statsRecords' &&
      columns.has('sourceReleaseId')
    ) {
      return `${col('sourceReleaseId')} IN (SELECT rr.sourceReleaseId FROM review_meta.resourceReleases rr JOIN review_meta.snapshotResourceReleases sr ON sr.resourceReleaseId = rr.id JOIN review_meta.snapshots s ON s.id = sr.snapshotId WHERE s.snapshotLineageId = ?1)`
    }
    if (
      kind === 'CURRENT' &&
      [
        'statsFields',
        'statsFieldsI18n',
        'statsMeasures',
        'statsMeasuresI18n',
        'statsValuesI18n',
      ].includes(table) &&
      columns.has('datasetCode') &&
      this.names(db).includes('statsRecords')
    ) {
      const records = this.direct(db, 'statsRecords', kind, 'records')
      if (records)
        return `${col('datasetCode')} IN (SELECT DISTINCT records.datasetCode FROM statsRecords records WHERE ${records})`
    }
    if (kind === 'CURRENT' && table === 'divisionGeographicCrosswalks') {
      const snapshotColumns = [
        'geographicSnapshotId',
        'geographicAreaSnapshotId',
        'sourceSnapshotId',
        'sourceAreaSnapshotId',
      ].filter(c => columns.has(c))
      if (snapshotColumns.length)
        return `(${snapshotColumns.map(c => `${col(c)} IN (SELECT id FROM review_meta.snapshots WHERE snapshotLineageId = ?1)`).join(' OR ')})`
    }
    if ((kind === 'CURRENT' || kind === 'HISTORY') && columns.has('snapshotLineageId'))
      return `${col('snapshotLineageId')} = ?1`
    if ((kind === 'CURRENT' || kind === 'HISTORY') && columns.has('scopeId')) {
      // Cohort and retained-history scopes are JSON arrays beginning with lineage ID.
      return `(${col('scopeId')} = ?1 OR CASE WHEN json_valid(${col('scopeId')}) THEN json_extract(${col('scopeId')}, '$[0]') = ?1 ELSE 0 END)`
    }
    if ((kind === 'CURRENT' || kind === 'HISTORY') && columns.has('snapshotId'))
      return `${col('snapshotId')} IN (SELECT id FROM review_meta.snapshots WHERE snapshotLineageId = ?1)`
    return null
  }
  edges(db: Database, names: string[]) {
    const graph = new Map<string, Edge[]>(names.map(name => [name, []]))
    for (const name of names) {
      const fks = db.query<ForeignKey, []>(`PRAGMA foreign_key_list(${q(name)})`).all()
      for (const id of new Set(fks.map(f => f.id))) {
        const keys = fks.filter(f => f.id === id).sort((a, b) => a.seq - b.seq)
        const target = keys[0].table
        if (!graph.has(target)) continue
        const targetPk = this.columns(db, target)
          .filter(c => c.pk)
          .sort((a, b) => a.pk - b.pk)
        const pairs: [string, string][] = keys.map((f, i) => [
          f.from,
          f.to || targetPk[i]?.name,
        ])
        if (pairs.some(pair => !pair[1])) continue
        graph.get(name)!.push({ target, pairs })
        graph.get(target)!.push({ target: name, pairs: pairs.map(([a, b]) => [b, a]) })
      }
    }
    // Content-addressed definition references are logical joins without SQL FKs.
    for (const [parent, child, column] of [
      ['statsDefinitionSets', 'statsRecords', 'definitionSetId'],
      ['placeDivisionDefinitions', 'places', 'divisionDefinitionSetId'],
    ]) {
      if (
        graph.has(parent) &&
        graph.has(child) &&
        this.columns(db, child).some(c => c.name === column)
      ) {
        graph.get(parent)!.push({ target: child, pairs: [['id', column]] })
      }
    }
    return graph
  }
  filter(db: Database, table: string, kind: string, graph: Map<string, Edge[]>) {
    const direct = this.direct(db, table, kind, 'r')
    if (direct)
      return {
        sql: direct,
        relation:
          kind === 'CURRENT' &&
          [
            'statsFields',
            'statsFieldsI18n',
            'statsMeasures',
            'statsMeasuresI18n',
            'statsValuesI18n',
          ].includes(table)
            ? 'Dataset support (all stored versions)'
            : 'Group key',
      }
    // Find the shortest declared FK path to a group-owned table. Stop at that
    // table rather than traversing another group through a shared dictionary.
    const queue: Array<{ table: string; path: Edge[]; seen: string[] }> = [
      { table, path: [], seen: [table] },
    ]
    while (queue.length) {
      const item = queue.shift()!
      if (item.path.length >= 4) continue
      for (const edge of graph.get(item.table) ?? []) {
        if (item.seen.includes(edge.target)) continue
        const path = [...item.path, edge]
        const clause = this.direct(db, edge.target, kind, `p${path.length}`)
        if (clause) {
          let sql = clause
          for (let i = path.length - 1; i >= 0; i--) {
            const from = i === 0 ? 'r' : `p${i}`
            const to = `p${i + 1}`
            const join = path[i].pairs
              .map(([a, b]) => `${from}.${q(a)} = ${to}.${q(b)}`)
              .join(' AND ')
            sql = `EXISTS (SELECT 1 FROM ${q(path[i].target)} ${to} WHERE ${join} AND (${sql}))`
          }
          return {
            sql,
            relation: `Reference path: ${[table, ...path.map(p => p.target)].join(' → ')}`,
          }
        }
        queue.push({ table: edge.target, path, seen: [...item.seen, edge.target] })
      }
    }
    return { sql: '1', relation: 'Shared / unscoped — no declared group relationship' }
  }
  tables(kind: string, group: string) {
    this.validateGroup(kind, group)
    if (kind === 'META')
      return [{ name: group, relation: 'Whole table', shards: ['DB_META'] }]
    const tables = new Map<
      string,
      { name: string; relation: string; shards: string[] }
    >()
    for (const { db, binding } of this.selected(kind)) {
      const names = this.names(db)
      const graph = this.edges(db, names)
      for (const name of names) {
        const filter = this.filter(db, name, kind, graph)
        const scoped = filter.sql.includes('?1')
        if ((group === SHARED_GROUP) === scoped) continue
        if (
          !db
            .query(`SELECT 1 FROM ${q(name)} r WHERE ${filter.sql} LIMIT 1`)
            .get(...(scoped ? [group] : []))
        )
          continue
        const entry = tables.get(name) ?? {
          name,
          relation: filter.relation,
          shards: [],
        }
        entry.shards.push(binding)
        tables.set(name, entry)
      }
    }
    const meta = this.shards.find(s => s.binding === 'DB_META')!.db
    const groupTable = kind === 'SOURCE' ? 'resourceReleases' : 'snapshotLineages'
    const resource = this.columns(meta, groupTable).some(c => c.name === 'resourceType')
      ? meta
          .query<{ resourceType: string }, [string]>(
            `SELECT resourceType FROM ${groupTable} WHERE id=?`,
          )
          .get(group)?.resourceType
      : undefined
    const primary: Record<string, string> = {
      address: 'address2d',
      division: 'divisions',
      divisionArea: 'divisionAreas',
      divisionBoundary: 'divisionBoundaries',
      place: 'places',
      street: 'streets',
      divisionStatistic: 'statsRecords',
      statistic: 'statsRecords',
    }
    const rank = (item: { name: string; relation: string }) =>
      item.name === primary[resource ?? '']
        ? 0
        : item.relation === 'Group key'
          ? 1
          : item.relation.startsWith('Reference path:')
            ? 2
            : 3
    return [...tables.values()].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    )
  }

  subsetExpression(db: Database, table: string, kind: string, column: string) {
    // API membership rows share one shape; their routing values do not
    // define distinct review cases. Review these rows together across variants.
    if (
      kind === 'META' &&
      ['apiCompositionMembers', 'apiReleaseSetSnapshots'].includes(table)
    )
      throw new Error('Unsupported subset')
    if (
      column === 'cohortKey' &&
      kind === 'HISTORY' &&
      this.columns(db, table).some(c => c.name === 'snapshotId')
    )
      return '(SELECT cohortKey FROM review_meta.snapshots WHERE id=r.snapshotId)'
    const allowed = [
      'scopeId',
      'operation',
      'locale',
      'isCurrent',
      'variant',
      'resourceType',
      'transform',
      'referencePeriodCode',
      'basicCategory',
      'granularity',
    ]
    if (
      !allowed.includes(column) ||
      !this.columns(db, table).some(c => c.name === column)
    )
      throw new Error('Unsupported subset')
    return `r.${q(column)}`
  }
  subsetFilter(db: Database, table: string, kind: string, subset: string) {
    if (!subset) return { sql: '1', params: [] as Array<string | number | null> }
    const parsed: unknown = JSON.parse(subset)
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      !(
        parsed[1] === null ||
        typeof parsed[1] === 'string' ||
        typeof parsed[1] === 'number'
      )
    )
      throw new Error('Invalid subset')
    return {
      sql: `${this.subsetExpression(db, table, kind, parsed[0])} IS ?2`,
      params: [parsed[1]] as Array<string | number | null>,
    }
  }
  subsets(kind: string, group: string, table: string) {
    this.validateGroup(kind, group)
    const values = new Map<
      string,
      { id: string; label: string; dimension: string; count: number }
    >()
    const dimensions = [
      'scopeId',
      'cohortKey',
      'operation',
      'locale',
      'isCurrent',
      'variant',
      'resourceType',
      'transform',
      'referencePeriodCode',
      'basicCategory',
      'granularity',
    ]
    for (const { db } of this.selected(kind)) {
      const names = this.names(db)
      if (!names.includes(table)) continue
      const filter =
        kind === 'META'
          ? { sql: '1' }
          : this.filter(db, table, kind, this.edges(db, names))
      const scoped = filter.sql.includes('?1')
      if (kind !== 'META' && (group === SHARED_GROUP) === scoped) continue
      for (const dimension of dimensions) {
        let expression: string
        try {
          expression = this.subsetExpression(db, table, kind, dimension)
        } catch {
          continue
        }
        const rows = db
          .query(
            `SELECT ${expression} AS value,COUNT(*) AS count FROM ${q(table)} r WHERE ${filter.sql} GROUP BY ${expression} LIMIT 101`,
          )
          .all(...(scoped ? [group] : [])) as Array<{
          value: string | number | null
          count: number
        }>
        if (rows.length > 100) continue
        for (const row of rows) {
          const id = JSON.stringify([dimension, row.value])
          const entry = values.get(id) ?? {
            id,
            label: `${dimension}: ${row.value ?? 'NULL'}`,
            dimension,
            count: 0,
          }
          if (dimension === 'scopeId' && typeof row.value === 'string') {
            try {
              const scope = JSON.parse(row.value)
              if (Array.isArray(scope))
                entry.label =
                  scope[1] === 'snapshot'
                    ? `Retained snapshot: ${scope[2]}`
                    : `Cohort: ${scope[1]}`
            } catch {
              entry.label = 'Current lineage scope'
            }
          }
          entry.count += row.count
          values.set(id, entry)
        }
      }
    }
    // A single value adds no coverage; do not duplicate the all-rows view.
    return [...values.values()]
      .filter(
        v =>
          [...values.values()].filter(other => other.dimension === v.dimension).length >
          1,
      )
      .sort((a, b) => a.label.localeCompare(b.label))
  }
  inspect(
    kind: string,
    group: string,
    table: string,
    summary: boolean,
    limit = 8,
    subset = '',
  ) {
    const selected = this.selected(kind)
    this.validateGroup(kind, group)
    const revision = this.revision(kind)
    if (kind === 'META' && table !== group)
      throw new Error('META group must match table')
    const sources = selected.filter(s => this.names(s.db).includes(table))
    if (!sources.length) throw new Error('Unknown table')
    const content = createHash('sha256').update(
      JSON.stringify([kind, group, table, subset]),
    )
    const rows: Array<{ shard: string; record: Row }> = []
    const schemas: Array<{ binding: string; columns: Column[] }> = []
    const columns = new Map<string, Column & { nulls: number; rows: number }>()
    const shards: Array<{ binding: string; count?: number; relation: string }> = []
    for (const { db, binding } of [...sources].sort((a, b) =>
      a.binding.localeCompare(b.binding),
    )) {
      const schema = this.columns(db, table)
      const filter =
        kind === 'META'
          ? { sql: '1', relation: 'Whole table' }
          : this.filter(db, table, kind, this.edges(db, this.names(db)))
      const scoped = filter.sql.includes('?1')
      if (kind !== 'META' && (group === SHARED_GROUP) === scoped) continue
      if (subset) {
        const column = (JSON.parse(subset) as unknown[])[0]
        if (
          typeof column === 'string' &&
          column !== 'cohortKey' &&
          !schema.some(c => c.name === column)
        ) {
          // Validate the subset against another shard before excluding this one.
          const supporting = sources.find(s =>
            this.columns(s.db, table).some(c => c.name === column),
          )
          if (!supporting) throw new Error('Unsupported subset')
          this.subsetFilter(supporting.db, table, kind, subset)
          continue
        }
      }
      schemas.push({ binding, columns: schema })
      const slice = this.subsetFilter(db, table, kind, subset)
      // Reserve ?1 for the group even for whole-table subsets.
      const params: Array<string | number | null> = slice.params.length
        ? [scoped ? group : null, ...slice.params]
        : scoped
          ? [group]
          : []
      const where = `FROM ${q(table)} r WHERE (${filter.sql}) AND (${slice.sql})`
      // Hash every matching raw row, including duplicates, independently of samples.
      // Stable SQL ordering removes insertion/physical row order from the fingerprint.
      content.update(JSON.stringify([binding, schema]))
      const contentOrder = schema
        .flatMap(c => [`r.${q(c.name)} COLLATE BINARY`, `typeof(r.${q(c.name)})`])
        .join(', ')
      const contentRows = db.query(`SELECT r.* ${where} ORDER BY ${contentOrder}`)
      // Bun 1.4 supports statement-level integer precision; bundled types lag it.
      ;(
        contentRows as typeof contentRows & { safeIntegers(enabled: boolean): unknown }
      ).safeIntegers(true)
      for (const row of contentRows.iterate(...params)) {
        content.update(
          JSON.stringify(row, (_, value) =>
            typeof value === 'bigint'
              ? { integer: value.toString() }
              : value instanceof Uint8Array
                ? { blob: Buffer.from(value).toString('hex') }
                : value,
          ),
        )
        content.update('\n')
      }
      if (summary) {
        const aggregates = schema
          .map((c, i) => `SUM(r.${q(c.name)} IS NULL) AS ${q(`n${i}`)}`)
          .join(', ')
        const result = db
          .query(`SELECT COUNT(*) AS total, ${aggregates} ${where}`)
          .get(...params) as Row
        const count = Number(result.total)
        shards.push({ binding, count, relation: filter.relation })
        schema.forEach((c, i) => {
          const previous = columns.get(c.name) ?? { ...c, nulls: 0, rows: 0 }
          previous.nulls += Number(result[`n${i}`] ?? 0)
          previous.rows += count
          columns.set(c.name, previous)
        })
      } else {
        shards.push({ binding, relation: filter.relation })
        // Random rowid probes avoid sorting entire large tables. Fallback handles
        // sparse/group-filtered and WITHOUT ROWID tables with bounded candidates.
        const primary = schema.filter(c => c.pk).sort((a, b) => a.pk - b.pk)
        const order =
          primary.map(c => `r.${q(c.name)}`).join(', ') ||
          schema.map(c => `r.${q(c.name)}`).join(', ')
        const candidates: Row[] = []
        const seen = new Set<string>()
        const add = (values: Row[]) => {
          for (const row of values) {
            const key = JSON.stringify(row, (_, value) =>
              typeof value === 'bigint' ? String(value) : value,
            )
            if (!seen.has(key)) {
              seen.add(key)
              candidates.push(row)
            }
          }
        }
        const definition =
          db
            .query<{ sql: string }, [string]>(
              'SELECT sql FROM sqlite_schema WHERE name=?',
            )
            .get(table)?.sql ?? ''
        if (
          !/WITHOUT ROWID/i.test(definition) &&
          !schema.some(c => c.name === 'rowid')
        ) {
          const range = db
            .query(`SELECT min(rowid) AS lo, max(rowid) AS hi FROM ${q(table)}`)
            .get() as { lo: number; hi: number }
          if (range.hi != null)
            for (let i = 0; i < limit * 3 && candidates.length < limit; i++) {
              const pivot = Math.floor(
                range.lo + Math.random() * (range.hi - range.lo + 1),
              )
              add(
                db
                  .query(
                    `SELECT r.* ${where} AND r.rowid >= ${pivot} ORDER BY r.rowid LIMIT 1`,
                  )
                  .all(...params) as Row[],
              )
            }
        }
        if (candidates.length < limit)
          add(
            db
              .query(
                `SELECT r.* ${where} ORDER BY ${order} ${Math.random() < 0.5 ? 'ASC' : 'DESC'} LIMIT ${limit}`,
              )
              .all(...params) as Row[],
          )
        for (const record of candidates.slice(0, limit))
          rows.push({ shard: binding, record: decode(record) })
      }
    }
    // Round-robin across physical shards; never let the first shard fill the view.
    const samples: typeof rows = []
    const queues = sources.map(s => rows.filter(r => r.shard === s.binding))
    while (samples.length < limit && queues.some(q => q.length))
      for (const queue of queues) {
        if (samples.length >= limit) break
        const row = queue.shift()
        if (row) samples.push(row)
      }
    return {
      table,
      subset,
      revision,
      contentRevision: `contents-v1:${content.digest('hex')}`,
      stable: revision === this.revision(kind),
      samples,
      shards,
      schemas,
      columns: [...columns.values()],
      summary,
    }
  }
}

export function decode(record: Row): Row {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (value instanceof Uint8Array)
        return [
          key,
          {
            type: 'blob',
            bytes: value.byteLength,
            hex: Buffer.from(value).toString('hex'),
          },
        ]
      if (typeof value === 'bigint') return [key, value.toString()]
      if (typeof value === 'string' && /^[[{]/.test(value.trim())) {
        try {
          return [key, JSON.parse(value)]
        } catch {
          /* Keep malformed JSON visible. */
        }
      }
      return [key, value]
    }),
  )
}
