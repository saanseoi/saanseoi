import { Database } from 'bun:sqlite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Hash JSON arrays without assembling a release-sized serialised string. */
export function recordCacheKey(value: unknown) {
  const hash = createHash('sha256')
  const active = new Set<unknown[]>()
  const append = (item: unknown, key?: string) => {
    if (
      Array.isArray(item) &&
      typeof (item as unknown as { toJSON?: unknown }).toJSON !== 'function'
    ) {
      if (active.has(item)) throw new TypeError('Circular cache key')
      active.add(item)
      hash.update('[')
      for (let index = 0; index < item.length; index++) {
        if (index) hash.update(',')
        append(item[index], String(index))
      }
      hash.update(']')
      active.delete(item)
      return
    }
    if (key === undefined) {
      hash.update(JSON.stringify(item))
      return
    }
    // Preserve the array index passed to custom toJSON methods.
    const wrapped = JSON.stringify({ [key]: item })
    hash.update(
      wrapped === '{}' ? 'null' : wrapped.slice(JSON.stringify(key).length + 2, -1),
    )
  }
  append(value)
  return hash.digest('hex')
}

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
export function placeComputationSources(root: string) {
  const directory = resolve(root, 'apps/harbour-cli/src/lib/pipeline/places')
  return [
    ...readdirSync(directory)
      .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map(name => resolve(directory, name)),
    ...readdirSync(resolve(root, 'libs/address/src'))
      .filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map(name => resolve(root, 'libs/address/src', name)),
    ...[
      'libs/core/src/pipeline/services/places/place.ts',
      'libs/core/src/pipeline/services/places/placeIdentity.ts',
      'apps/harbour-cli/src/lib/pipeline/places/placeIdentityLedger.ts',
      'apps/harbour-cli/src/lib/pipeline/places/placeAddressIdentityContinuity.ts',
      'libs/core/src/pipeline/services/sources/recordContent.ts',
      'libs/core/src/pipeline/services/sources/sourceAttribution.ts',
      'libs/core/src/provenance/recordEvidence.ts',
      'fixtures/meta/sourceAttributions/overture.json',
      'libs/core/src/pipeline/utils.ts',
      'libs/db/src/address3d.ts',
      'bun.lock',
    ].map(name => resolve(root, name)),
    ...[
      'place-normalisation',
      'place-country-selection',
      'place-address-analysis',
      'place-identity',
    ].map(name =>
      resolve(root, `fixtures/meta/processing-rules/assembly/${name}.json`),
    ),
  ]
}

export function placeComputationContract(
  root = resolve(import.meta.dir, '../../../../../..'),
) {
  const hash = createHash('sha256')
  for (const file of placeComputationSources(root).sort())
    hash.update(file).update(readFileSync(file))
  return hash.digest('hex')
}
