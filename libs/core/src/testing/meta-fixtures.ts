import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Database } from 'bun:sqlite'

const FIXTURE_TIMESTAMP_MS = 1718236800000

function resolveFixtureDatasetCode(source: string, regionCode: string, type: string) {
  return `ds-${regionCode}-${source}-${type}`
}

function hasColumn(db: Database, tableName: string, columnName: string) {
  const rows = db.query(`PRAGMA table_info(${tableName})`).all() as Array<{
    name?: string
  }>

  return rows.some(row => row.name === columnName)
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

function ensureHistoryCohortKeyColumns(db: Database, tableName: string) {
  addColumnIfMissing(
    db,
    tableName,
    'validFromCohortKey',
    "validFromCohortKey TEXT NOT NULL DEFAULT ''",
  )
  addColumnIfMissing(db, tableName, 'validToCohortKey', 'validToCohortKey TEXT')

  if (hasColumn(db, tableName, 'validFromMonth')) {
    db.exec(`
      UPDATE ${tableName}
      SET
        validFromCohortKey = COALESCE(NULLIF(validFromCohortKey, ''), validFromMonth, ''),
        validToCohortKey = COALESCE(validToCohortKey, validToMonth)
      WHERE
        validFromCohortKey IS NULL
        OR validFromCohortKey = ''
        OR validToCohortKey IS NULL;
    `)
  }
}

function rebuildHistoryVersionTableIfNeeded(db: Database, tableName: string) {
  if (!hasColumn(db, tableName, 'validFromMonth')) {
    ensureHistoryCohortKeyColumns(db, tableName)
    return
  }

  switch (tableName) {
    case 'divisionsVersions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE divisionsVersions (
            id TEXT NOT NULL,
            regionCode TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            validFromSnapshotId TEXT NOT NULL,
            validToSnapshotId TEXT,
            validFromCohortKey TEXT NOT NULL,
            validToCohortKey TEXT,
            isCurrent INTEGER NOT NULL,
            level INTEGER NOT NULL,
            type TEXT NOT NULL,
            geometry TEXT,
            bbox TEXT,
            population INTEGER,
            subtype TEXT,
            class TEXT,
            wikidata TEXT,
            hierarchy TEXT,
            parentDivisionId TEXT,
            cartography TEXT,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX divisionsVersions_current_lookup_idx
            ON divisionsVersions (regionCode, id, isCurrent);
          CREATE INDEX divisionsVersions_snapshot_validity_idx
            ON divisionsVersions (regionCode, validFromSnapshotId, validToSnapshotId);
          CREATE INDEX divisionsVersions_validity_idx
            ON divisionsVersions (regionCode, validFromCohortKey, validToCohortKey);
          CREATE INDEX divisionsVersions_sourceReleaseId_idx
            ON divisionsVersions (sourceReleaseId);
          CREATE INDEX divisionsVersions_snapshotId_idx
            ON divisionsVersions (snapshotId);
        `,
        `
          INSERT INTO divisionsVersions (
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromCohortKey, validToCohortKey, isCurrent, level, type, geometry, bbox, population,
            subtype, class, wikidata, hierarchy, parentDivisionId, cartography, sources, createdAt, updatedAt
          )
          SELECT
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromMonth, validToMonth, isCurrent, level, type, geometry, bbox, population,
            subtype, class, wikidata, hierarchy, parentDivisionId, cartography, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'address2dVersions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE address2dVersions (
            id TEXT NOT NULL,
            regionCode TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            validFromSnapshotId TEXT NOT NULL,
            validToSnapshotId TEXT,
            validFromCohortKey TEXT NOT NULL,
            validToCohortKey TEXT,
            isCurrent INTEGER NOT NULL,
            streetId TEXT,
            hamletId TEXT,
            microhoodId TEXT,
            villageId TEXT,
            neighbourhoodId TEXT,
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
          CREATE INDEX address2dVersions_current_lookup_idx
            ON address2dVersions (regionCode, id, isCurrent);
          CREATE INDEX address2dVersions_snapshot_validity_idx
            ON address2dVersions (regionCode, validFromSnapshotId, validToSnapshotId);
          CREATE INDEX address2dVersions_validity_idx
            ON address2dVersions (regionCode, validFromCohortKey, validToCohortKey);
          CREATE INDEX address2dVersions_sourceReleaseId_idx
            ON address2dVersions (sourceReleaseId);
          CREATE INDEX address2dVersions_snapshotId_idx
            ON address2dVersions (snapshotId);
        `,
        `
          INSERT INTO address2dVersions (
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromCohortKey, validToCohortKey, isCurrent, streetId, hamletId, microhoodId, villageId,
            neighbourhoodId, macrohoodId, townId, districtId, areaId, countryId, geometry, bbox,
            identifiers, sources, createdAt, updatedAt
          )
          SELECT
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromMonth, validToMonth, isCurrent, streetId, hamletId, microhoodId, villageId,
            neighbourhoodId, macrohoodId, townId, districtId, areaId, countryId, geometry, bbox,
            identifiers, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'address3dVersions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE address3dVersions (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            validFromSnapshotId TEXT NOT NULL,
            validToSnapshotId TEXT,
            validFromCohortKey TEXT NOT NULL,
            validToCohortKey TEXT,
            isCurrent INTEGER NOT NULL,
            address2dId TEXT NOT NULL,
            sources TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX address3dVersions_current_lookup_idx
            ON address3dVersions (id, isCurrent);
          CREATE INDEX address3dVersions_snapshot_validity_idx
            ON address3dVersions (validFromSnapshotId, validToSnapshotId);
          CREATE INDEX address3dVersions_validity_idx
            ON address3dVersions (validFromCohortKey, validToCohortKey);
          CREATE INDEX address3dVersions_sourceReleaseId_idx
            ON address3dVersions (sourceReleaseId);
          CREATE INDEX address3dVersions_snapshotId_idx
            ON address3dVersions (snapshotId);
          CREATE INDEX address3dVersions_address2dId_idx
            ON address3dVersions (address2dId);
        `,
        `
          INSERT INTO address3dVersions (
            id, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromCohortKey, validToCohortKey, isCurrent, address2dId, sources, createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromMonth, validToMonth, isCurrent, address2dId, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'streetsVersions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE streetsVersions (
            id TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            validFromSnapshotId TEXT NOT NULL,
            validToSnapshotId TEXT,
            validFromCohortKey TEXT NOT NULL,
            validToCohortKey TEXT,
            isCurrent INTEGER NOT NULL,
            yearBuilt TEXT,
            "references" TEXT,
            createdAt TEXT NOT NULL,
            updatedAt TEXT NOT NULL,
            PRIMARY KEY (id, versionHash)
          );
          CREATE INDEX streetsVersions_current_lookup_idx
            ON streetsVersions (id, isCurrent);
          CREATE INDEX streetsVersions_snapshot_validity_idx
            ON streetsVersions (validFromSnapshotId, validToSnapshotId);
          CREATE INDEX streetsVersions_validity_idx
            ON streetsVersions (validFromCohortKey, validToCohortKey);
          CREATE INDEX streetsVersions_sourceReleaseId_idx
            ON streetsVersions (sourceReleaseId);
          CREATE INDEX streetsVersions_snapshotId_idx
            ON streetsVersions (snapshotId);
        `,
        `
          INSERT INTO streetsVersions (
            id, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromCohortKey, validToCohortKey, isCurrent, yearBuilt, "references", createdAt, updatedAt
          )
          SELECT
            id, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromMonth, validToMonth, isCurrent, yearBuilt, "references", createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
    case 'placesVersions':
      rebuildTable(
        db,
        tableName,
        `
          CREATE TABLE placesVersions (
            id TEXT NOT NULL,
            regionCode TEXT NOT NULL,
            versionHash TEXT NOT NULL,
            sourceReleaseId TEXT NOT NULL,
            snapshotId TEXT NOT NULL,
            validFromSnapshotId TEXT NOT NULL,
            validToSnapshotId TEXT,
            validFromCohortKey TEXT NOT NULL,
            validToCohortKey TEXT,
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
            brandWikidata TEXT,
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
          CREATE INDEX placesVersions_current_lookup_idx
            ON placesVersions (regionCode, id, isCurrent);
          CREATE INDEX placesVersions_snapshot_validity_idx
            ON placesVersions (regionCode, validFromSnapshotId, validToSnapshotId);
          CREATE INDEX placesVersions_validity_idx
            ON placesVersions (regionCode, validFromCohortKey, validToCohortKey);
          CREATE INDEX placesVersions_sourceReleaseId_idx
            ON placesVersions (sourceReleaseId);
          CREATE INDEX placesVersions_snapshotId_idx
            ON placesVersions (snapshotId);
        `,
        `
          INSERT INTO placesVersions (
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromCohortKey, validToCohortKey, isCurrent, address2dId, address3dId, lng, lat, bbox,
            operatingStatus, basicCategory, taxonomyPrimary, taxonomyHierarchy, taxonomyAlternates,
            brandWikidata, websites, socials, emails, phones, addresses, confidence, sources, createdAt, updatedAt
          )
          SELECT
            id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId, validToSnapshotId,
            validFromMonth, validToMonth, isCurrent, address2dId, address3dId, lng, lat, bbox,
            operatingStatus, basicCategory, taxonomyPrimary, taxonomyHierarchy, taxonomyAlternates,
            brandWikidata, websites, socials, emails, phones, addresses, confidence, sources, createdAt, updatedAt
          FROM __LEGACY_TABLE__;
        `,
      )
      return
  }
}

function ensureFixtureCompatibleMetaSchema(db: Database) {
  let snapshotsRebuilt = false
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
  addColumnIfMissing(db, 'apiVersions', 'publishedAt', 'publishedAt INTEGER')
  addColumnIfMissing(db, 'apiVersions', 'deprecatedAt', 'deprecatedAt INTEGER')
  addColumnIfMissing(db, 'apiVersions', 'retiredAt', 'retiredAt INTEGER')
  addColumnIfMissing(
    db,
    'apiVersions',
    'versionHash',
    "versionHash TEXT NOT NULL DEFAULT ''",
  )
  if (hasColumn(db, 'snapshots', 'family')) {
    const snapshotResourceTypeExpression = hasColumn(db, 'snapshots', 'resourceType')
      ? 'COALESCE(resourceType, family)'
      : 'family'

    rebuildTable(
      db,
      'snapshots',
      `
        CREATE TABLE snapshots (
          id TEXT PRIMARY KEY NOT NULL,
          resourceType TEXT NOT NULL,
          code TEXT NOT NULL,
          status TEXT NOT NULL,
          publishedAt INTEGER,
          validFrom INTEGER,
          validTo INTEGER,
          notes TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `,
      `
        INSERT INTO snapshots (
          id, resourceType, code, status, publishedAt, validFrom, validTo, notes, createdAt, updatedAt
        )
        SELECT
          id,
          ${snapshotResourceTypeExpression} AS resourceType,
          code,
          status,
          publishedAt,
          validFrom,
          validTo,
          notes,
          createdAt,
          updatedAt
        FROM __LEGACY_TABLE__;
      `,
    )
    snapshotsRebuilt = true
  }

  if (snapshotsRebuilt) {
    rebuildTable(
      db,
      'snapshotSources',
      `
        CREATE TABLE snapshotSources (
          snapshotId TEXT NOT NULL,
          datasetId TEXT NOT NULL,
          sourceReleaseId TEXT NOT NULL,
          role TEXT NOT NULL,
          selectedByRule TEXT,
          selectionMode TEXT,
          anchorReleaseId TEXT,
          sourceCohortKey TEXT,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY (snapshotId, sourceReleaseId),
          FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE CASCADE,
          FOREIGN KEY (datasetId) REFERENCES datasets(id) ON DELETE RESTRICT,
          FOREIGN KEY (sourceReleaseId, datasetId) REFERENCES releases(id, datasetId) ON DELETE RESTRICT
        );
      `,
      `
        INSERT INTO snapshotSources (
          snapshotId, datasetId, sourceReleaseId, role, selectedByRule, selectionMode, anchorReleaseId, sourceCohortKey, createdAt
        )
        SELECT snapshotId, datasetId, sourceReleaseId, role, null, null, null, null, createdAt
        FROM __LEGACY_TABLE__;
      `,
    )
  }

  addColumnIfMissing(db, 'releases', 'cohortKey', "cohortKey TEXT DEFAULT ''")
  if (hasColumn(db, 'releases', 'snapshotMonth')) {
    db.exec(`
      UPDATE releases
      SET cohortKey = COALESCE(NULLIF(cohortKey, ''), snapshotMonth, sourceVersion)
      WHERE cohortKey IS NULL OR cohortKey = '';
    `)
  }

  addColumnIfMissing(db, 'snapshots', 'cohortKey', "cohortKey TEXT NOT NULL DEFAULT ''")

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
          anchorSnapshotId TEXT,
          createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS},
          PRIMARY KEY (apiReleaseSetId, snapshotId),
          FOREIGN KEY (apiReleaseSetId) REFERENCES apiReleaseSets(id) ON DELETE CASCADE,
          FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT,
          FOREIGN KEY (anchorSnapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT OR IGNORE INTO apiReleaseSetSnapshots (
          apiReleaseSetId, snapshotId, role, isRequired, selectionMode, anchorSnapshotId, createdAt
        )
        SELECT apiReleaseSetId, snapshotId, 'supporting', 1, 'carry_forward_optional', null, ${FIXTURE_TIMESTAMP_MS}
        FROM __LEGACY_TABLE__;
      `,
    )
  } else if (apiReleaseSetsRebuilt || snapshotsRebuilt) {
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
          anchorSnapshotId TEXT,
          createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS},
          PRIMARY KEY (apiReleaseSetId, snapshotId),
          FOREIGN KEY (apiReleaseSetId) REFERENCES apiReleaseSets(id) ON DELETE CASCADE,
          FOREIGN KEY (snapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT,
          FOREIGN KEY (anchorSnapshotId) REFERENCES snapshots(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT OR IGNORE INTO apiReleaseSetSnapshots (
          apiReleaseSetId, snapshotId, role, isRequired, selectionMode, anchorSnapshotId, createdAt
        )
        SELECT apiReleaseSetId, snapshotId, 'supporting', 1, 'carry_forward_optional', null, ${FIXTURE_TIMESTAMP_MS}
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
      'anchorSnapshotId',
      'anchorSnapshotId TEXT',
    )
    addColumnIfMissing(
      db,
      'apiReleaseSetSnapshots',
      'createdAt',
      `createdAt INTEGER NOT NULL DEFAULT ${FIXTURE_TIMESTAMP_MS}`,
    )
  }

  addColumnIfMissing(db, 'snapshotSources', 'selectedByRule', 'selectedByRule TEXT')
  addColumnIfMissing(db, 'snapshotSources', 'selectionMode', 'selectionMode TEXT')
  addColumnIfMissing(db, 'snapshotSources', 'anchorReleaseId', 'anchorReleaseId TEXT')
  addColumnIfMissing(db, 'snapshotSources', 'sourceCohortKey', 'sourceCohortKey TEXT')

  db.exec(`
    CREATE TABLE IF NOT EXISTS snapshotAssembly (
      id TEXT PRIMARY KEY NOT NULL,
      code TEXT NOT NULL UNIQUE,
      resourceType TEXT NOT NULL,
      version INTEGER NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS snapshotAssemblySources (
      snapshotAssemblyId TEXT NOT NULL,
      datasetId TEXT NOT NULL,
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      selectorType TEXT NOT NULL,
      anchorDatasetId TEXT,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      configJson TEXT,
      PRIMARY KEY (snapshotAssemblyId, datasetId, role)
    );

    CREATE TABLE IF NOT EXISTS snapshotAssemblyRuns (
      id TEXT PRIMARY KEY NOT NULL,
      snapshotId TEXT NOT NULL,
      snapshotAssemblyId TEXT NOT NULL,
      anchorReleaseId TEXT,
      anchorCohortKey TEXT,
      status TEXT NOT NULL,
      selectionSummaryJson TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apiComposition (
      id TEXT PRIMARY KEY NOT NULL,
      apiVersionId TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      primaryResourceType TEXT NOT NULL,
      status TEXT NOT NULL,
      notes TEXT,
      versionHash TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS apiCompositionMembers (
      apiCompositionId TEXT NOT NULL,
      resourceType TEXT NOT NULL,
      role TEXT NOT NULL,
      isRequired INTEGER NOT NULL,
      selectionMode TEXT NOT NULL,
      anchorResourceType TEXT,
      maxLagDays INTEGER,
      priority INTEGER NOT NULL DEFAULT 0,
      configJson TEXT,
      PRIMARY KEY (apiCompositionId, resourceType)
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
    'divisionsVersions',
    'address2dVersions',
    'address3dVersions',
    'streetsVersions',
    'placesVersions',
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

export function loadMigrationSql(dir: string) {
  return collectSqlFiles(dir)
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
      ('publisher-hkgov-als', 'hkgov-als', 'vh-publisher-hkgov-als-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE publishers.versionHash <> excluded.versionHash;

    INSERT INTO datasets (
      id, publisherId, code, regionCode, releaseType, releaseFrequency, theme, type, sourceUrl, versionHash, createdAt, updatedAt
    ) VALUES
      (
        'overture-hk-division',
        'publisher-overture',
        'ds-hk-overture-division',
        'hk',
        'static',
        'monthly',
        'divisions',
        'division',
        'https://docs.overturemaps.org/',
        'vh-dataset-overture-hk-division-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'overture-hk-address',
        'publisher-overture',
        'ds-hk-overture-address',
        'hk',
        'static',
        'monthly',
        'addresses',
        'address',
        'https://docs.overturemaps.org/schema/reference/addresses/address/',
        'vh-dataset-overture-hk-address-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'hkgov-als-hk-address',
        'publisher-hkgov-als',
        'ds-hk-hkgov-als-address',
        'hk',
        'static',
        'monthly',
        'addresses',
        'address',
        'https://data.gov.hk/en-data/dataset/hk-ogcio-st_div_01-als',
        'vh-dataset-hkgov-als-hk-address-v1',
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
      type = excluded.type,
      sourceUrl = excluded.sourceUrl,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE datasets.versionHash <> excluded.versionHash;

    INSERT INTO apiVersions (id, code, familyType, version, status, publishedAt, versionHash, createdAt, updatedAt) VALUES
      (
        'api-version-api-divisions-v0.1',
        'api-divisions-v0.1',
        'divisions',
        '0.1',
        'current',
        ${FIXTURE_TIMESTAMP_MS},
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
        ${FIXTURE_TIMESTAMP_MS},
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
        ${FIXTURE_TIMESTAMP_MS},
        'vh-api-version-places-v0.1-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      )
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      familyType = excluded.familyType,
      version = excluded.version,
      status = excluded.status,
      publishedAt = excluded.publishedAt,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE apiVersions.versionHash <> excluded.versionHash;

    INSERT INTO apiReleaseSets (
      id,
      apiVersionId,
      code,
      schemaVersion,
      rulesetVersion,
      status,
      publishedAt,
      versionHash,
      createdAt,
      updatedAt
    ) VALUES
      (
        'api-release-set-data-hk-divisions-2026-06-17.0-0',
        'api-version-api-divisions-v0.1',
        'data-hk-divisions-2026-06-17.0-0',
        'sv-division-v1',
        'rs-division-merge-v1',
        'current',
        ${FIXTURE_TIMESTAMP_MS},
        'vh-api-release-set-division-2026-06-17.0-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-release-set-data-hk-addresses-2026-06-17.0-0',
        'api-version-api-addresses-v0.1',
        'data-hk-addresses-2026-06-17.0-0',
        'sv-address-v1',
        'rs-address-merge-v1',
        'current',
        ${FIXTURE_TIMESTAMP_MS},
        'vh-api-release-set-address-2026-06-17.0-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      ),
      (
        'api-release-set-data-hk-places-2026-06-17.0-0',
        'api-version-api-places-v0.1',
        'data-hk-places-2026-06-17.0-0',
        'sv-place-v1',
        'rs-place-merge-v1',
        'current',
        ${FIXTURE_TIMESTAMP_MS},
        'vh-api-release-set-place-2026-06-17.0-v1',
        ${FIXTURE_TIMESTAMP_MS},
        ${FIXTURE_TIMESTAMP_MS}
      )
    ON CONFLICT(id) DO UPDATE SET
      apiVersionId = excluded.apiVersionId,
      code = excluded.code,
      schemaVersion = excluded.schemaVersion,
      rulesetVersion = excluded.rulesetVersion,
      status = excluded.status,
      publishedAt = excluded.publishedAt,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt
    WHERE apiReleaseSets.versionHash <> excluded.versionHash;

    INSERT INTO apiComposition (
      id, apiVersionId, code, version, primaryResourceType, status, notes, versionHash, createdAt, updatedAt
    ) VALUES
      ('api-composition-addresses-v1', 'api-version-api-addresses-v0.1', 'api-addresses-default', 1, 'address', 'current', null, 'vh-api-composition-addresses-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-composition-divisions-v1', 'api-version-api-divisions-v0.1', 'api-divisions-default', 1, 'division', 'current', null, 'vh-api-composition-divisions-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('api-composition-places-v1', 'api-version-api-places-v0.1', 'api-places-default', 1, 'place', 'current', null, 'vh-api-composition-places-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      apiVersionId = excluded.apiVersionId,
      code = excluded.code,
      version = excluded.version,
      primaryResourceType = excluded.primaryResourceType,
      status = excluded.status,
      notes = excluded.notes,
      versionHash = excluded.versionHash,
      updatedAt = excluded.updatedAt;

    INSERT INTO apiCompositionMembers (
      apiCompositionId, resourceType, role, isRequired, selectionMode, anchorResourceType, maxLagDays, priority, configJson
    ) VALUES
      ('api-composition-addresses-v1', 'address', 'primary', 1, 'exact_ref', null, null, 0, null),
      ('api-composition-divisions-v1', 'division', 'primary', 1, 'exact_ref', null, null, 0, null),
      ('api-composition-places-v1', 'place', 'primary', 1, 'exact_ref', null, null, 0, null),
      ('api-composition-places-v1', 'address', 'supporting', 1, 'exact_ref', 'place', null, 10, null),
      ('api-composition-places-v1', 'division', 'supporting', 1, 'exact_ref', 'place', null, 20, null)
    ON CONFLICT(apiCompositionId, resourceType) DO UPDATE SET
      role = excluded.role,
      isRequired = excluded.isRequired,
      selectionMode = excluded.selectionMode,
      anchorResourceType = excluded.anchorResourceType,
      maxLagDays = excluded.maxLagDays,
      priority = excluded.priority,
      configJson = excluded.configJson;

    INSERT INTO snapshotAssembly (
      id, code, resourceType, version, status, notes, versionHash, createdAt, updatedAt
    ) VALUES
      ('snapshot-assembly-address-v1', 'snapshot-assembly-address-v1', 'address', 1, 'current', null, 'vh-snapshot-assembly-address-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS}),
      ('snapshot-assembly-division-v1', 'snapshot-assembly-division-v1', 'division', 1, 'current', null, 'vh-snapshot-assembly-division-v1', ${FIXTURE_TIMESTAMP_MS}, ${FIXTURE_TIMESTAMP_MS})
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code,
      resourceType = excluded.resourceType,
      version = excluded.version,
      status = excluded.status,
      notes = excluded.notes,
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
  source: string
  regionCode: string
  type: string
  theme?: string
  sourceVersion: string
  cohortKey: string
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
  const publisherCode = release.source
  const datasetCode = resolveFixtureDatasetCode(
    release.source,
    release.regionCode,
    release.type,
  )
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
        cohortKey,
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
    release.cohortKey,
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
