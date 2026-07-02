import type { DatasetProcessingMessage } from '@repo/core'

import type {
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'
import { buildSourceDatasetId, buildSourceReleaseId } from '../../db/source'

export type AddressSqlImportTarget = 'source' | 'history' | 'current'

export type AddressSqlImportFile = {
  bytes: number
  filename: string
  sql: string
  statementCount: number
  target: AddressSqlImportTarget
}

export type AddressSqlImportBuildOptions = {
  maxStatementBytes?: number
  runId?: string
}

type SqlInsertRow = Record<string, SqlValue>
type SqlValue = boolean | number | string | null | undefined

const DEFAULT_MAX_STATEMENT_BYTES = 90_000
const SQL_TEXT_ENCODER = new TextEncoder()

const NORMALIZED_ROW_COLUMNS = [
  'runId',
  'rowNumber',
  'source',
  'sourceVersion',
  'sourceRecordId',
  'matchKey',
  'sourcePayloadHash',
  'regionCode',
  'divisionSnapshotId',
  'streetSnapshotId',
  'streetId',
  'hamletId',
  'microhoodId',
  'villageId',
  'neighbourhoodId',
  'macrohoodId',
  'townId',
  'districtId',
  'areaId',
  'countryId',
  'geometry',
  'bbox',
  'identifiers',
  'sources',
  'rawPayload',
] as const

const NORMALIZED_I18N_COLUMNS = [
  'runId',
  'sourceRecordId',
  'locale',
  'formattedAddress',
  'buildingName',
  'buildingNumberFrom',
  'buildingNumberTo',
  'blockType',
  'blockNumber',
  'blockTypeBeforeNumber',
  'phaseName',
  'phaseNumber',
  'estateName',
  'streetNumber',
  'streetName',
] as const

const RESOLVED_ROW_COLUMNS = [
  'runId',
  'rowNumber',
  'sourceRecordId',
  'addressId',
  'changed',
  'changedExistingId',
  'versionHash',
  'snapshotId',
  'divisionSnapshotId',
  'streetSnapshotId',
  'streetId',
  'hamletId',
  'microhoodId',
  'villageId',
  'neighbourhoodId',
  'macrohoodId',
  'townId',
  'districtId',
  'areaId',
  'countryId',
  'geometry',
  'bbox',
  'identifiers',
  'sources',
  'createdAt',
  'updatedAt',
] as const

const RESOLVED_I18N_COLUMNS = [
  'runId',
  'addressId',
  'versionHash',
  'snapshotId',
  'locale',
  'formattedAddress',
  'buildingName',
  'buildingNumberFrom',
  'buildingNumberTo',
  'blockType',
  'blockNumber',
  'blockTypeBeforeNumber',
  'phaseName',
  'phaseNumber',
  'estateName',
  'streetNumber',
  'streetName',
  'createdAt',
  'updatedAt',
] as const

export function buildAddressSqlImportRunId(message: DatasetProcessingMessage) {
  const releaseId = message.releaseId ?? message.datasetId
  const shard = message.shardYear ?? message.sourceVersion.slice(0, 4)

  return [
    'address',
    message.source,
    message.regionCode,
    shard,
    releaseId,
    message.sourceVersion,
  ]
    .join('-')
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
}

export function buildAddressSourceSqlImportFiles(
  message: DatasetProcessingMessage,
  artifact: NormalizedAddressChunkArtifact,
  options: AddressSqlImportBuildOptions = {},
): AddressSqlImportFile[] {
  const runId = options.runId ?? buildAddressSqlImportRunId(message)
  const statements = [
    buildAddressNormalizedStagingSchemaSql(),
    `DELETE FROM ssAddressImportRows WHERE runId = ${sqlLiteral(runId)};`,
    `DELETE FROM ssAddressImportI18n WHERE runId = ${sqlLiteral(runId)};`,
    ...buildInsertStatements(
      'ssAddressImportRows',
      NORMALIZED_ROW_COLUMNS,
      artifact.rows.map((row, index) => ({
        runId,
        rowNumber: artifact.rowStart + index,
        source: message.source,
        sourceVersion: message.sourceVersion,
        sourceRecordId: row.sourceId,
        matchKey: row.matchKey,
        sourcePayloadHash: row.sourcePayloadHash,
        regionCode: message.regionCode,
        divisionSnapshotId: row.base.divisionSnapshotId,
        streetSnapshotId: row.base.streetSnapshotId,
        streetId: row.base.streetId,
        hamletId: row.base.hamletId,
        microhoodId: row.base.microhoodId,
        villageId: row.base.villageId,
        neighbourhoodId: row.base.neighbourhoodId,
        macrohoodId: row.base.macrohoodId,
        townId: row.base.townId,
        districtId: row.base.districtId,
        areaId: row.base.areaId,
        countryId: row.base.countryId,
        geometry: jsonText(row.base.geometry),
        bbox: jsonText(row.base.bbox),
        identifiers: jsonText(row.base.identifiers),
        sources: jsonText(row.base.sources),
        rawPayload: jsonText(row.raw),
      })),
      options.maxStatementBytes,
    ),
    ...buildInsertStatements(
      'ssAddressImportI18n',
      NORMALIZED_I18N_COLUMNS,
      artifact.rows.flatMap(row =>
        row.i18n.map(localized => ({
          runId,
          sourceRecordId: row.sourceId,
          locale: localized.locale,
          formattedAddress: localized.formattedAddress,
          buildingName: localized.buildingName,
          buildingNumberFrom: localized.buildingNumberFrom,
          buildingNumberTo: localized.buildingNumberTo,
          blockType: localized.blockType,
          blockNumber: localized.blockNumber,
          blockTypeBeforeNumber: localized.blockTypeBeforeNumber,
          phaseName: localized.phaseName,
          phaseNumber: localized.phaseNumber,
          estateName: localized.estateName,
          streetNumber: localized.streetNumber,
          streetName: localized.streetName,
        })),
      ),
      options.maxStatementBytes,
    ),
    buildAddressSourceApplySql(message, runId),
  ]

  return [
    buildSqlImportFile(
      'source',
      `${runId}-source-${artifact.rowStart}.sql`,
      statements,
    ),
  ]
}

export function buildAddressResolvedSqlImportFiles(
  message: DatasetProcessingMessage,
  artifact: ResolvedAddressChunkArtifact,
  options: AddressSqlImportBuildOptions = {},
): AddressSqlImportFile[] {
  const runId = options.runId ?? buildAddressSqlImportRunId(message)
  const rowStatements = [
    buildAddressResolvedStagingSchemaSql(),
    `DELETE FROM ssAddressImportResolvedRows WHERE runId = ${sqlLiteral(runId)};`,
    `DELETE FROM ssAddressImportResolvedI18n WHERE runId = ${sqlLiteral(runId)};`,
    ...buildInsertStatements(
      'ssAddressImportResolvedRows',
      RESOLVED_ROW_COLUMNS,
      artifact.rows.map((row, index) => ({
        runId,
        rowNumber: artifact.rowStart + index,
        sourceRecordId: row.sourceId,
        addressId: row.addressId,
        changed: row.changed,
        changedExistingId: row.changedExistingId,
        versionHash: row.versionHash,
        snapshotId: row.base.snapshotId,
        divisionSnapshotId: row.base.divisionSnapshotId,
        streetSnapshotId: row.base.streetSnapshotId,
        streetId: row.base.streetId,
        hamletId: row.base.hamletId,
        microhoodId: row.base.microhoodId,
        villageId: row.base.villageId,
        neighbourhoodId: row.base.neighbourhoodId,
        macrohoodId: row.base.macrohoodId,
        townId: row.base.townId,
        districtId: row.base.districtId,
        areaId: row.base.areaId,
        countryId: row.base.countryId,
        geometry: jsonText(row.base.geometry),
        bbox: jsonText(row.base.bbox),
        identifiers: jsonText(row.base.identifiers),
        sources: jsonText(row.base.sources),
        createdAt: row.base.createdAt,
        updatedAt: row.base.updatedAt,
      })),
      options.maxStatementBytes,
    ),
    ...buildInsertStatements(
      'ssAddressImportResolvedI18n',
      RESOLVED_I18N_COLUMNS,
      artifact.rows.flatMap(row =>
        row.i18n.map(localized => ({
          runId,
          addressId: row.addressId,
          versionHash: row.versionHash,
          snapshotId: localized.snapshotId,
          locale: localized.locale,
          formattedAddress: localized.formattedAddress,
          buildingName: localized.buildingName,
          buildingNumberFrom: localized.buildingNumberFrom,
          buildingNumberTo: localized.buildingNumberTo,
          blockType: localized.blockType,
          blockNumber: localized.blockNumber,
          blockTypeBeforeNumber: localized.blockTypeBeforeNumber,
          phaseName: localized.phaseName,
          phaseNumber: localized.phaseNumber,
          estateName: localized.estateName,
          streetNumber: localized.streetNumber,
          streetName: localized.streetName,
          createdAt: localized.createdAt,
          updatedAt: localized.updatedAt,
        })),
      ),
      options.maxStatementBytes,
    ),
  ]

  return [
    buildSqlImportFile('history', `${runId}-history-${artifact.rowStart}.sql`, [
      ...rowStatements,
      buildAddressHistoryApplySql(message, runId),
    ]),
    buildSqlImportFile('current', `${runId}-current-${artifact.rowStart}.sql`, [
      ...rowStatements,
      buildAddressCurrentApplySql(runId),
    ]),
  ]
}

export function buildAddressSqlCleanupFile(
  message: DatasetProcessingMessage,
  target: AddressSqlImportTarget,
  options: AddressSqlImportBuildOptions = {},
) {
  const runId = options.runId ?? buildAddressSqlImportRunId(message)
  const statements =
    target === 'source'
      ? [
          `DELETE FROM ssAddressImportRows WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM ssAddressImportI18n WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM ssAddressImportSourceChanged WHERE runId = ${sqlLiteral(runId)};`,
        ]
      : [
          `DELETE FROM ssAddressImportResolvedRows WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM ssAddressImportResolvedI18n WHERE runId = ${sqlLiteral(runId)};`,
        ]

  return buildSqlImportFile(target, `${runId}-${target}-cleanup.sql`, statements)
}

function buildAddressNormalizedStagingSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS ssAddressImportRows (
  runId TEXT NOT NULL,
  rowNumber INTEGER NOT NULL,
  source TEXT NOT NULL,
  sourceVersion TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  matchKey TEXT,
  sourcePayloadHash TEXT,
  regionCode TEXT NOT NULL,
  divisionSnapshotId TEXT,
  streetSnapshotId TEXT,
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
  rawPayload TEXT,
  PRIMARY KEY (runId, sourceRecordId)
);
CREATE INDEX IF NOT EXISTS ssAddressImportRows_run_row_idx ON ssAddressImportRows (runId, rowNumber);
CREATE INDEX IF NOT EXISTS ssAddressImportRows_run_match_idx ON ssAddressImportRows (runId, matchKey);
CREATE TABLE IF NOT EXISTS ssAddressImportI18n (
  runId TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  locale TEXT NOT NULL,
  formattedAddress TEXT,
  buildingName TEXT,
  buildingNumberFrom TEXT,
  buildingNumberTo TEXT,
  blockType TEXT,
  blockNumber TEXT,
  blockTypeBeforeNumber INTEGER,
  phaseName TEXT,
  phaseNumber TEXT,
  estateName TEXT,
  streetNumber TEXT,
  streetName TEXT,
  PRIMARY KEY (runId, sourceRecordId, locale)
);
CREATE TABLE IF NOT EXISTS ssAddressImportSourceChanged (
  runId TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  PRIMARY KEY (runId, sourceRecordId)
);`.trim()
}

function buildAddressResolvedStagingSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS ssAddressImportResolvedRows (
  runId TEXT NOT NULL,
  rowNumber INTEGER NOT NULL,
  sourceRecordId TEXT NOT NULL,
  addressId TEXT NOT NULL,
  changed INTEGER NOT NULL,
  changedExistingId TEXT,
  versionHash TEXT NOT NULL,
  snapshotId TEXT NOT NULL,
  divisionSnapshotId TEXT NOT NULL,
  streetSnapshotId TEXT,
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
  PRIMARY KEY (runId, addressId)
);
CREATE INDEX IF NOT EXISTS ssAddressImportResolvedRows_run_changed_idx ON ssAddressImportResolvedRows (runId, changed);
CREATE INDEX IF NOT EXISTS ssAddressImportResolvedRows_run_row_idx ON ssAddressImportResolvedRows (runId, rowNumber);
CREATE TABLE IF NOT EXISTS ssAddressImportResolvedI18n (
  runId TEXT NOT NULL,
  addressId TEXT NOT NULL,
  versionHash TEXT NOT NULL,
  snapshotId TEXT NOT NULL,
  locale TEXT NOT NULL,
  formattedAddress TEXT NOT NULL,
  buildingName TEXT,
  buildingNumberFrom TEXT,
  buildingNumberTo TEXT,
  blockType TEXT,
  blockNumber TEXT,
  blockTypeBeforeNumber INTEGER,
  phaseName TEXT,
  phaseNumber TEXT,
  estateName TEXT,
  streetNumber TEXT,
  streetName TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  PRIMARY KEY (runId, addressId, locale)
);`.trim()
}

