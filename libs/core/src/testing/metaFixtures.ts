import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Database } from 'bun:sqlite'

import {
  buildDatasetCode,
  buildDatasetReleaseCode,
  publisherCodeForSource,
} from '../codes'
import type { ResourceType } from '../types'

const FIXTURE_TIMESTAMP_MS = 1718236800000

function hasColumn(db: Database, tableName: string, columnName: string) {
  const rows = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: string
  }>

  return rows.some(row => row.name === columnName)
}

function hasTable(db: Database, tableName: string) {
  const row = db
    .query(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?1 LIMIT 1",
    )
    .get(tableName)

  return Boolean(row)
}

function addColumnIfMissing(
  db: Database,
  tableName: string,
  columnName: string,
  columnSql: string,
) {
  if (hasColumn(db, tableName, columnName)) {
    return
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnSql};`)
}

function rebuildTable(
  db: Database,
  tableName: string,
  createTableSql: string,
  copyRowsSql?: string,
) {
  const legacyTableName = `${tableName}__legacy`
  const existingIndexes = db.query(`PRAGMA index_list(${tableName})`).all() as Array<{
    name?: string
  }>

  db.exec('PRAGMA foreign_keys = OFF;')
  db.exec(`DROP TABLE IF EXISTS ${legacyTableName};`)
  db.exec(`ALTER TABLE ${tableName} RENAME TO ${legacyTableName};`)
  for (const index of existingIndexes) {
    if (index.name) {
      db.exec(`DROP INDEX IF EXISTS ${index.name};`)
    }
  }
  db.exec(createTableSql)
  if (copyRowsSql) {
    db.exec(copyRowsSql.replaceAll('__LEGACY_TABLE__', legacyTableName))
  }
  db.exec(`DROP TABLE IF EXISTS ${legacyTableName};`)
  db.exec('PRAGMA foreign_keys = ON;')
}

function rebuildHistoryVersionTableIfNeeded(db: Database, tableName: string) {
  if (!hasTable(db, tableName)) {
    return
  }

  if (!hasColumn(db, tableName, 'validFromMonth')) {
    return
  }

  switch (tableName) {
    case 'divisions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE divisions (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            isCurrent INTEGER NOT NULL,
            level INTEGER NOT NULL,
            type TEXT NOT NULL,
            geometry TEXT,
            bbox TEXT,
            wikidata TEXT,
            hierarchy TEXT,
            cartography TEXT,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX divisions_current_lookup_idx
            ON divisions (id, isCurrent);
          CREATE INDEX divisions_sourceReleaseId_idx
            ON divisions (sourceReleaseId);
          CREATE INDEX divisions_snapshotId_idx
            ON divisions (snapshotId);
        `,
        `
          INSERT INTO divisions (
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, level, type, geometry, bbox,
            wikidata, hierarchy, cartography, sources, createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, level, type, geometry, bbox,
            wikidata, hierarchy, cartography, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'address2d':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE address2d (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            isCurrent INTEGER NOT NULL,
            streetId TEXT,
            hamletId TEXT,
            microhoodId TEXT,
            villageId TEXT,
            neighbourhoodId TEXT,
            ruralAreaId TEXT,
            macrohoodId TEXT,
            townId TEXT,
            districtId TEXT,
            areaId TEXT,
            countryId TEXT,
            geometry TEXT,
            bbox TEXT,
            identifiers TEXT,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX address2d_current_lookup_idx
            ON address2d (id, isCurrent);
          CREATE INDEX address2d_sourceReleaseId_idx
            ON address2d (sourceReleaseId);
          CREATE INDEX address2d_snapshotId_idx
            ON address2d (snapshotId);
        `,
        `
          INSERT INTO address2d (
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, streetId, hamletId, microhoodId, villageId,
            neighbourhoodId, ruralAreaId, macrohoodId, townId, districtId, areaId, countryId, geometry, bbox,
            identifiers, sources, createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, streetId, hamletId, microhoodId, villageId,
            neighbourhoodId, ruralAreaId, macrohoodId, townId, districtId, areaId, countryId, geometry, bbox,
            identifiers, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'address3d':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE address3d (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            isCurrent INTEGER NOT NULL,
            address2dId TEXT NOT NULL,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX address3d_current_lookup_idx
            ON address3d (id, isCurrent);
          CREATE INDEX address3d_sourceReleaseId_idx
            ON address3d (sourceReleaseId);
          CREATE INDEX address3d_snapshotId_idx
            ON address3d (snapshotId);
          CREATE INDEX address3d_address2dId_idx
            ON address3d (address2dId);
        `,
        `
          INSERT INTO address3d (
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, address2dId, sources, createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, address2dId, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'streets':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE streets (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            isCurrent INTEGER NOT NULL,
            yearBuilt TEXT,
            "references" TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX streets_current_lookup_idx
            ON streets (id, isCurrent);
          CREATE INDEX streets_sourceReleaseId_idx
            ON streets (sourceReleaseId);
          CREATE INDEX streets_snapshotId_idx
            ON streets (snapshotId);
        `,
        `
          INSERT INTO streets (
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, yearBuilt, "references", createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, yearBuilt, "references", createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'places':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE places (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            isCurrent INTEGER NOT NULL,
            address2dId TEXT,
            address3dId TEXT,
            lng REAL NOT NULL,
            lat REAL NOT NULL,
            bbox TEXT,
            operatingStatus TEXT,
            basicCategory TEXT,
            taxonomyPrimary TEXT,
            taxonomyHierarchy TEXT,
            taxonomyAlternates TEXT,
            wikidataId TEXT,
            websites TEXT,
            socials TEXT,
            emails TEXT,
            phones TEXT,
            addresses TEXT,
            confidence REAL,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX places_current_lookup_idx
            ON places (id, isCurrent);
          CREATE INDEX places_sourceReleaseId_idx
            ON places (sourceReleaseId);
          CREATE INDEX places_snapshotId_idx
            ON places (snapshotId);
        `,
        `
          INSERT INTO places (
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, address2dId, address3dId, lng, lat, bbox,
            operatingStatus, basicCategory, taxonomyPrimary, taxonomyHierarchy, taxonomyAlternates,
            wikidataId, websites, socials, emails, phones, addresses, confidence, sources, createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, isCurrent, address2dId, address3dId, lng, lat, bbox,
            operatingStatus, basicCategory, taxonomyPrimary, taxonomyHierarchy, taxonomyAlternates,
            wikidataId, websites, socials, emails, phones, addresses, confidence, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
  }
}

function ensureFixtureCompatibleMetaSchema(db: Database) {
  let apiReleaseSetsRebuilt = false

  addColumnIfMissing(
    db,
    'publishers',
    'versionHash',
    "versionHash TEXT NOT NULL DEFAULT ''",
  )
  addColumnIfMissing(
    db,
    'datasets',
    'versionHash',
    "versionHash TEXT NOT NULL DEFAULT ''",
  )
  addColumnIfMissing(
    db,
    'apiVersions',
    'familyType',
    "familyType TEXT NOT NULL DEFAULT 'divisions'",
  )
  addColumnIfMissing(
    db,
    'apiVersions',
    'version',
    "version TEXT NOT NULL DEFAULT '0.1'",
  )
  addColumnIfMissing(
    db,
    'apiVersions',
    'versionHash',
    "versionHash TEXT NOT NULL DEFAULT ''",
  )
  db.exec(`
    CREATE TABLE IF NOT EXISTS apiLifecycleJournal (
      id TEXT PRIMARY KEY NOT NULL,
      apiVersionId TEXT NOT NULL,
      statusFrom TEXT,
      statusTo TEXT NOT NULL,
      reason TEXT,
      metadataJson TEXT,
      occurredAt TEXT NOT NULL
    )
  `)
  addColumnIfMissing(db, 'snapshots', 'cohortKey', "cohortKey TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'snapshots', 'parentSnapshotId', 'parentSnapshotId TEXT')

  if (
    hasColumn(db, 'apiReleaseSets', 'canonicalSchemaVersion') ||
    hasColumn(db, 'apiReleaseSets', 'canonicalLogicVersion')
  ) {
    const apiReleaseSetVersionHashExpression = hasColumn(
      db,
      'apiReleaseSets',
      'versionHash',
    )
      ? "COALESCE(versionHash, '')"
      : "''"

    rebuildTable(
      db,
      'apiReleaseSets',
      `
        CREATE TABLE apiReleaseSets (
          publisherFields TEXT,
id TEXT PRIMARY KEY NOT NULL,
          apiVersionId TEXT NOT NULL,
          code TEXT NOT NULL,
          schemaVersion TEXT NOT NULL,
          rulesetVersion TEXT NOT NULL,
          status TEXT NOT NULL,
          publishedAt INTEGER,
          validFrom INTEGER,
          validTo INTEGER,
          notes TEXT,
          versionHash TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY (apiVersionId) REFERENCES apiVersions(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT INTO apiReleaseSets (
          id,
          apiVersionId,
          code,
          schemaVersion,
          rulesetVersion,
          status,
          publishedAt,
          validFrom,
          validTo,
          notes,
          versionHash,
          createdAt,
          updatedAt
        )
        SELECT
          id,
          apiVersionId,
          code,
          canonicalSchemaVersion AS schemaVersion,
          canonicalLogicVersion AS rulesetVersion,
          status,
          publishedAt,
          validFrom,
          NULL AS validTo,
          notes,
          ${apiReleaseSetVersionHashExpression} AS versionHash,
          createdAt,
          updatedAt
        FROM __LEGACY_TABLE__;
      `,
    )
    apiReleaseSetsRebuilt = true
  } else {
    addColumnIfMissing(
      db,
      'apiReleaseSets',
      'schemaVersion',
      "schemaVersion TEXT NOT NULL DEFAULT ''",
    )
    addColumnIfMissing(
      db,
      'apiReleaseSets',
      'rulesetVersion',
      "rulesetVersion TEXT NOT NULL DEFAULT ''",
    )
    addColumnIfMissing(db, 'apiReleaseSets', 'validTo', 'validTo INTEGER')
    addColumnIfMissing(
      db,
      'apiReleaseSets',
      'versionHash',
      "versionHash TEXT NOT NULL DEFAULT ''",
    )
  }
  addColumnIfMissing(
    db,
    'apiReleaseSets',
    'domainCode',
    "domainCode TEXT NOT NULL DEFAULT 'default'",
  )

  if (hasColumn(db, 'apiReleaseSetSnapshots', 'snapshotFamily')) {
    rebuildTable(
      db,
      'apiReleaseSetSnapshots',
      `
        CREATE TABLE apiReleaseSetSnapshots (
          apiReleaseSetId TEXT NOT NULL,
          snapshotId TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'supporting',
          isRequired INTEGER NOT NULL DEFAULT 1,
          selectionMode TEXT NOT NULL DEFAULT 'carry_forward_optional',
          createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS},
          PRIMARY KEY (apiReleaseSetId, snapshotId),
          FOREIGN KEY (apiReleaseSetId) REFERENCES apiReleaseSets(id) ON DELETE CASCADE,
          FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT OR IGNORE INTO apiReleaseSetSnapshots (
          apiReleaseSetId, snapshotId, role, isRequired, selectionMode, createdAt
        )
        SELECT apiReleaseSetId, snapshotId, 'supporting', 1, 'carry_forward_optional', ${FIXTURE_TIMESTAMP_MS}
        FROM __LEGACY_TABLE__;
      `,
    )
  } else if (apiReleaseSetsRebuilt) {
    rebuildTable(
      db,
      'apiReleaseSetSnapshots',
      `
        CREATE TABLE apiReleaseSetSnapshots (
          apiReleaseSetId TEXT NOT NULL,
          snapshotId TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'supporting',
          isRequired INTEGER NOT NULL DEFAULT 1,
          selectionMode TEXT NOT NULL DEFAULT 'carry_forward_optional',
          createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS},
          PRIMARY KEY (apiReleaseSetId, snapshotId),
          FOREIGN KEY (apiReleaseSetId) REFERENCES apiReleaseSets(id) ON DELETE CASCADE,
          FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT OR IGNORE INTO apiReleaseSetSnapshots (
          apiReleaseSetId, snapshotId, role, isRequired, selectionMode, createdAt
        )
        SELECT apiReleaseSetId, snapshotId, 'supporting', 1, 'carry_forward_optional', ${FIXTURE_TIMESTAMP_MS}
        FROM __LEGACY_TABLE__;
      `,
    )
  } else {
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'role',
      "role TEXT NOT NULL DEFAULT 'supporting'",
    )
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'isRequired',
      'isRequired INTEGER NOT NULL DEFAULT 1',
    )
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'selectionMode',
      "selectionMode TEXT NOT NULL DEFAULT 'carry_forward_optional'",
    )
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'cohortMatchingMode',
      "cohortMatchingMode TEXT NOT NULL DEFAULT 'carry_forward_optional'",
    )
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'createdAt',
      `createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS}`,
    )
  }

  if (
    hasTable(db, 'apiCompositionMembers') &&
    !hasColumn(db, 'apiCompositionMembers', 'variant')
  ) {
    rebuildTable(
      db,
      'apiCompositionMembers',
      `
        CREATE TABLE apiCompositionMembers (
          apiCompositionId TEXT NOT NULL,
          resourceType TEXT NOT NULL,
          variant TEXT NOT NULL DEFAULT 'default',
          role TEXT NOT NULL,
          isRequired INTEGER NOT NULL,
          selectionMode TEXT NOT NULL,
          maxLagDays INTEGER,
          priority INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (apiCompositionId, resourceType, variant)
        );
      `,
      `
        INSERT INTO apiCompositionMembers (
          apiCompositionId, resourceType, variant, role, isRequired, selectionMode, maxLagDays, priority
        )
          SELECT apiCompositionId, resourceType, 'default', role, isRequired, selectionMode, maxLagDays, priority
        FROM __LEGACY_TABLE__;
      `,
    )
  }
  addColumnIfMissing(
    db,
    'apiCompositionMembers',
    'domainCode',
    "domainCode TEXT NOT NULL DEFAULT 'default'",
  )
  addColumnIfMissing(
    db,
    'apiCompositionMembers',
    'cohortMatchingMode',
    "cohortMatchingMode TEXT NOT NULL DEFAULT 'exact_ref'",
  )
  addColumnIfMissing(
    db,
    'apiComposition',
    'defaultDomainCode',
    'defaultDomainCode TEXT',
  )

  addColumnIfMissing(
    db,
    'snapshotResourceReleases',
    'selectedByRule',
    'selectedByRule TEXT',
  )
  addColumnIfMissing(
    db,
    'snapshotResourceReleases',
    'selectionMode',
    'selectionMode TEXT',
  )
  addColumnIfMissing(
    db,
    'snapshotResourceReleases',
    'anchorReleaseId',
    'anchorReleaseId TEXT',
  )

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshotRecipes (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      resourceType TEXT NOT NULL,
      version INTEGER NOT NULL,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshotRecipeInputs (
      snapshotRecipeId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      selectionPolicyJson TEXT,
      PRIMARY KEY (snapshotRecipeId, datasetId, role)
    );

    CREATE TABLE IF NOT EXISTS snapshotDependencies (snapshotId TEXT NOT NULL, dependencySnapshotId TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (snapshotId,role));

    CREATE TABLE IF NOT EXISTS snapshotAssemblies (
      id TEXT PRIMARY KEY NOT NULL,
      snapshotId TEXT NOT NULL,
      snapshotRecipeId TEXT NOT NULL,
      anchorReleaseId TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apiComposition (
      id TEXT PRIMARY KEY NOT NULL,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      primaryResourceType TEXT NOT NULL,
      defaultDomainCode TEXT,
      i18n TEXT,
      status TEXT NOT NULL,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apiCompositionMembers (
      apiCompositionId TEXT NOT NULL,
      domainCode TEXT NOT NULL DEFAULT 'default',
      resourceType TEXT NOT NULL,
      variant TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      cohortMatchingMode TEXT NOT NULL,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (apiCompositionId, domainCode, resourceType, variant)
    );
  `)

  addColumnIfMissing(
    db,
    'dataShards',
    'shardType',
    "shardType TEXT NOT NULL DEFAULT 'current'",
  )
  addColumnIfMissing(
    db,
    'dataShards',
    'versionHash',
    "versionHash TEXT NOT NULL DEFAULT ''",
  )

  for (const historyTable of [
    'divisions',
    'address2d',
    'address3d',
    'streets',
    'places',
  ]) {
    rebuildHistoryVersionTableIfNeeded(db, historyTable)
  }
}

