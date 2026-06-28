import {
  initialApiEndpoints,
  initialApiVersions,
  initialDatasetI18n,
  initialDatasets,
  initialLicenses,
  initialPublisherI18n,
  initialPublishers,
  resolveInitialDataShardsForEnvironment,
} from '../src/seed'

const target = process.argv[2] ?? 'local'
const requiredTables = [
  'publishers',
  'publisherI18n',
  'licenses',
  'datasets',
  'datasetI18n',
  'apiVersions',
  'apiEndpoints',
  'dataShards',
] as const

if (!['local', 'preview', 'production'].includes(target)) {
  console.error(`Unsupported seed target: ${target}`)
  console.error('Usage: bun ./scripts/seed-meta.ts [local|preview|production]')
  process.exit(1)
}

const scriptDir = new URL('.', import.meta.url)

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function sqlNullable(value: string | undefined) {
  return value == null ? 'NULL' : sqlString(value)
}

function sqlTimestampMs(value: string) {
  return `cast(unixepoch(${sqlString(value)}, 'subsecond') * 1000 as integer)`
}

const sqlUuid =
  "lower(hex(randomblob(4))) || '-' || " +
  "lower(hex(randomblob(2))) || '-' || " +
  "'4' || substr(lower(hex(randomblob(2))), 2) || '-' || " +
  "substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || " +
  'lower(hex(randomblob(6)))'

const nowSql = "cast(unixepoch('subsecond') * 1000 as integer)"
const databaseName = target === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
const dataShardEnvironment = target === 'production' ? 'production' : 'preview'
const wranglerConfigPath = new URL(
  '../../../apps/harbour-api/wrangler.jsonc',
  scriptDir,
)
const persistPath = new URL('../../../.local/d1/dev', scriptDir)

function buildWranglerSeedTargetArgs() {
  return [
    '--config',
    wranglerConfigPath.pathname,
    '--env',
    target === 'production' ? 'production' : 'preview',
    ...(target === 'local'
      ? ['--local', '--persist-to', persistPath.pathname]
      : ['--remote']),
  ]
}

function parseWranglerExecuteJson(raw: string) {
  const payload = JSON.parse(raw) as
    | Array<{
        results?: Array<Record<string, unknown>>
        success?: boolean
        error?: string
      }>
    | {
        results?: Array<Record<string, unknown>>
        success?: boolean
        error?: string
      }
  const first = Array.isArray(payload) ? payload[0] : payload

  if (first?.error) {
    const errorText =
      typeof first.error === 'string' ? first.error : JSON.stringify(first.error)
    throw new Error(`Wrangler D1 execute failed: ${errorText}`)
  }

  const result = first as
    | {
        results?: Array<Record<string, unknown>>
        success?: boolean
      }
    | undefined

  if (!result || result.success === false) {
    throw new Error(`Unexpected wrangler d1 execute response: ${raw}`)
  }

  return Array.isArray(result.results) ? result.results : []
}

function buildMissingTablesMessage(missingTables: string[]) {
  const tableList = missingTables.join(', ')

  if (target === 'preview' || target === 'local') {
    const resetCommand =
      target === 'preview'
        ? 'bun run db:reset:preview:meta'
        : 'bun run --filter @repo/db db:reset:local:meta'

    return [
      `Meta schema preflight failed for ${target}: missing required tables ${tableList}.`,
      'This database appears to have stale migration state: Wrangler reported no pending migrations, but the seed expects the current meta schema.',
      `Reset and reapply the meta schema with \`${resetCommand}\`, then rerun the seed command.`,
    ].join(' ')
  }

  return [
    `Meta schema preflight failed for production: missing required tables ${tableList}.`,
    'Do not continue seeding production until the migration ledger and live schema are reconciled.',
  ].join(' ')
}

function assertMetaSchemaReady() {
  const query = [
    'SELECT name',
    'FROM sqlite_master',
    "WHERE type = 'table'",
    `AND name IN (${requiredTables.map(sqlString).join(', ')})`,
    'ORDER BY name;',
  ].join(' ')
  const proc = Bun.spawnSync({
    cmd: [
      'bun',
      'x',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      ...buildWranglerSeedTargetArgs(),
      '--json',
      '--command',
      query,
    ],
    cwd: new URL('..', scriptDir).pathname,
    stdout: 'pipe',
    stderr: 'inherit',
  })

  if (proc.exitCode !== 0) {
    process.exit(proc.exitCode ?? 1)
  }

  const rows = parseWranglerExecuteJson(new TextDecoder().decode(proc.stdout))
  const existing = new Set(
    rows
      .map(row => (typeof row.name === 'string' ? row.name : null))
      .filter((row): row is string => row !== null),
  )
  const missing = requiredTables.filter(table => !existing.has(table))

  if (missing.length > 0) {
    throw new Error(buildMissingTablesMessage([...missing]))
  }
}

const statements: string[] = []

assertMetaSchemaReady()