function buildAddressSourceApplySql(message: DatasetProcessingMessage, runId: string) {
  return message.source === 'overture'
    ? buildOvertureSourceApplySql(message, runId)
    : buildHkgovSourceApplySql(message, runId)
}

function buildOvertureSourceApplySql(message: DatasetProcessingMessage, runId: string) {
  const releaseId = sqlLiteral(buildSourceReleaseId(message))
  const datasetId = sqlLiteral(buildSourceDatasetId(message))
  const sourceVersion = sqlLiteral(message.sourceVersion)
  const run = sqlLiteral(runId)

  return `
DELETE FROM ssAddressImportSourceChanged WHERE runId = ${run};
INSERT OR IGNORE INTO ssAddressImportSourceChanged (runId, sourceRecordId)
SELECT r.runId, r.sourceRecordId
FROM ssAddressImportRows r
LEFT JOIN sourceOvertureAddresses2d current ON current.sourceRecordId = r.sourceRecordId
WHERE r.runId = ${run}
  AND (current.sourceRecordId IS NULL OR COALESCE(current.sourcePayloadHash, '') <> COALESCE(r.sourcePayloadHash, ''));
UPDATE sourceOvertureAddresses2dVersions
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = cast(unixepoch('subsecond') * 1000 as integer)
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportSourceChanged changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = sourceOvertureAddresses2dVersions.sourceRecordId
  );
UPDATE sourceOvertureAddress2dI18nVersions
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = cast(unixepoch('subsecond') * 1000 as integer)
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportSourceChanged changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = sourceOvertureAddress2dI18nVersions.sourceRecordId
  );
DELETE FROM sourceOvertureAddress2dI18n
WHERE EXISTS (
  SELECT 1 FROM ssAddressImportSourceChanged changed
  WHERE changed.runId = ${run}
    AND changed.sourceRecordId = sourceOvertureAddress2dI18n.sourceRecordId
);
INSERT INTO sourceOvertureAddresses2d (
  releaseId, datasetId, sourceRecordId, sourcePayloadHash, regionCode, version,
  geometry, bbox, streetName, streetNumber, sources, rawProperties
)
SELECT
  ${releaseId}, ${datasetId}, r.sourceRecordId, r.sourcePayloadHash, r.regionCode,
  CAST(json_extract(r.rawPayload, '$.version') AS INTEGER),
  r.geometry, r.bbox,
  (SELECT i.streetName FROM ssAddressImportI18n i WHERE i.runId = r.runId AND i.sourceRecordId = r.sourceRecordId AND i.locale = 'en'),
  (SELECT i.streetNumber FROM ssAddressImportI18n i WHERE i.runId = r.runId AND i.sourceRecordId = r.sourceRecordId AND i.locale = 'en'),
  r.sources, r.rawPayload
FROM ssAddressImportRows r
WHERE r.runId = ${run}
ON CONFLICT(sourceRecordId) DO UPDATE SET
  releaseId = excluded.releaseId,
  datasetId = excluded.datasetId,
  sourcePayloadHash = excluded.sourcePayloadHash,
  regionCode = excluded.regionCode,
  version = excluded.version,
  geometry = excluded.geometry,
  bbox = excluded.bbox,
  streetName = excluded.streetName,
  streetNumber = excluded.streetNumber,
  sources = excluded.sources,
  rawProperties = excluded.rawProperties,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);
INSERT INTO sourceOvertureAddress2dI18n (sourceRecordId, locale, streetName, locality, region, country)
SELECT i.sourceRecordId, i.locale, i.streetName, NULL, NULL, NULL
FROM ssAddressImportI18n i
WHERE i.runId = ${run}
  AND EXISTS (
    SELECT 1 FROM ssAddressImportSourceChanged changed
    WHERE changed.runId = i.runId AND changed.sourceRecordId = i.sourceRecordId
  )
ON CONFLICT(sourceRecordId, locale) DO UPDATE SET
  streetName = excluded.streetName,
  locality = excluded.locality,
  region = excluded.region,
  country = excluded.country;
INSERT INTO sourceOvertureAddresses2dVersions (
  sourceRecordId, regionCode, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  version, geometry, bbox, streetName, streetNumber, sources, rawProperties
)
SELECT
  r.sourceRecordId, r.regionCode, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  CAST(json_extract(r.rawPayload, '$.version') AS INTEGER),
  r.geometry, r.bbox,
  (SELECT i.streetName FROM ssAddressImportI18n i WHERE i.runId = r.runId AND i.sourceRecordId = r.sourceRecordId AND i.locale = 'en'),
  (SELECT i.streetNumber FROM ssAddressImportI18n i WHERE i.runId = r.runId AND i.sourceRecordId = r.sourceRecordId AND i.locale = 'en'),
  r.sources, r.rawPayload
FROM ssAddressImportRows r
WHERE r.runId = ${run}
  AND EXISTS (SELECT 1 FROM ssAddressImportSourceChanged changed WHERE changed.runId = r.runId AND changed.sourceRecordId = r.sourceRecordId)
ON CONFLICT(sourceRecordId, versionHash) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);
INSERT INTO sourceOvertureAddress2dI18nVersions (
  sourceRecordId, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  locale, streetName, locality, region, country
)
SELECT i.sourceRecordId, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  i.locale, i.streetName, NULL, NULL, NULL
FROM ssAddressImportI18n i
INNER JOIN ssAddressImportRows r ON r.runId = i.runId AND r.sourceRecordId = i.sourceRecordId
WHERE i.runId = ${run}
  AND EXISTS (SELECT 1 FROM ssAddressImportSourceChanged changed WHERE changed.runId = i.runId AND changed.sourceRecordId = i.sourceRecordId)
ON CONFLICT(sourceRecordId, versionHash, locale) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  streetName = excluded.streetName,
  locality = excluded.locality,
  region = excluded.region,
  country = excluded.country,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);`.trim()
}

