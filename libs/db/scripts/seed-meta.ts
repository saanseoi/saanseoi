import {
  initialApiEndpoints,
  initialApiReleaseSets,
  initialApiVersions,
  initialDataShards,
  initialDatasets,
  initialLicenses,
  initialPublisherI18n,
  initialPublishers,
} from '../src/seed'

const target = process.argv[2] ?? 'local'

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

function makeId(prefix: string, value: string) {
  return `${prefix}-${value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')}`
}

const nowSql = "cast(unixepoch('subsecond') * 1000 as integer)"
const databaseName = target === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'

const statements: string[] = []

for (const publisher of initialPublishers) {
  statements.push(
    `
INSERT OR IGNORE INTO publishers (
  id, code, url, contactUrl, parentPublisherId, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('publisher', publisher.code))},
  ${sqlString(publisher.code)},
  ${sqlNullable(publisher.url)},
  ${sqlNullable(publisher.contactUrl)},
  ${
    'parentCode' in publisher && publisher.parentCode
      ? `(SELECT id FROM publishers WHERE code = ${sqlString(publisher.parentCode)})`
      : 'NULL'
  },
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
  id, code, name, url, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('license', license.code))},
  ${sqlString(license.code)},
  ${sqlString(license.name)},
  ${sqlNullable(license.url)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const dataset of initialDatasets) {
  statements.push(
    `
INSERT OR IGNORE INTO datasets (
  id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, licenseId, attribution, category, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('dataset', `${dataset.publisherCode}-${dataset.code}`))},
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
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const apiVersion of initialApiVersions) {
  statements.push(
    `
INSERT OR IGNORE INTO apiVersions (
  id, code, status, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('api-version', apiVersion.code))},
  ${sqlString(apiVersion.code)},
  ${sqlString(apiVersion.status)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const endpoint of initialApiEndpoints) {
  statements.push(
    `
INSERT OR IGNORE INTO apiEndpoints (
  id, apiVersionId, method, path, operationId, resourceType, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('api-endpoint', endpoint.operationId))},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(endpoint.apiVersionCode)}),
  ${sqlString(endpoint.method)},
  ${sqlString(endpoint.path)},
  ${sqlString(endpoint.operationId)},
  ${sqlString(endpoint.resourceType)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )

  for (const dataset of endpoint.datasets) {
    statements.push(
      `
INSERT OR IGNORE INTO apiEndpointDatasets (
  apiEndpointId, datasetId, usageType, required, createdAt
) VALUES (
  (SELECT id FROM apiEndpoints WHERE operationId = ${sqlString(endpoint.operationId)}),
  (
    SELECT d.id
    FROM datasets d
    JOIN publishers p ON p.id = d.publisherId
    WHERE p.code = ${sqlString(dataset.publisherCode)} AND d.code = ${sqlString(dataset.datasetCode)}
  ),
  ${sqlString(dataset.usageType)},
  ${dataset.required ? '1' : '0'},
  ${nowSql}
);`.trim(),
    )
  }
}

for (const releaseSet of initialApiReleaseSets) {
  statements.push(
    `
INSERT OR IGNORE INTO apiReleaseSets (
  id, apiVersionId, code, canonicalSchemaVersion, canonicalLogicVersion, status, notes, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('api-release-set', releaseSet.code))},
  (SELECT id FROM apiVersions WHERE code = ${sqlString(releaseSet.apiVersionCode)}),
  ${sqlString(releaseSet.code)},
  ${sqlString(releaseSet.canonicalSchemaVersion)},
  ${sqlString(releaseSet.canonicalLogicVersion)},
  ${sqlString(releaseSet.status)},
  ${sqlString(releaseSet.notes)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

for (const shard of initialDataShards) {
  statements.push(
    `
INSERT OR IGNORE INTO dataShards (
  id, kind, regionCode, year, environment, databaseName, databaseId, bindingName, status, createdAt, updatedAt
) VALUES (
  ${sqlString(makeId('data-shard', `${shard.environment}-${shard.bindingName}`))},
  ${sqlString(shard.kind)},
  ${sqlNullable(shard.regionCode)},
  ${sqlNullable(shard.year)},
  ${sqlString(shard.environment)},
  ${sqlString(shard.databaseName)},
  ${sqlString(shard.databaseId)},
  ${sqlString(shard.bindingName)},
  ${sqlString(shard.status)},
  ${nowSql},
  ${nowSql}
);`.trim(),
  )
}

const sql = ['PRAGMA foreign_keys = ON;', ...statements].join('\n\n')

const proc = Bun.spawnSync({
  cmd: [
    'bash',
    new URL('./run-d1-execute.sh', scriptDir).pathname,
    databaseName,
    '--config',
    new URL('../../../apps/harbour-api/wrangler.jsonc', scriptDir).pathname,
    '--env',
    target === 'production' ? 'production' : 'preview',
    ...(target === 'local'
      ? [
          '--local',
          '--persist-to',
          new URL('../../../.local/d1/dev', scriptDir).pathname,
        ]
      : []),
    '--command',
    sql,
  ],
  cwd: new URL('..', scriptDir).pathname,
  stdout: 'inherit',
  stderr: 'inherit',
})

process.exit(proc.exitCode ?? 1)