for (const publisher of initialPublishers) {
  statements.push(
    `
INSERT OR IGNORE INTO publishers (
  id, code, url, contactUrl, parentPublisherId, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  ${sqlString(publisher.code)},
  ${sqlNullable(publisher.url)},
  ${sqlNullable(publisher.contactUrl)},
  ${
    'parentCode' in publisher && publisher.parentCode
      ? `(SELECT id FROM publishers WHERE code = ${sqlString(publisher.parentCode)})`
      : 'NULL'
  },
  ${sqlString(publisher.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const translation of initialPublisherI18n) {
  statements.push(
    `
INSERT OR IGNORE INTO publisherI18n (
  publisherId, locale, name, description, createdAt, updatedAt
) VALUES (
  (SELECT id FROM publishers WHERE code = ${sqlString(translation.publisherCode)}),
  ${sqlString(translation.locale)},
  ${sqlString(translation.name)},
  ${sqlNullable(translation.description)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const license of initialLicenses) {
  statements.push(
    `
INSERT OR IGNORE INTO licenses (
  id, code, name, url, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  ${sqlString(license.code)},
  ${sqlString(license.name)},
  ${sqlNullable(license.url)},
  ${sqlString(license.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const dataset of initialDatasets) {
  statements.push(
    `
INSERT OR IGNORE INTO datasets (
  id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, licenseId, attribution, category, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  (SELECT id FROM publishers WHERE code = ${sqlString(dataset.publisherCode)}),
  ${sqlString(dataset.code)},
  ${sqlString(dataset.regionCode)},
  ${sqlString(dataset.releaseType)},
  ${sqlString(dataset.releaseFrequency)},
  ${sqlString(dataset.theme)},
  ${sqlString(dataset.type)},
  ${sqlString(dataset.sourceUrl)},
  (SELECT id FROM licenses WHERE code = ${sqlString(dataset.licenseCode)}),
  ${sqlNullable(dataset.attribution)},
  ${sqlNullable(dataset.category)},
  ${sqlString(dataset.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const translation of initialDatasetI18n) {
  statements.push(
    `
INSERT OR IGNORE INTO datasetI18n (
  datasetId, locale, name, description, createdAt, updatedAt
) VALUES (
  (
    SELECT d.id
    FROM datasets d
    JOIN publishers p ON p.id = d.publisherId
    WHERE p.code = ${sqlString(translation.publisherCode)} AND d.code = ${sqlString(translation.datasetCode)}
  ),
  ${sqlString(translation.locale)},
  ${sqlString(translation.name)},
  ${sqlNullable(translation.description)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const apiVersion of initialApiVersions) {
  statements.push(
    `
INSERT OR IGNORE INTO apiVersions (
  id, code, familyType, version, status, publishedAt, deprecatedAt, retiredAt, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  ${sqlString(apiVersion.code)},
  ${sqlString(apiVersion.familyType)},
  ${sqlString(apiVersion.version)},
  ${sqlString(apiVersion.status)},
  ${apiVersion.publishedAt ? sqlTimestampMs(apiVersion.publishedAt) : 'NULL'},
  ${apiVersion.deprecatedAt ? sqlTimestampMs(apiVersion.deprecatedAt) : 'NULL'},
  ${apiVersion.retiredAt ? sqlTimestampMs(apiVersion.retiredAt) : 'NULL'},
  ${sqlString(apiVersion.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const endpoint of initialApiEndpoints) {
  statements.push(
    `
INSERT OR IGNORE INTO apiEndpoints (
  id, apiVersionId, method, path, operationId, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(endpoint.apiVersion)}),
  ${sqlString(endpoint.method)},
  ${sqlString(endpoint.path)},
  ${sqlString(endpoint.operationId)},
  ${sqlString(endpoint.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const shard of resolveInitialDataShardsForEnvironment(dataShardEnvironment)) {
  statements.push(
    `
INSERT OR IGNORE INTO dataShards (
  id, shardType, regionCode, year, environment, databaseName, databaseId, bindingName, status, versionHash, createdAt, updatedAt
) VALUES (
  ${sqlUuid},
  ${sqlString(shard.shardType)},
  ${sqlNullable(shard.regionCode)},
  ${sqlNullable(shard.year)},
  ${sqlString(shard.environment)},
  ${sqlString(shard.databaseName)},
  ${sqlString(shard.databaseId)},
  ${sqlString(shard.bindingName)},
  ${sqlString(shard.status)},
  ${sqlString(shard.versionHash)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

const sql = ['PRAGMA foreign_keys = ON;', ...statements].join('\n\n')

const proc = Bun.spawnSync({
  cmd: [
    'bun',
    'x',
    'wrangler',
    'd1',
    'execute',
    databaseName,
    ...buildWranglerSeedTargetArgs(),
    '--json',
    '--command',
    sql,
  ],
  cwd: new URL('..', scriptDir).pathname,
  stdout: 'pipe',
  stderr: 'inherit',
})

if (proc.exitCode !== 0) {
  process.exit(proc.exitCode ?? 1)
}

const resultRows = parseWranglerExecuteJson(new TextDecoder().decode(proc.stdout))
console.log(`Meta seed succeeded. result_rows=${resultRows.length}`)

process.exit(0)