function buildHkgovSourceApplySql(message: DatasetProcessingMessage, runId: string) {
  const releaseId = sqlLiteral(buildSourceReleaseId(message))
  const datasetId = sqlLiteral(buildSourceDatasetId(message))
  const sourceVersion = sqlLiteral(message.sourceVersion)
  const run = sqlLiteral(runId)

  return `
DELETE FROM ssAddressImportSourceChanged WHERE runId = ${run};
INSERT OR IGNORE INTO ssAddressImportSourceChanged (runId, sourceRecordId)
SELECT r.runId, r.sourceRecordId
FROM ssAddressImportRows r
LEFT JOIN sourceHkgovAlsAddresses2d current ON current.sourceRecordId = r.sourceRecordId
WHERE r.runId = ${run}
  AND (current.sourceRecordId IS NULL OR COALESCE(current.sourcePayloadHash, '') <> COALESCE(r.sourcePayloadHash, ''));
UPDATE sourceHkgovAlsAddresses2dVersions
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = cast(unixepoch('subsecond') * 1000 as integer)
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportSourceChanged changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = sourceHkgovAlsAddresses2dVersions.sourceRecordId
  );
UPDATE sourceHkgovAlsAddress2dI18nVersions
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = cast(unixepoch('subsecond') * 1000 as integer)
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportSourceChanged changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = sourceHkgovAlsAddress2dI18nVersions.sourceRecordId
  );
DELETE FROM sourceHkgovAlsAddress2dI18n
WHERE EXISTS (
  SELECT 1 FROM ssAddressImportSourceChanged changed
  WHERE changed.runId = ${run}
    AND changed.sourceRecordId = sourceHkgovAlsAddress2dI18n.sourceRecordId
);
INSERT INTO sourceHkgovAlsAddresses2d (
  releaseId, datasetId, sourceRecordId, sourcePayloadHash, regionCode, geoAddress, csuId, x, y,
  geometry, districtCode, districtName, estateName, buildingName, blockNumber,
  blockDescriptor, phaseName, phaseNumber, floor, unit, streetNumber, streetName,
  villageName, dataOwner, rawPayload
)
SELECT
  ${releaseId}, ${datasetId}, r.sourceRecordId, r.sourcePayloadHash, r.regionCode,
  ${jsonTextValue('r.rawPayload', 'geoAddress')},
  COALESCE(${jsonTextValue('r.rawPayload', 'hkgovCsuId')}, ${jsonTextValue('r.rawPayload', 'geoAddress')}),
  CAST(json_extract(r.rawPayload, '$.easting') AS REAL),
  CAST(json_extract(r.rawPayload, '$.northing') AS REAL),
  r.geometry,
  NULL,
  COALESCE(${jsonTextValue('r.rawPayload', 'enDistrict')}, ${jsonTextValue('r.rawPayload', 'zhHantDistrict')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enEstateName')}, ${jsonTextValue('r.rawPayload', 'zhHantEstateName')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enBuildingName')}, ${jsonTextValue('r.rawPayload', 'zhHantBuildingName')}),
  NULL, NULL, NULL, NULL, NULL, NULL,
  COALESCE(${jsonTextValue('r.rawPayload', 'enStreetNumberFrom')}, ${jsonTextValue('r.rawPayload', 'zhHantStreetNumberFrom')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enStreetName')}, ${jsonTextValue('r.rawPayload', 'zhHantStreetName')}),
  NULL,
  'hkgov-als',
  r.rawPayload
FROM ssAddressImportRows r
WHERE r.runId = ${run}
ON CONFLICT(sourceRecordId) DO UPDATE SET
  releaseId = excluded.releaseId,
  datasetId = excluded.datasetId,
  sourcePayloadHash = excluded.sourcePayloadHash,
  regionCode = excluded.regionCode,
  geoAddress = excluded.geoAddress,
  csuId = excluded.csuId,
  x = excluded.x,
  y = excluded.y,
  geometry = excluded.geometry,
  districtCode = excluded.districtCode,
  districtName = excluded.districtName,
  estateName = excluded.estateName,
  buildingName = excluded.buildingName,
  blockNumber = excluded.blockNumber,
  blockDescriptor = excluded.blockDescriptor,
  phaseName = excluded.phaseName,
  phaseNumber = excluded.phaseNumber,
  floor = excluded.floor,
  unit = excluded.unit,
  streetNumber = excluded.streetNumber,
  streetName = excluded.streetName,
  villageName = excluded.villageName,
  dataOwner = excluded.dataOwner,
  rawPayload = excluded.rawPayload,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);
INSERT INTO sourceHkgovAlsAddress2dI18n (
  sourceRecordId, locale, formattedAddress, buildingName, buildingNumberFrom,
  buildingNumberTo, blockType, blockNumber, blockTypeBeforeNumber, phaseName,
  phaseNumber, estateName, streetNumber, streetName, villageName, districtName
)
SELECT i.sourceRecordId, i.locale, i.formattedAddress, i.buildingName, i.buildingNumberFrom,
  i.buildingNumberTo, i.blockType, i.blockNumber, i.blockTypeBeforeNumber, i.phaseName,
  i.phaseNumber, i.estateName, i.streetNumber, i.streetName, NULL,
  CASE WHEN i.locale = 'zh-hant' THEN ${jsonTextValue('r.rawPayload', 'zhHantDistrict')} ELSE ${jsonTextValue('r.rawPayload', 'enDistrict')} END
FROM ssAddressImportI18n i
INNER JOIN ssAddressImportRows r ON r.runId = i.runId AND r.sourceRecordId = i.sourceRecordId
WHERE i.runId = ${run}
  AND EXISTS (SELECT 1 FROM ssAddressImportSourceChanged changed WHERE changed.runId = i.runId AND changed.sourceRecordId = i.sourceRecordId)
ON CONFLICT(sourceRecordId, locale) DO UPDATE SET
  formattedAddress = excluded.formattedAddress,
  buildingName = excluded.buildingName,
  buildingNumberFrom = excluded.buildingNumberFrom,
  buildingNumberTo = excluded.buildingNumberTo,
  blockType = excluded.blockType,
  blockNumber = excluded.blockNumber,
  blockTypeBeforeNumber = excluded.blockTypeBeforeNumber,
  phaseName = excluded.phaseName,
  phaseNumber = excluded.phaseNumber,
  estateName = excluded.estateName,
  streetNumber = excluded.streetNumber,
  streetName = excluded.streetName,
  villageName = excluded.villageName,
  districtName = excluded.districtName;
INSERT INTO sourceHkgovAlsAddresses2dVersions (
  sourceRecordId, regionCode, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  geoAddress, csuId, x, y, geometry, districtCode, districtName, estateName,
  buildingName, blockNumber, blockDescriptor, phaseName, phaseNumber, floor, unit,
  streetNumber, streetName, villageName, dataOwner, rawPayload
)
SELECT
  r.sourceRecordId, r.regionCode, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  ${jsonTextValue('r.rawPayload', 'geoAddress')},
  COALESCE(${jsonTextValue('r.rawPayload', 'hkgovCsuId')}, ${jsonTextValue('r.rawPayload', 'geoAddress')}),
  CAST(json_extract(r.rawPayload, '$.easting') AS REAL),
  CAST(json_extract(r.rawPayload, '$.northing') AS REAL),
  r.geometry,
  NULL,
  COALESCE(${jsonTextValue('r.rawPayload', 'enDistrict')}, ${jsonTextValue('r.rawPayload', 'zhHantDistrict')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enEstateName')}, ${jsonTextValue('r.rawPayload', 'zhHantEstateName')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enBuildingName')}, ${jsonTextValue('r.rawPayload', 'zhHantBuildingName')}),
  NULL, NULL, NULL, NULL, NULL, NULL,
  COALESCE(${jsonTextValue('r.rawPayload', 'enStreetNumberFrom')}, ${jsonTextValue('r.rawPayload', 'zhHantStreetNumberFrom')}),
  COALESCE(${jsonTextValue('r.rawPayload', 'enStreetName')}, ${jsonTextValue('r.rawPayload', 'zhHantStreetName')}),
  NULL,
  'hkgov-als',
  r.rawPayload
FROM ssAddressImportRows r
WHERE r.runId = ${run}
  AND EXISTS (SELECT 1 FROM ssAddressImportSourceChanged changed WHERE changed.runId = r.runId AND changed.sourceRecordId = r.sourceRecordId)
ON CONFLICT(sourceRecordId, versionHash) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);
INSERT INTO sourceHkgovAlsAddress2dI18nVersions (
  sourceRecordId, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  locale, formattedAddress, buildingName, buildingNumberFrom, buildingNumberTo,
  blockType, blockNumber, blockTypeBeforeNumber, phaseName, phaseNumber, estateName,
  streetNumber, streetName, villageName, districtName
)
SELECT i.sourceRecordId, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  i.locale, i.formattedAddress, i.buildingName, i.buildingNumberFrom, i.buildingNumberTo,
  i.blockType, i.blockNumber, i.blockTypeBeforeNumber, i.phaseName, i.phaseNumber, i.estateName,
  i.streetNumber, i.streetName, NULL,
  CASE WHEN i.locale = 'zh-hant' THEN ${jsonTextValue('r.rawPayload', 'zhHantDistrict')} ELSE ${jsonTextValue('r.rawPayload', 'enDistrict')} END
FROM ssAddressImportI18n i
INNER JOIN ssAddressImportRows r ON r.runId = i.runId AND r.sourceRecordId = i.sourceRecordId
WHERE i.runId = ${run}
  AND EXISTS (SELECT 1 FROM ssAddressImportSourceChanged changed WHERE changed.runId = i.runId AND changed.sourceRecordId = i.sourceRecordId)
ON CONFLICT(sourceRecordId, versionHash, locale) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  formattedAddress = excluded.formattedAddress,
  buildingName = excluded.buildingName,
  buildingNumberFrom = excluded.buildingNumberFrom,
  buildingNumberTo = excluded.buildingNumberTo,
  blockType = excluded.blockType,
  blockNumber = excluded.blockNumber,
  blockTypeBeforeNumber = excluded.blockTypeBeforeNumber,
  phaseName = excluded.phaseName,
  phaseNumber = excluded.phaseNumber,
  estateName = excluded.estateName,
  streetNumber = excluded.streetNumber,
  streetName = excluded.streetName,
  villageName = excluded.villageName,
  districtName = excluded.districtName,
  updatedAt = cast(unixepoch('subsecond') * 1000 as integer);`.trim()
}

