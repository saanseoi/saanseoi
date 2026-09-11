import { Database } from 'bun:sqlite'
import { strict as assert } from 'node:assert'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { captureNetSqlitePlan } from '../apps/harbour-cli/src/lib/pipeline/local/netSqlitePlan.ts'

// Synthetic local compiler measurement. No application database or remote requests.
const count = Number(process.argv[2] ?? 100_000)
assert(Number.isSafeInteger(count) && count >= 100 && count <= 1_000_000)
const root = await mkdtemp(join(tmpdir(), 'current-delivery-benchmark-'))
const path = join(root, 'current.sqlite')
const db = new Database(path)
try {
  db.exec(`CREATE TABLE records(id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updatedAt TEXT NOT NULL);
    CREATE TABLE locales(recordId INTEGER NOT NULL REFERENCES records(id), locale TEXT NOT NULL, name TEXT NOT NULL,
      PRIMARY KEY(recordId,locale));`)
  const base = db.query('INSERT INTO records VALUES(?,?,?)')
  const locale = db.query('INSERT INTO locales VALUES(?,?,?)')
  db.transaction(() => {
    for (let id = 1; id <= count; id++) {
      base.run(id, JSON.stringify({ id, text: 'x'.repeat(240) }), 'original')
      locale.run(id, 'en', `Example Place ${id}`)
      locale.run(id, 'zh-Hant', `示例地點 ${id}`)
    }
  })()
  const reports = []
  for (const scenario of ['unchanged', 'one-percent-locale-edit'] as const) {
    let scratchDirectory = ''
    let scratchBytesAtEmission: number | null = null
    let emittedBytes = 0
    const started = performance.now()
    const result = await captureNetSqlitePlan({
      targets: {
        DB_CURRENT: {
          path,
          tables: [
            { name: 'records', ignoredColumns: ['updatedAt'] },
            { name: 'locales' },
          ],
        },
      },
      generate: async candidates => {
        const current = candidates.DB_CURRENT
        assert(current)
        scratchDirectory = dirname(current.path)
        current.db.exec("UPDATE records SET updatedAt='candidate-only'")
        if (scenario === 'one-percent-locale-edit')
          current.db.exec(
            "UPDATE locales SET name=name || ' revised' WHERE recordId % 100=0 AND locale='en'",
          )
      },
      append: async (_target, bytes) => {
        emittedBytes += bytes.byteLength
        if (scratchBytesAtEmission === null) {
          const files = await readdir(scratchDirectory)
          const sizes = await Promise.all(
            files.map(file => stat(join(scratchDirectory, file))),
          )
          scratchBytesAtEmission = sizes.reduce((sum, file) => sum + file.size, 0)
        }
      },
    })
    assert.equal(result.summary.tables.DB_CURRENT?.records?.updated, 0)
    assert.equal(
      result.summary.tables.DB_CURRENT?.locales?.updated,
      scenario === 'unchanged' ? 0 : Math.floor(count / 100),
    )
    assert.equal(
      db.query("SELECT count(*) AS n FROM locales WHERE name LIKE '% revised'").get()
        ?.n,
      0,
    )
    reports.push({
      scenario,
      elapsedMs: Math.round(performance.now() - started),
      sourceRows: count * 3,
      baselineBytes: (await stat(path)).size,
      scratchBytesAtEmission,
      emittedBytes,
      mutations: result.summary,
    })
  }
  const report = {
    count,
    runtime: Bun.version,
    reports,
    limitations:
      'Synthetic base/two-locale schema; excludes source decoding, dependency hydration, network, metadata and publication receipts. Scratch size is sampled at first emission, not a measured peak. No D1 billing or production throughput claim.',
  }
  const output = resolve('.cache/preparation-benchmarks/current-delivery.json')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output, ...report }, null, 2))
} finally {
  db.close()
  await rm(root, { recursive: true, force: true })
}
