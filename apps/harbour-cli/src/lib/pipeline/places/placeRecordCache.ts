import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const recordCacheKey = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Disposable, target-scoped local computations; never authoritative source data. */
export class PlaceRecordCache {
  private db: Database
  private pending = new Map<string, { value: string; checksum: string }>()
  readonly counts = new Map<string, { reused: number; computed: number }>()

  constructor(
    path: string,
    readonly contract = placeComputationContract(),
  ) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;')
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS computations (key TEXT PRIMARY KEY, value TEXT NOT NULL, checksum TEXT NOT NULL)',
    )
  }

  get<T>(stage: string, identity: string): T | undefined {
    const key = this.key(stage, identity)
    const row =
      this.pending.get(key) ??
      this.db
        .query<{ value: string; checksum: string }, [string]>(
          'SELECT value, checksum FROM computations WHERE key = ?',
        )
        .get(key)
    const counts = this.counts.get(stage) ?? { reused: 0, computed: 0 }
    this.counts.set(stage, counts)
    if (!row) {
      counts.computed++
      return undefined
    }
    if (recordCacheKey(row.value) !== row.checksum)
      throw new Error(`Place ${stage} record cache checksum differs.`)
    counts.reused++
    return JSON.parse(row.value) as T
  }

  set(stage: string, identity: string, result: unknown) {
    const value = JSON.stringify(result)
    this.pending.set(this.key(stage, identity), {
      value,
      checksum: recordCacheKey(value),
    })
    if (this.pending.size >= 256) this.flush()
  }

  flush() {
    if (!this.pending.size) return
    const insert = this.db.query('INSERT OR REPLACE INTO computations VALUES (?, ?, ?)')
    this.db.transaction(() => {
      for (const [key, row] of this.pending) insert.run(key, row.value, row.checksum)
    })()
    this.pending.clear()
  }

  close() {
    try {
      this.flush()
    } finally {
      this.db.close()
    }
  }

  private key(stage: string, identity: string) {
    return `${this.contract}:${stage}:${identity}`
  }
}

/** Include implementation and rule changes, including uncommitted local edits. */
export function placeComputationContract() {
  const root = resolve(import.meta.dir, '../../../../../..')
  const files = [
    ...readdirSync(import.meta.dir)
      .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map(name => resolve(import.meta.dir, name)),
    ...[
      'libs/core/src/pipeline/services/places/place.ts',
      'libs/core/src/pipeline/utils.ts',
      'libs/db/src/address3d.ts',
      'bun.lock',
    ].map(name => resolve(root, name)),
    ...['place-normalisation', 'place-country-selection', 'place-address-analysis'].map(
      name => resolve(root, `fixtures/meta/processing-rules/${name}.json`),
    ),
  ]
  const hash = createHash('sha256')
  for (const file of files.sort()) hash.update(file).update(readFileSync(file))
  return hash.digest('hex')
}