function buildAddressHistoryApplySql(message: DatasetProcessingMessage, runId: string) {
  const run = sqlLiteral(runId)
  const regionCode = sqlLiteral(message.regionCode)
  const releaseId = sqlLiteral(message.releaseId ?? message.datasetId)
  const cohortKey = sqlLiteral(message.cohortKey)

  return `
UPDATE address2dVersions
SET isCurrent = 0,
  validToSnapshotId = (SELECT snapshotId FROM ssAddressImportResolvedRows WHERE runId = ${run} LIMIT 1),
  validToCohortKey = ${cohortKey},
  updatedAt = datetime('now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportResolvedRows r
    WHERE r.runId = ${run}
      AND r.changed = 1
      AND r.changedExistingId = address2dVersions.id
  );
UPDATE address2dVersionsI18n
SET isCurrent = 0,
  validToSnapshotId = (SELECT snapshotId FROM ssAddressImportResolvedRows WHERE runId = ${run} LIMIT 1),
  updatedAt = datetime('now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ssAddressImportResolvedRows r
    WHERE r.runId = ${run}
      AND r.changed = 1
      AND r.changedExistingId = address2dVersionsI18n.addressId
  );
INSERT INTO address2dVersions (
  id, regionCode, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId,
  validToSnapshotId, validFromCohortKey, validToCohortKey, isCurrent, streetId,
  hamletId, microhoodId, villageId, neighbourhoodId, macrohoodId, townId,
  districtId, areaId, countryId, geometry, bbox, identifiers, sources, createdAt, updatedAt
)
SELECT
  r.addressId, ${regionCode}, r.versionHash, ${releaseId}, r.snapshotId, r.snapshotId,
  NULL, ${cohortKey}, NULL, 1, r.streetId, r.hamletId, r.microhoodId, r.villageId,
  r.neighbourhoodId, r.macrohoodId, r.townId, r.districtId, r.areaId, r.countryId,
  r.geometry, r.bbox, r.identifiers, r.sources, r.createdAt, r.updatedAt
FROM ssAddressImportResolvedRows r
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(id, versionHash) DO UPDATE SET
  isCurrent = 1,
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  validFromSnapshotId = excluded.validFromSnapshotId,
  validFromCohortKey = excluded.validFromCohortKey,
  validToSnapshotId = NULL,
  validToCohortKey = NULL,
  updatedAt = excluded.updatedAt;
INSERT INTO address2dVersionsI18n (
  addressId, versionHash, sourceReleaseId, snapshotId, validFromSnapshotId,
  validToSnapshotId, isCurrent, locale, formattedAddress, buildingName,
  buildingNumberFrom, buildingNumberTo, blockType, blockNumber,
  blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber,
  streetName, createdAt, updatedAt
)
SELECT
  i.addressId, i.versionHash, ${releaseId}, i.snapshotId, i.snapshotId, NULL, 1,
  i.locale, i.formattedAddress, i.buildingName, i.buildingNumberFrom,
  i.buildingNumberTo, i.blockType, i.blockNumber, i.blockTypeBeforeNumber,
  i.phaseName, i.phaseNumber, i.estateName, i.streetNumber, i.streetName,
  i.createdAt, i.updatedAt
FROM ssAddressImportResolvedI18n i
WHERE i.runId = ${run}
  AND EXISTS (
    SELECT 1 FROM ssAddressImportResolvedRows r
    WHERE r.runId = i.runId AND r.addressId = i.addressId AND r.changed = 1
  )
ON CONFLICT(addressId, versionHash, locale) DO UPDATE SET
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  validFromSnapshotId = excluded.validFromSnapshotId,
  validToSnapshotId = NULL,
  isCurrent = 1,
  formattedAddress = excluded.formattedAddress,
  buildingName = excluded.buildingName,
  buildingNumberFrom = excluded.buildingNumberFrom,
  buildingNumberTo = excluded.buildingNumberTo,
  blockType = excluded.blockType,
  blockNumber = excluded.blockNumber,
  blockTypeBeforeNumber = excluded.blockTypeBeforeNumber,
  phaseName = excluded.phaseName,
  phaseNumber = excluded.phaseNumber,
  estateName = excluded.estateName,
  streetNumber = excluded.streetNumber,
  streetName = excluded.streetName,
  updatedAt = excluded.updatedAt;`.trim()
}