export function collectSqlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      return collectSqlFiles(entryPath)
    }

    return entry.name.endsWith('.sql') ? [entryPath] : []
  })
}

export function loadMigrationSql(dir: string, families?: string[]) {
  const familySet = families ? new Set(families) : null

  return collectSqlFiles(dir)
    .filter(filePath => {
      if (!familySet) {
        return true
      }

      const relativePath = filePath.slice(dir.length + 1)
      const family = relativePath.split('/')[0]
      return family ? familySet.has(family) : false
    })
    .sort()
    .map(filePath => readFileSync(filePath, 'utf8'))
    .join('\n')
}

export function seedFixtureCatalog(db: Database) {
  ensureFixtureCompatibleMetaSchema(db)

  db.exec(`
    INSERT INTO publishers (id, code, versionHash, createdAt, updatedAt) VALUES
      ('publisher-overture', 'overture', 'vh-publisher-overture-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('publisher-hkgov', 'hkgov', 'vh-publisher-hkgov-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('publisher-hkgov-had', 'hkgov-had', 'vh-publisher-hkgov-had-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('publisher-hkgov-landsd', 'hkgov-landsd', 'vh-publisher-hkgov-landsd-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('publisher-hkgov-dpo', 'hkgov-dpo', 'vh-publisher-hkgov-dpo-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE publishers.versionHash <> excluded.versionHash;

    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES
      (
        'overture-hk-division',
        'publisher-overture',
        'ds-hk-overture-division',
        'hk',
        'static',
        'monthly',
        'divisions',
        'https://docs.overturemaps.org/',
        'vh-dataset-overture-hk-division-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'overture-hk-divisionArea',
        'publisher-overture',
        'ds-hk-overture-division-area',
        'hk',
        'static',
        'monthly',
        'divisions',
        'https://docs.overturemaps.org/',
        'vh-dataset-overture-hk-division-area-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'overture-hk-divisionBoundary',
        'publisher-overture',
        'ds-hk-overture-division-boundary',
        'hk',
        'static',
        'monthly',
        'divisions',
        'https://docs.overturemaps.org/',
        'vh-dataset-overture-hk-division-boundary-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'hkgov-had-hk-district',
        'publisher-hkgov-had',
        'ds-hk-hkgov-had-division-area-district',
        'hk',
        'static',
        'as-needed',
        'divisions',
        'https://data.gov.hk/',
        'vh-dataset-hkgov-had-hk-district-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'hkgov-landsd-hk-division',
        'publisher-hkgov-landsd',
        'ds-hk-hkgov-landsd-division',
        'hk',
        'static',
        'monthly',
        'divisions',
        'https://portal.csdi.gov.hk/',
        'vh-dataset-hkgov-landsd-hk-division-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'hkgov-dpo-hk-address',
        'publisher-hkgov-dpo',
        'ds-hk-hkgov-dpo-address',
        'hk',
        'static',
        'monthly',
        'addresses',
        'https://data.gov.hk/en-data/dataset/hk-ogcio-st_div_01-als',
        'vh-dataset-hkgov-dpo-hk-address-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      )
    ON CONFLICT(id) DO UPDATE SET
      publisherId = excluded.publisherId,
      code = excluded.code,
      regionCode = excluded.regionCode,
      releaseType = excluded.releaseType,
      releaseFrequency = excluded.releaseFrequency,
      theme = excluded.theme,
      sourceUrl = excluded.sourceUrl,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE datasets.versionHash <> excluded.versionHash;

    UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'overture-hk-division' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'overture-hk-divisionArea' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionBoundary') WHERE id = 'overture-hk-divisionBoundary' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionBoundary');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'divisionArea') WHERE id = 'hkgov-had-hk-district' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'divisionArea');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'division') WHERE id = 'hkgov-landsd-hk-division' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'division');
UPDATE datasets SET resourceTypes = json_insert(resourceTypes, '$[#]', 'address') WHERE id = 'hkgov-dpo-hk-address' AND NOT EXISTS (SELECT 1 FROM json_each(datasets.resourceTypes) WHERE value = 'address');

    INSERT INTO apiVersions (id, code, familyType, version, status, versionHash, createdAt, updatedAt) VALUES
      (
        'api-version-api-divisions-v0.1',
        'api-divisions-v0.1',
        'divisions',
        '0.1',
        'current',
        'vh-api-version-divisions-v0.1-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-version-api-addresses-v0.1',
        'api-addresses-v0.1',
        'addresses',
        '0.1',
        'current',
        'vh-api-version-addresses-v0.1-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-version-api-places-v0.1',
        'api-places-v0.1',
        'places',
        '0.1',
        'current',
        'vh-api-version-places-v0.1-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      )
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      familyType = excluded.familyType,
      version = excluded.version,
      status = excluded.status,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE apiVersions.versionHash <> excluded.versionHash;

    INSERT INTO apiLifecycleJournal (id, apiVersionId, statusFrom, statusTo, occurredAt) VALUES
      ('api-lifecycle-divisions-v0.1-current', 'api-version-api-divisions-v0.1', 'draft', 'current', ${FIXTURE_TIMESTAMP_MS}),
      ('api-lifecycle-addresses-v0.1-current', 'api-version-api-addresses-v0.1', 'draft', 'current', ${FIXTURE_TIMESTAMP_MS}),
      ('api-lifecycle-places-v0.1-current', 'api-version-api-places-v0.1', 'draft', 'current', ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO NOTHING;

    INSERT INTO apiReleaseSets (
      id, code, regionCode, domainCode, cohortKey, schemaVersion, rulesetVersion,
      versionHash, createdAt, updatedAt
    ) VALUES
      ('api-release-set-data-hk-divisions-2026-06-17.0', 'data-hk-divisions-2026-06-17.0',
        'hk', 'geographic', '2026-06-17.0', 'sv-division-v1', 'rs-division-merge-v1',
        'vh-api-release-set-division-2026-06-17.0-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-release-set-data-hk-addresses-2026-06-17.0', 'data-hk-addresses-2026-06-17.0',
        'hk', 'saanseoi', '2026-06-17.0', 'sv-address-v1', 'rs-address-merge-v1',
        'vh-api-release-set-address-2026-06-17.0-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-release-set-data-hk-places-2026-06-17.0', 'data-hk-places-2026-06-17.0',
        'hk', 'overture', '2026-06-17.0', 'sv-place-v1', 'rs-place-merge-v1',
        'vh-api-release-set-place-2026-06-17.0-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      regionCode = excluded.regionCode,
      domainCode = excluded.domainCode,
      cohortKey = excluded.cohortKey,
      schemaVersion = excluded.schemaVersion,
      rulesetVersion = excluded.rulesetVersion,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE apiReleaseSets.versionHash <> excluded.versionHash;

    INSERT INTO apiComposition (
      id, apiVersionId, code, version, primaryResourceType, defaultDomainCode, status, versionHash, createdAt, updatedAt
    ) VALUES
      ('api-composition-addresses-v1', 'api-version-api-addresses-v0.1', 'api-addresses-saanseoi', 1, 'address', 'saanseoi', 'current', 'vh-api-composition-addresses-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-composition-divisions-v1', 'api-version-api-divisions-v0.1', 'api-divisions-default', 1, 'division', 'geographic', 'current', 'vh-api-composition-divisions-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-composition-places-v1', 'api-version-api-places-v0.1', 'api-places-default', 1, 'place', 'overture', 'current', 'vh-api-composition-places-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      apiVersionId = excluded.apiVersionId,
      code = excluded.code,
      version = excluded.version,
      primaryResourceType = excluded.primaryResourceType,
      defaultDomainCode = excluded.defaultDomainCode,
      status = excluded.status,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt;

    INSERT INTO apiVersionReleaseSets (
      id, apiVersionId, apiReleaseSetId, apiCompositionId, status, publishedAt,
      versionHash, createdAt, updatedAt
    ) VALUES
      ('fixture-version-divisions-2026-06-17.0', 'api-version-api-divisions-v0.1',
        'api-release-set-data-hk-divisions-2026-06-17.0', 'api-composition-divisions-v1',
        'current', ${FIXTURE_TIMESTAMP_MS}, 'vh-fixture-version-divisions', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('fixture-version-addresses-2026-06-17.0', 'api-version-api-addresses-v0.1',
        'api-release-set-data-hk-addresses-2026-06-17.0', 'api-composition-addresses-v1',
        'current', ${FIXTURE_TIMESTAMP_MS}, 'vh-fixture-version-addresses', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('fixture-version-places-2026-06-17.0', 'api-version-api-places-v0.1',
        'api-release-set-data-hk-places-2026-06-17.0', 'api-composition-places-v1',
        'current', ${FIXTURE_TIMESTAMP_MS}, 'vh-fixture-version-places', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO NOTHING;

    INSERT INTO apiCompositionMembers (
      apiCompositionId, domainCode, resourceType, variant, role, isRequired, cohortMatchingMode, maxLagDays, priority
    ) VALUES
      ('api-composition-addresses-v1', 'saanseoi', 'address', 'hkgov-dpo', 'primary', 1, 'exact_ref', null, 0),
      ('api-composition-addresses-v1', 'saanseoi', 'address', 'overture-places', 'supplementary', 1, 'latest_at_or_before_or_earliest_after_cohort', null, 5),
      ('api-composition-addresses-v1', 'saanseoi', 'division', 'overture', 'lookup', 1, 'latest_at_or_before_or_earliest_after_cohort', null, 10),
      ('api-composition-divisions-v1', 'geographic', 'division', 'overture', 'primary', 1, 'exact_ref', null, 0),
      ('api-composition-divisions-v1', 'geographic', 'divisionArea', 'overture', 'geometry', 1, 'exact_ref', null, 10),
      ('api-composition-divisions-v1', 'geographic', 'divisionBoundary', 'overture', 'geometry', 1, 'exact_ref', null, 20),
      ('api-composition-divisions-v1', 'hkgov-landsd', 'division', 'hkgov-landsd', 'primary', 1, 'exact_ref', null, 0),
      ('api-composition-places-v1', 'overture', 'place', 'overture', 'primary', 1, 'exact_ref', null, 0),
      ('api-composition-places-v1', 'overture', 'address', 'hkgov-dpo', 'lookup', 1, 'latest_at_or_before_or_earliest_after_cohort', null, 10),
      ('api-composition-places-v1', 'overture', 'address', 'overture-places', 'lookup', 1, 'exact_ref', null, 15),
      ('api-composition-places-v1', 'overture', 'division', 'overture', 'lookup', 1, 'latest_at_or_before_or_earliest_after_cohort', null, 20)
    ON CONFLICT(apiCompositionId, domainCode, resourceType, variant) DO UPDATE SET
      role = excluded.role,
      isRequired = excluded.isRequired,
      cohortMatchingMode = excluded.cohortMatchingMode,
      maxLagDays = excluded.maxLagDays,
      priority = excluded.priority;

    INSERT INTO snapshotRecipes (
      id, code, resourceType, version, versionHash, createdAt, updatedAt
    ) VALUES
      ('snapshot-assembly-address-v1', 'snapshot-assembly-address-v1', 'address', 1, 'vh-snapshot-assembly-address-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('snapshot-assembly-division-v1', 'snapshot-assembly-division-v1', 'division', 1, 'vh-snapshot-assembly-division-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      resourceType = excluded.resourceType,
      version = excluded.version,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt;

    INSERT INTO dataShards (
      id,
      shardType,
      regionCode,
      year,
      environment,
      databaseName,
      databaseId,
      bindingName,
      status,
      versionHash,
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
        'vh-data-shards-current-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-before-preview',
        'history',
        'hk',
        null,
        'preview',
        'fixture-history-hk-before-preview',
        'fixture-history-hk-before-preview',
        'DB_HISTORY_HK_BEFORE',
        'active',
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-source-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-source-hk-before-preview',
        'source',
        'hk',
        null,
        'preview',
        'fixture-source-hk-before-preview',
        'fixture-source-hk-before-preview',
        'DB_SOURCE_HK_BEFORE',
        'active',
        'vh-data-shards-hk-source-v1',
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
        'vh-data-shards-current-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-history-hk-before-production',
        'history',
        'hk',
        null,
        'production',
        'fixture-history-hk-before-production',
        'fixture-history-hk-before-production',
        'DB_HISTORY_HK_BEFORE_PRODUCTION',
        'active',
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-history-v1',
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
        'vh-data-shards-hk-source-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'data-shard-source-hk-before-production',
        'source',
        'hk',
        null,
        'production',
        'fixture-source-hk-before-production',
        'fixture-source-hk-before-production',
        'DB_SOURCE_HK_BEFORE_PRODUCTION',
        'active',
        'vh-data-shards-hk-source-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      )
    ON CONFLICT(id) DO UPDATE SET
      shardType = excluded.shardType,
      regionCode = excluded.regionCode,
      year = excluded.year,
      environment = excluded.environment,
      databaseName = excluded.databaseName,
      databaseId = excluded.databaseId,
      bindingName = excluded.bindingName,
      status = excluded.status,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE dataShards.versionHash <> excluded.versionHash;
  `)
}

