import { createHash, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const databaseId = process.argv[2]
if (
  !databaseId ||
  !process.env.CLOUDFLARE_ACCOUNT_ID ||
  !process.env.CLOUDFLARE_API_TOKEN
)
  throw new Error('Provide a preview database ID and Cloudflare credentials')
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/d1/database/${databaseId}`
const headers = {
  Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
  'Content-Type': 'application/json',
}
const infoResponse = await fetch(endpoint, {
  headers,
  signal: AbortSignal.timeout(30_000),
})
const info = (await infoResponse.json()) as {
  success: boolean
  result?: { name?: string }
}
if (!info.success || info.result?.name !== 'ss-current-db-preview')
  throw new Error('Probe target must be the verified preview current database')
const table = `zzAddress3dProbe_${randomUUID().replaceAll('-', '')}`
const query = async (statements: Array<{ sql: string; params?: unknown[] }>) => {
  const response = await fetch(`${endpoint}/query`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ batch: statements }),
    signal: AbortSignal.timeout(30_000),
  })
  const data = (await response.json()) as {
    success: boolean
    result?: Array<{ success: boolean; results?: Record<string, unknown>[] }>
    errors?: unknown[]
  }
  if (!response.ok || !data.success || data.result?.some(result => !result.success))
    throw new Error(
      `Probe query failed ${response.status}: ${JSON.stringify(data.errors)}`,
    )
  return data.result?.flatMap(result => result.results ?? []) ?? []
}
const units = Array.from({ length: 1440 }, (_, i) => ({
  id: randomUUID(),
  unitRef: String(i).padStart(4, '0'),
  unitType: 'F',
  floorRef: String((i % 40) + 1),
  floorType: 'F',
  unitPortion: null,
}))
const payloads: Record<string, string> = {
  base: JSON.stringify(units),
  en: JSON.stringify(
    Object.fromEntries(
      units.map(unit => [
        unit.id,
        {
          unitExpression: `FLAT ${unit.unitRef}`,
          floorExpression: `${unit.floorRef}/F`,
        },
      ]),
    ),
  ),
  'zh-hant': JSON.stringify(
    Object.fromEntries(
      units.map(unit => [
        unit.id,
        { unitExpression: `${unit.unitRef}室`, floorExpression: `${unit.floorRef}樓` },
      ]),
    ),
  ),
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex')
let created = false
try {
  await query([
    { sql: `CREATE TABLE "${table}" (id TEXT PRIMARY KEY, payload TEXT NOT NULL)` },
  ])
  created = true
  const writes = Object.entries(payloads).map(([id, payload]) => ({
    sql: `INSERT INTO "${table}" (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`,
    params: [id, payload],
  }))
  await query(writes)
  await query(writes)
  const verify = async () => {
    const rows = await query([{ sql: `SELECT id,payload FROM "${table}"` }])
    if (
      rows.length !== 3 ||
      rows.some(
        row =>
          typeof row.id !== 'string' ||
          typeof row.payload !== 'string' ||
          hash(row.payload) !== hash(payloads[String(row.id)] ?? ''),
      )
    )
      throw new Error('D1 probe hash/row-count mismatch')
  }
  await verify()
  payloads.en = `${payloads.en}\n`
  await query([
    { sql: `UPDATE "${table}" SET payload=? WHERE id=?`, params: [payloads.en, 'en'] },
  ])
  await verify()
  const report = {
    database: info.result.name,
    verifiedAt: new Date().toISOString(),
    payloadBytes: Object.fromEntries(
      Object.entries(payloads).map(([key, value]) => [key, Buffer.byteLength(value)]),
    ),
    checks: [
      'three-statement bound INSERT batch',
      'idempotent retry',
      'exact UTF-8 hash readback',
      'bound UPDATE and readback',
    ],
    temporaryTable: table,
  }
  await writeFile(
    '.local/hkgov-dpo/address3d-d1-probe.json',
    JSON.stringify(report, null, 2),
  )
  console.info(JSON.stringify(report, null, 2))
} finally {
  if (created) {
    await query([{ sql: `DROP TABLE "${table}"` }])
    console.info(`Removed temporary probe table ${table}`)
  }
}