function buildAddressCurrentApplySql(runId: string) {
  const run = sqlLiteral(runId)

  return `
INSERT INTO address2d (
  snapshotId, id, geometry, bbox, divisionSnapshotId, countryId, areaId,
  districtId, townId, macrohoodId, villageId, neighbourhoodId, hamletId,
  microhoodId, streetSnapshotId, streetId, identifiers, sources, createdAt, updatedAt
)
SELECT
  r.snapshotId, r.addressId, r.geometry, r.bbox, r.divisionSnapshotId, r.countryId,
  r.areaId, r.districtId, r.townId, r.macrohoodId, r.villageId, r.neighbourhoodId,
  r.hamletId, r.microhoodId, r.streetSnapshotId, r.streetId, r.identifiers,
  r.sources, r.createdAt, r.updatedAt
FROM ssAddressImportResolvedRows r
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(snapshotId, id) DO UPDATE SET
  divisionSnapshotId = excluded.divisionSnapshotId,
  streetSnapshotId = excluded.streetSnapshotId,
  streetId = excluded.streetId,
  hamletId = excluded.hamletId,
  microhoodId = excluded.microhoodId,
  villageId = excluded.villageId,
  neighbourhoodId = excluded.neighbourhoodId,
  macrohoodId = excluded.macrohoodId,
  townId = excluded.townId,
  districtId = excluded.districtId,
  areaId = excluded.areaId,
  countryId = excluded.countryId,
  geometry = excluded.geometry,
  identifiers = excluded.identifiers,
  bbox = excluded.bbox,
  sources = excluded.sources,
  updatedAt = excluded.updatedAt;
DELETE FROM address2dI18n
WHERE EXISTS (
  SELECT 1 FROM ssAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.changed = 1
    AND r.snapshotId = address2dI18n.snapshotId
    AND r.addressId = address2dI18n.addressId
);
INSERT INTO address2dI18n (
  snapshotId, addressId, locale, formattedAddress, buildingName,
  buildingNumberFrom, buildingNumberTo, blockType, blockNumber,
  blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber,
  streetName, createdAt, updatedAt
)
SELECT
  i.snapshotId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
  i.buildingNumberFrom, i.buildingNumberTo, i.blockType, i.blockNumber,
  i.blockTypeBeforeNumber, i.phaseName, i.phaseNumber, i.estateName,
  i.streetNumber, i.streetName, i.createdAt, i.updatedAt
FROM ssAddressImportResolvedI18n i
WHERE i.runId = ${run}
  AND EXISTS (
    SELECT 1 FROM ssAddressImportResolvedRows r
    WHERE r.runId = i.runId AND r.addressId = i.addressId AND r.changed = 1
  )
ON CONFLICT(snapshotId, addressId, locale) DO UPDATE SET
  formattedAddress = excluded.formattedAddress,
  buildingName = excluded.buildingName,
  buildingNumberFrom = excluded.buildingNumberFrom,
  buildingNumberTo = excluded.buildingNumberTo,
  blockType = excluded.blockType,
  blockNumber = excluded.blockNumber,
  blockTypeBeforeNumber = excluded.blockTypeBeforeNumber,
  phaseName = excluded.phaseName,
  phaseNumber = excluded.phaseNumber,
  estateName = excluded.estateName,
  streetNumber = excluded.streetNumber,
  streetName = excluded.streetName,
  updatedAt = excluded.updatedAt;
UPDATE address2d
SET updatedAt = (
  SELECT r.updatedAt FROM ssAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.snapshotId = address2d.snapshotId
    AND r.addressId = address2d.id
)
WHERE EXISTS (
  SELECT 1 FROM ssAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.snapshotId = address2d.snapshotId
    AND r.addressId = address2d.id
);`.trim()
}