type FixtureRelease = {
  datasetCode?: string
  source: string
  regionCode: string
  resourceType: ResourceType
  theme?: string
  sourceVersion: string
  cohortKey: string
  rawObjectKey: string
  originalFileName: string
  status: string
  ingestedAt: string
  createdAt: string
  updatedAt: string
  resourceReleaseId?: string
  releaseCode?: string
  revokedAt?: string | null
  revocationReason?: string | null
  supersededByReleaseCode?: string | null
}

export function insertFixtureRelease(db: Database, release: FixtureRelease) {
  const publisherCode = publisherCodeForSource(release.source)
  const datasetCode =
    release.datasetCode ??
    buildDatasetCode(release.regionCode, release.source, release.resourceType)
  const releaseCode =
    release.releaseCode ??
    buildDatasetReleaseCode(
      release.regionCode,
      release.source,
      release.sourceVersion,
      release.resourceType,
    )
  const resourceReleaseId = release.resourceReleaseId ?? `release-${releaseCode}`
  const supersededByResourceReleaseId = release.supersededByReleaseCode
    ? `release-${release.supersededByReleaseCode}`
    : null

  const parent = db
    .query<{ id: string }, [string, string]>(
      `SELECT s.id FROM sourceReleases s JOIN datasets d ON d.id=s.datasetId WHERE d.code=? AND s.sourceVersion=?`,
    )
    .get(datasetCode, release.sourceVersion)
  const sourceReleaseId = parent?.id ?? `source-${resourceReleaseId}`
  db.query(
    `INSERT OR IGNORE INTO sourceReleases (
      id, datasetId, code, sourceVersion, cohortKey, status, ingestedAt, createdAt, updatedAt
    ) VALUES (
      ?1,
      (SELECT d.id FROM datasets d JOIN publishers p ON p.id = d.publisherId
       WHERE p.code = ?2 AND d.code = ?3),
      ?4, ?5, ?6, ?9, ?10, ?11, ?12
    )`,
  ).run(
    sourceReleaseId,
    publisherCode,
    datasetCode,
    `sr-${releaseCode}`,
    release.sourceVersion,
    release.cohortKey,
    release.rawObjectKey,
    release.originalFileName,
    release.status,
    release.ingestedAt,
    release.createdAt,
    release.updatedAt,
  )

  db.query(
    `
      INSERT INTO resourceReleases (
        id,
        sourceReleaseId,
        resourceType,
        code,
        status,
        revokedAt,
        revocationReason,
        supersededByResourceReleaseId,
        ingestedAt,
        createdAt,
        updatedAt
      ) VALUES (
        ?1,
        ?17,
        ?4,
        ?5,
        ?10,
        ?11,
        ?12,
        ?13,
        ?14,
        ?15,
        ?16
      )
    `,
  ).run(
    resourceReleaseId,
    publisherCode,
    datasetCode,
    release.resourceType,
    releaseCode,
    release.sourceVersion,
    release.cohortKey,
    release.rawObjectKey,
    release.originalFileName,
    release.status,
    release.revokedAt ?? null,
    release.revocationReason ?? null,
    supersededByResourceReleaseId,
    release.ingestedAt,
    release.createdAt,
    release.updatedAt,
    sourceReleaseId,
  )

  return {
    datasetCode,
    releaseCode,
    resourceReleaseId,
  }
}
