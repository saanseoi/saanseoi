import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Database } from 'bun:sqlite'

const FIXTURE_TIMESTAMP_MS = 1718236800000

export function collectSqlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      return collectSqlFiles(entryPath)
    }

    return entry.name.endsWith('.sql') ? [entryPath] : []
  })
}

export function loadMigrationSql(dir: string) {
  return collectSqlFiles(dir)
    .sort()
    .map(filePath => readFileSync(filePath, 'utf8'))
    .join('\n')
}

export function seedFixtureCatalog(db: Database) {
  db.exec(`
    INSERT OR IGNORE INTO publishers (id, code, createdAt, updatedAt) VALUES
      ('publisher-overture', 'overture', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('publisher-hkgov', 'hkgov', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS});

    INSERT OR IGNORE INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, createdAt, updatedAt
    ) VALUES
      (
        'overture-hk-division',
        'publisher-overture',
        'hk-division',
        'hk',
        'static',
        'monthly',
        'divisions',
        'division',
        'https://docs.overturemaps.org/',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'overture-hk-address',
        'publisher-overture',
        'hk-address',
        'hk',
        'static',
        'monthly',
        'addresses',
        'address',
        'https://docs.overturemaps.org/schema/reference/addresses/address/',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'hkgov-hk-address',
        'publisher-hkgov',
        'hk-address',
        'hk',
        'static',
        'monthly',
        'addresses',
        'address',
        'https://data.gov.hk/en-data/dataset/hk-ogcio-st_div_01-als',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      );

    INSERT OR IGNORE INTO apiVersions (id, code, status, createdAt, updatedAt) VALUES
      (
        'api-version-ss-divisions-v0.1',
        'ss-divisions-v0.1',
        'draft',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-version-ss-addresses-v0.1',
        'ss-addresses-v0.1',
        'draft',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-version-ss-places-v0.1',
        'ss-places-v0.1',
        'draft',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      );

    INSERT OR IGNORE INTO apiReleaseSets (
      id,
      apiVersionId,
      code,
      canonicalSchemaVersion,
      canonicalLogicVersion,
      status,
      publishedAt,
      createdAt,
      updatedAt
    ) VALUES
      (
        'api-release-set-ss-divisions-v0.1',
        'api-version-ss-divisions-v0.1',
        'ss-divisions-v0.1-initial',
        '1',
        '1',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-release-set-ss-addresses-v0.1',
        'api-version-ss-addresses-v0.1',
        'ss-addresses-v0.1-initial',
        '1',
        '1',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-release-set-ss-places-v0.1',
        'api-version-ss-places-v0.1',
        'ss-places-v0.1-initial',
        '1',
        '1',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      );

    INSERT OR IGNORE INTO dataShards (
      id,
      kind,
      regionCode,
      year,
      environment,
      databaseName,
      databaseId,
      bindingName,
      status,
      createdAt,
      updatedAt
    ) VALUES
      (
        'data-shard-current-preview',
        'current',
        null,
        null,
        'preview',
        'fixture-current-preview',
        'fixture-current-preview',
        'DB_CURRENT',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-2025-preview',
        'history',
        'hk',
        '2025',
        'preview',
        'fixture-history-hk-2025-preview',
        'fixture-history-hk-2025-preview',
        'DB_HISTORY_HK_2025',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-2026-preview',
        'history',
        'hk',
        '2026',
        'preview',
        'fixture-history-hk-2026-preview',
        'fixture-history-hk-2026-preview',
        'DB_HISTORY_HK_2026',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-source-hk-2025-preview',
        'source',
        'hk',
        '2025',
        'preview',
        'fixture-source-hk-2025-preview',
        'fixture-source-hk-2025-preview',
        'DB_SOURCE_HK_2025',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-current-production',
        'current',
        null,
        null,
        'production',
        'fixture-current-production',
        'fixture-current-production',
        'DB_CURRENT_PRODUCTION',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-2025-production',
        'history',
        'hk',
        '2025',
        'production',
        'fixture-history-hk-2025-production',
        'fixture-history-hk-2025-production',
        'DB_HISTORY_HK_2025_PRODUCTION',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-2026-production',
        'history',
        'hk',
        '2026',
        'production',
        'fixture-history-hk-2026-production',
        'fixture-history-hk-2026-production',
        'DB_HISTORY_HK_2026_PRODUCTION',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-source-hk-2025-production',
        'source',
        'hk',
        '2025',
        'production',
        'fixture-source-hk-2025-production',
        'fixture-source-hk-2025-production',
        'DB_SOURCE_HK_2025_PRODUCTION',
        'active',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      );
  `)
}

type FixtureRelease = {
  source: string
  regionCode: string
  type: string
  theme?: string
  sourceVersion: string
  snapshotMonth: string
  rawObjectKey: string
  originalFileName: string
  status: string
  ingestedAt: string
  createdAt: string
  updatedAt: string
  releaseId?: string
  releaseCode?: string
  revokedAt?: string | null
  revocationReason?: string | null
  supersededByReleaseCode?: string | null
}

export function insertFixtureRelease(db: Database, release: FixtureRelease) {
  const publisherCode = release.source === 'hkgov-als' ? 'hkgov' : release.source
  const datasetCode = `${release.regionCode}-${release.type}`
  const releaseCode =
    release.releaseCode ??
    `${release.source}-${release.regionCode}-${release.sourceVersion}-${release.type}`
  const releaseId = release.releaseId ?? `release-${releaseCode}`
  const supersededByReleaseId = release.supersededByReleaseCode
    ? `release-${release.supersededByReleaseCode}`
    : null

  db.query(
    `
      INSERT INTO releases (
        id,
        datasetId,
        code,
        sourceVersion,
        snapshotMonth,
        rawObjectKey,
        originalFileName,
        status,
        revokedAt,
        revocationReason,
        supersededByReleaseId,
        ingestedAt,
        createdAt,
        updatedAt
      ) VALUES (
        ?1,
        (
          SELECT d.id
          FROM datasets d
          JOIN publishers p ON p.id = d.publisherId
          WHERE p.code = ?2 AND d.code = ?3
        ),
        ?4,
        ?5,
        ?6,
        ?7,
        ?8,
        ?9,
        ?10,
        ?11,
        ?12,
        ?13,
        ?14,
        ?15
      )
    `,
  ).run(
    releaseId,
    publisherCode,
    datasetCode,
    releaseCode,
    release.sourceVersion,
    release.snapshotMonth,
    release.rawObjectKey,
    release.originalFileName,
    release.status,
    release.revokedAt ? new Date(release.revokedAt).getTime() : null,
    release.revocationReason ?? null,
    supersededByReleaseId,
    new Date(release.ingestedAt).getTime(),
    new Date(release.createdAt).getTime(),
    new Date(release.updatedAt).getTime(),
  )

  return {
    datasetCode,
    releaseCode,
    releaseId,
  }
}