function buildInsertStatements(
  tableName: string,
  columns: readonly string[],
  rows: SqlInsertRow[],
  maxStatementBytes = DEFAULT_MAX_STATEMENT_BYTES,
) {
  if (rows.length === 0) {
    return []
  }

  const statements: string[] = []
  let currentValues: string[] = []
  let currentPrefix = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES `

  for (const row of rows) {
    const valueSql = `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`
    const candidate = `${currentPrefix}${[...currentValues, valueSql].join(', ')};`

    if (
      currentValues.length > 0 &&
      SQL_TEXT_ENCODER.encode(candidate).byteLength > maxStatementBytes
    ) {
      statements.push(`${currentPrefix}${currentValues.join(', ')};`)
      currentValues = [valueSql]
      currentPrefix = `INSERT OR REPLACE INTO ${tableName} (${columns.join(', ')}) VALUES `
      continue
    }

    currentValues.push(valueSql)
  }

  if (currentValues.length > 0) {
    statements.push(`${currentPrefix}${currentValues.join(', ')};`)
  }

  return statements
}

function buildSqlImportFile(
  target: AddressSqlImportTarget,
  filename: string,
  statements: string[],
): AddressSqlImportFile {
  const sql = `${statements.filter(Boolean).join('\n\n')}\n`

  return {
    bytes: SQL_TEXT_ENCODER.encode(sql).byteLength,
    filename,
    sql,
    statementCount: statements.reduce(
      (count, statement) => count + statement.split(';').filter(Boolean).length,
      0,
    ),
    target,
  }
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL'
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }

  return `'${String(value).replaceAll("'", "''")}'`
}

function jsonText(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value)
}

function jsonTextValue(jsonColumn: string, key: string) {
  return `NULLIF(TRIM(CAST(json_extract(${jsonColumn}, '$.${key}') AS TEXT)), '')`
}
