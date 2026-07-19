import type { DatasetProcessingMessage } from '../../../types'
import { buildDeterministicUuidV5 } from '@repo/db'

import type {
  NormalizedAddressChunkArtifact,
  ResolvedAddressChunkArtifact,
} from './types'
import { buildSourceReleaseId } from '../../db/source'

export type AddressSqlImportTarget =
  | 'source'
  | 'history'
  | 'history-apply'
  | 'current'
  | 'meta'

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

const DEFAULT_MAX_STATEMENT_BYTES = 99_000
const SQL_TEXT_ENCODER = new TextEncoder()
const NORMALIZED_ROWS_TABLE = 'stagingAddresses2d'
const NORMALIZED_I18N_TABLE = 'stagingAddresses2dI18n'
const SOURCE_CHANGED_TABLE = 'stagingAddresses2dChanged'
const RESOLVED_ROWS_TABLE = 'zzAddressImportResolvedRows'
const RESOLVED_I18N_TABLE = 'zzAddressImportResolvedI18n'
const ADDRESS_ALIAS_ID_NAMESPACE = 'dd44d1a8-4b17-58a1-b1db-8dc8a40f180a'

const NORMALIZED_ROW_COLUMNS = [
  'runId',
  'rowNumber',
  'source',
  'sourceVersion',
  'sourceRecordId',
  'matchKey',
  'sourcePayloadHash',
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
  'rawProperties',
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
    `DELETE FROM ${NORMALIZED_ROWS_TABLE} WHERE runId = ${sqlLiteral(runId)};`,
    `DELETE FROM ${NORMALIZED_I18N_TABLE} WHERE runId = ${sqlLiteral(runId)};`,
    ...buildInsertStatements(
      NORMALIZED_ROWS_TABLE,
      NORMALIZED_ROW_COLUMNS,
      artifact.rows.map((row, index) => ({
        runId,
        rowNumber: artifact.rowStart + index,
        source: message.source,
        sourceVersion: message.sourceVersion,
        sourceRecordId: row.sourceId,
        matchKey: row.matchKey,
        sourcePayloadHash: row.sourcePayloadHash,
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
        rawProperties: jsonText(row.raw),
      })),
      options.maxStatementBytes,
    ),
    ...buildInsertStatements(
      NORMALIZED_I18N_TABLE,
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

  const files = [
    buildSqlImportFile(
      'source',
      `${runId}-source-${artifact.rowStart}.sql`,
      statements,
    ),
  ]

  if (message.source === 'hkgov-dpo') {
    const aliasRows = artifact.rows.flatMap(row => {
      const aliasValue = asNonEmptyString(row.raw.identityAlias)
      const canonicalId = asNonEmptyString(row.raw.canonicalId)
      if (!aliasValue || !canonicalId || aliasValue === canonicalId) return []
      const now = artifact.processingRunStartedAt

      return [
        {
          aliasId: buildDeterministicUuidV5(
            ADDRESS_ALIAS_ID_NAMESPACE,
            `address:${aliasValue}`,
          ),
          entityType: 'address',
          aliasValue,
          canonicalId,
          sourceSystem: 'hkgov-dpo',
          isCurrent: true,
          notes: `ALS identity promoted by ${asNonEmptyString(row.raw.identityMatchMethod) ?? 'bridge'}.`,
          createdAt: now,
          updatedAt: now,
        },
      ]
    })

    if (aliasRows.length > 0) {
      files.push(
        buildSqlImportFile(
          'meta',
          `${runId}-identity-alias-${artifact.rowStart}.sql`,
          buildInsertStatements(
            'entityAliases',
            [
              'aliasId',
              'entityType',
              'aliasValue',
              'canonicalId',
              'sourceSystem',
              'isCurrent',
              'notes',
              'createdAt',
              'updatedAt',
            ],
            aliasRows,
            options.maxStatementBytes,
            { mode: 'ignore' },
          ),
        ),
      )
    }
  }

  return files
}

export function buildAddressResolvedSqlImportFiles(
  message: DatasetProcessingMessage,
  artifact: ResolvedAddressChunkArtifact,
  options: AddressSqlImportBuildOptions = {},
): AddressSqlImportFile[] {
  const runId = options.runId ?? buildAddressSqlImportRunId(message)
  const historyStatements = [
    buildAddressResolvedStagingSchemaSql(),
    ...(artifact.rowStart === 0
      ? [
          `DELETE FROM zzAddressImportResolvedRows WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM zzAddressImportResolvedI18n WHERE runId = ${sqlLiteral(runId)};`,
        ]
      : []),
    ...buildInsertStatements(
      'zzAddressImportResolvedRows',
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
      'zzAddressImportResolvedI18n',
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
  const currentStatements = [
    buildAddressResolvedStagingSchemaSql(),
    `DELETE FROM zzAddressImportResolvedRows WHERE runId = ${sqlLiteral(runId)};`,
    `DELETE FROM zzAddressImportResolvedI18n WHERE runId = ${sqlLiteral(runId)};`,
    ...buildInsertStatements(
      'zzAddressImportResolvedRows',
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
      {
        mode: 'insert',
      },
    ),
    ...buildInsertStatements(
      'zzAddressImportResolvedI18n',
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
      {
        mode: 'insert',
      },
    ),
  ]

  return [
    buildSqlImportFile('history', `${runId}-history-${artifact.rowStart}.sql`, [
      ...historyStatements,
    ]),
    buildSqlImportFile('current', `${runId}-current-${artifact.rowStart}.sql`, [
      ...currentStatements,
      buildAddressCurrentApplySql(runId),
      buildAddressResolvedStagingDropSql(),
    ]),
  ]
}

export function buildAddressHistoryApplySqlImportFile(
  message: DatasetProcessingMessage,
  options: AddressSqlImportBuildOptions & {
    hasChanges: boolean
    snapshotId: string
  },
) {
  const runId = options.runId ?? buildAddressSqlImportRunId(message)
  const statements = options.hasChanges
    ? [
        buildAddressHistoryApplySql(message, runId, options.snapshotId),
        buildAddressResolvedStagingDropSql(),
      ]
    : [buildAddressResolvedStagingDropSql()]

  return buildSqlImportFile('history-apply', `${runId}-history-apply.sql`, statements)
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
          `DELETE FROM ${NORMALIZED_ROWS_TABLE} WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM ${NORMALIZED_I18N_TABLE} WHERE runId = ${sqlLiteral(runId)};`,
          `DELETE FROM ${SOURCE_CHANGED_TABLE} WHERE runId = ${sqlLiteral(runId)};`,
        ]
      : [buildAddressResolvedStagingDropSql()]

  return buildSqlImportFile(target, `${runId}-${target}-cleanup.sql`, statements)
}

function buildAddressNormalizedStagingSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS ${NORMALIZED_ROWS_TABLE} (
  runId TEXT NOT NULL,
  rowNumber INTEGER NOT NULL,
  source TEXT NOT NULL,
  sourceVersion TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  matchKey TEXT,
  sourcePayloadHash TEXT,
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
  rawProperties TEXT,
  PRIMARY KEY (runId, sourceRecordId)
);
CREATE INDEX IF NOT EXISTS ${NORMALIZED_ROWS_TABLE}_run_row_idx ON ${NORMALIZED_ROWS_TABLE} (runId, rowNumber);
CREATE INDEX IF NOT EXISTS ${NORMALIZED_ROWS_TABLE}_run_match_idx ON ${NORMALIZED_ROWS_TABLE} (runId, matchKey);
CREATE TABLE IF NOT EXISTS ${NORMALIZED_I18N_TABLE} (
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
CREATE TABLE IF NOT EXISTS ${SOURCE_CHANGED_TABLE} (
  runId TEXT NOT NULL,
  sourceRecordId TEXT NOT NULL,
  PRIMARY KEY (runId, sourceRecordId)
);`.trim()
}

function buildAddressResolvedStagingSchemaSql() {
  return `
CREATE TABLE IF NOT EXISTS zzAddressImportResolvedRows (
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
CREATE INDEX IF NOT EXISTS zzAddressImportResolvedRows_run_changed_existing_idx ON zzAddressImportResolvedRows (runId, changed, changedExistingId);
CREATE INDEX IF NOT EXISTS zzAddressImportResolvedRows_run_address_changed_idx ON zzAddressImportResolvedRows (runId, addressId, changed);
CREATE INDEX IF NOT EXISTS zzAddressImportResolvedRows_run_row_idx ON zzAddressImportResolvedRows (runId, rowNumber);
CREATE TABLE IF NOT EXISTS zzAddressImportResolvedI18n (
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
);
CREATE INDEX IF NOT EXISTS zzAddressImportResolvedI18n_run_address_idx ON zzAddressImportResolvedI18n (runId, addressId);`.trim()
}

function buildAddressResolvedStagingDropSql() {
  return `
DROP TABLE IF EXISTS ${RESOLVED_I18N_TABLE};
DROP TABLE IF EXISTS ${RESOLVED_ROWS_TABLE};`.trim()
}

function buildAddressSourceApplySql(message: DatasetProcessingMessage, runId: string) {
  return buildHkgovSourceApplySql(message, runId)
}

function buildHkgovSourceApplySql(message: DatasetProcessingMessage, runId: string) {
  const releaseId = sqlLiteral(buildSourceReleaseId(message))
  const sourceVersion = sqlLiteral(message.sourceVersion)
  const run = sqlLiteral(runId)

  return `
DELETE FROM ${SOURCE_CHANGED_TABLE} WHERE runId = ${run};
INSERT OR IGNORE INTO ${SOURCE_CHANGED_TABLE} (runId, sourceRecordId)
SELECT r.runId, r.sourceRecordId
FROM ${NORMALIZED_ROWS_TABLE} r
LEFT JOIN hkgovAlsAddresses2d current
  ON current.sourceRecordId = r.sourceRecordId
  AND current.isCurrent = 1
WHERE r.runId = ${run}
  AND (current.sourceRecordId IS NULL OR COALESCE(current.versionHash, '') <> COALESCE(r.sourcePayloadHash, ''));
UPDATE hkgovAlsAddresses2d
SET releaseId = ${releaseId}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1
    FROM ${NORMALIZED_ROWS_TABLE} r
    WHERE r.runId = ${run}
      AND r.sourceRecordId = hkgovAlsAddresses2d.sourceRecordId
      AND COALESCE(r.sourcePayloadHash, '') = COALESCE(hkgovAlsAddresses2d.versionHash, '')
  );
UPDATE hkgovAlsAddress2dI18n
SET releaseId = ${releaseId}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1
    FROM ${NORMALIZED_ROWS_TABLE} r
    WHERE r.runId = ${run}
      AND r.sourceRecordId = hkgovAlsAddress2dI18n.sourceRecordId
      AND COALESCE(r.sourcePayloadHash, '') = COALESCE(hkgovAlsAddress2dI18n.versionHash, '')
  );
UPDATE hkgovAlsAddresses2d
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ${SOURCE_CHANGED_TABLE} changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = hkgovAlsAddresses2d.sourceRecordId
  );
UPDATE hkgovAlsAddress2dI18n
SET isCurrent = 0, validToRelease = ${sourceVersion}, updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE isCurrent = 1
  AND EXISTS (
    SELECT 1 FROM ${SOURCE_CHANGED_TABLE} changed
    WHERE changed.runId = ${run}
      AND changed.sourceRecordId = hkgovAlsAddress2dI18n.sourceRecordId
  );
INSERT INTO hkgovAlsAddresses2d (
  sourceRecordId, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  identifiers, easting, northing, geometry, districtCode, districtName, estateName,
  buildingName, blockNumber, blockDescriptor, phaseName, phaseNumber, floor, unit,
  streetNumber, streetName, villageName, sources, rawProperties
)
SELECT
  r.sourceRecordId, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  json_object(
    'geoAddress', ${jsonTextValue('r.rawProperties', 'geoAddress')},
    'csuId', COALESCE(${jsonTextValue('r.rawProperties', 'hkgovCsuId')}, ${jsonTextValue('r.rawProperties', 'geoAddress')})
  ),
  CAST(json_extract(r.rawProperties, '$.easting') AS REAL),
  CAST(json_extract(r.rawProperties, '$.northing') AS REAL),
  r.geometry,
  NULL,
  COALESCE(${jsonTextValue('r.rawProperties', 'enDistrict')}, ${jsonTextValue('r.rawProperties', 'zhHantDistrict')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enEstateName')}, ${jsonTextValue('r.rawProperties', 'zhHantEstateName')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enBuildingName')}, ${jsonTextValue('r.rawProperties', 'zhHantBuildingName')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enBlockNumber')}, ${jsonTextValue('r.rawProperties', 'zhHantBlockNumber')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enBlockDescriptor')}, ${jsonTextValue('r.rawProperties', 'zhHantBlockDescriptor')}),
  NULL, NULL, NULL, NULL,
  COALESCE(${jsonTextValue('r.rawProperties', 'enStreetNumberFrom')}, ${jsonTextValue('r.rawProperties', 'zhHantStreetNumberFrom')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enStreetName')}, ${jsonTextValue('r.rawProperties', 'zhHantStreetName')}),
  COALESCE(${jsonTextValue('r.rawProperties', 'enVillageName')}, ${jsonTextValue('r.rawProperties', 'zhHantVillageName')}),
  COALESCE(r.sources, json_object('hkgovAls', json_array(json_object('dataset', 'hkgov-dpo')))),
  r.rawProperties
FROM ${NORMALIZED_ROWS_TABLE} r
WHERE r.runId = ${run}
  AND EXISTS (SELECT 1 FROM ${SOURCE_CHANGED_TABLE} changed WHERE changed.runId = r.runId AND changed.sourceRecordId = r.sourceRecordId)
ON CONFLICT(sourceRecordId, versionHash) DO UPDATE SET
  releaseId = excluded.releaseId,
  validFromRelease = excluded.validFromRelease,
  validToRelease = NULL,
  isCurrent = 1,
  updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
INSERT INTO hkgovAlsAddress2dI18n (
  sourceRecordId, versionHash, releaseId, validFromRelease, validToRelease, isCurrent,
  locale, formattedAddress, buildingName, buildingNumberFrom, buildingNumberTo,
  blockType, blockNumber, blockTypeBeforeNumber, phaseName, phaseNumber, estateName,
  streetNumber, streetName, villageName, districtName
)
SELECT i.sourceRecordId, r.sourcePayloadHash, ${releaseId}, ${sourceVersion}, NULL, 1,
  i.locale, i.formattedAddress, i.buildingName, i.buildingNumberFrom, i.buildingNumberTo,
  i.blockType, i.blockNumber, i.blockTypeBeforeNumber, i.phaseName, i.phaseNumber, i.estateName,
  i.streetNumber, i.streetName,
  CASE WHEN i.locale = 'zh-hant' THEN ${jsonTextValue('r.rawProperties', 'zhHantVillageName')} ELSE ${jsonTextValue('r.rawProperties', 'enVillageName')} END,
  CASE WHEN i.locale = 'zh-hant' THEN ${jsonTextValue('r.rawProperties', 'zhHantDistrict')} ELSE ${jsonTextValue('r.rawProperties', 'enDistrict')} END
FROM ${NORMALIZED_I18N_TABLE} i
INNER JOIN ${NORMALIZED_ROWS_TABLE} r ON r.runId = i.runId AND r.sourceRecordId = i.sourceRecordId
WHERE i.runId = ${run}
  AND EXISTS (SELECT 1 FROM ${SOURCE_CHANGED_TABLE} changed WHERE changed.runId = i.runId AND changed.sourceRecordId = i.sourceRecordId)
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
  updatedAt = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`.trim()
}

function buildAddressHistoryApplySql(
  message: DatasetProcessingMessage,
  runId: string,
  snapshotId: string,
) {
  const run = sqlLiteral(runId)
  const releaseId = sqlLiteral(message.releaseId ?? message.datasetId)
  const snapshot = sqlLiteral(snapshotId)

  return `
WITH changedExisting AS (
  SELECT DISTINCT r.changedExistingId AS addressId
  FROM zzAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.changed = 1
    AND r.changedExistingId IS NOT NULL
)
UPDATE address2d
SET isCurrent = 0,
  updatedAt = datetime('now')
FROM changedExisting
WHERE address2d.isCurrent = 1
  AND address2d.id = changedExisting.addressId;
WITH changedExisting AS (
  SELECT DISTINCT r.changedExistingId AS addressId
  FROM zzAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.changed = 1
    AND r.changedExistingId IS NOT NULL
)
UPDATE address2dI18n
SET isCurrent = 0,
  updatedAt = datetime('now')
FROM changedExisting
WHERE address2dI18n.isCurrent = 1
  AND address2dI18n.addressId = changedExisting.addressId;
INSERT INTO address2d (
  id, versionHash, sourceReleaseId, snapshotId, isCurrent, streetId,
  hamletId, microhoodId, villageId, neighbourhoodId, macrohoodId, townId,
  districtId, areaId, countryId, geometry, bbox, identifiers, sources, createdAt, updatedAt
)
SELECT
  r.addressId, r.versionHash, ${releaseId}, r.snapshotId,
  1, r.streetId, r.hamletId, r.microhoodId, r.villageId,
  r.neighbourhoodId, r.macrohoodId, r.townId, r.districtId, r.areaId, r.countryId,
  r.geometry, r.bbox, r.identifiers, r.sources, r.createdAt, r.updatedAt
FROM zzAddressImportResolvedRows r
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(id, versionHash) DO UPDATE SET
  isCurrent = 1,
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
  updatedAt = excluded.updatedAt;
INSERT INTO address2dI18n (
  addressId, versionHash, sourceReleaseId, snapshotId,
  isCurrent, locale, formattedAddress, buildingName,
  buildingNumberFrom, buildingNumberTo, blockType, blockNumber,
  blockTypeBeforeNumber, phaseName, phaseNumber, estateName, streetNumber,
  streetName, createdAt, updatedAt
)
SELECT
  i.addressId, i.versionHash, ${releaseId}, i.snapshotId, 1,
  i.locale, i.formattedAddress, i.buildingName, i.buildingNumberFrom,
  i.buildingNumberTo, i.blockType, i.blockNumber, i.blockTypeBeforeNumber,
  i.phaseName, i.phaseNumber, i.estateName, i.streetNumber, i.streetName,
  i.createdAt, i.updatedAt
FROM zzAddressImportResolvedRows r
INNER JOIN zzAddressImportResolvedI18n i
  ON i.runId = r.runId
  AND i.addressId = r.addressId
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(addressId, versionHash, locale) DO UPDATE SET
  sourceReleaseId = excluded.sourceReleaseId,
  snapshotId = excluded.snapshotId,
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
  updatedAt = excluded.updatedAt;
INSERT INTO snapshotVersionChanges (
  snapshotId, recordType, recordId, locale, versionHash, operation,
  sourceReleaseId, createdAt, updatedAt
)
SELECT
  ${snapshot}, 'address2d', r.addressId, '', r.versionHash, 'upsert',
  ${releaseId}, datetime('now'), datetime('now')
FROM zzAddressImportResolvedRows r
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(snapshotId, recordType, recordId, locale) DO UPDATE SET
  versionHash = excluded.versionHash,
  operation = 'upsert',
  sourceReleaseId = excluded.sourceReleaseId,
  updatedAt = excluded.updatedAt;
INSERT INTO snapshotVersionChanges (
  snapshotId, recordType, recordId, locale, versionHash, operation,
  sourceReleaseId, createdAt, updatedAt
)
SELECT
  ${snapshot}, 'address2dI18n', i.addressId, i.locale, i.versionHash, 'upsert',
  ${releaseId}, datetime('now'), datetime('now')
FROM zzAddressImportResolvedRows r
INNER JOIN zzAddressImportResolvedI18n i
  ON i.runId = r.runId AND i.addressId = r.addressId
WHERE r.runId = ${run}
  AND r.changed = 1
ON CONFLICT(snapshotId, recordType, recordId, locale) DO UPDATE SET
  versionHash = excluded.versionHash,
  operation = 'upsert',
  sourceReleaseId = excluded.sourceReleaseId,
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
FROM zzAddressImportResolvedRows r
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
  SELECT 1 FROM zzAddressImportResolvedRows r
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
FROM zzAddressImportResolvedI18n i
WHERE i.runId = ${run}
  AND EXISTS (
    SELECT 1 FROM zzAddressImportResolvedRows r
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
  SELECT r.updatedAt FROM zzAddressImportResolvedRows r
  WHERE r.runId = ${run}
    AND r.snapshotId = address2d.snapshotId
    AND r.addressId = address2d.id
)
WHERE EXISTS (
  SELECT 1 FROM zzAddressImportResolvedRows r
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
  options: {
    mode?: 'ignore' | 'insert' | 'replace'
  } = {},
) {
  if (rows.length === 0) {
    return []
  }

  const statements: string[] = []
  let currentValues: string[] = []
  const mode = options.mode ?? 'replace'
  const verb =
    mode === 'insert'
      ? `INSERT INTO ${tableName}`
      : mode === 'ignore'
        ? `INSERT OR IGNORE INTO ${tableName}`
        : `INSERT OR REPLACE INTO ${tableName}`
  let currentPrefix = `${verb} (${columns.join(', ')}) VALUES `

  for (const row of rows) {
    const valueSql = `(${columns.map(column => sqlLiteral(row[column])).join(', ')})`
    const candidate = `${currentPrefix}${[...currentValues, valueSql].join(', ')};`

    if (
      currentValues.length > 0 &&
      SQL_TEXT_ENCODER.encode(candidate).byteLength > maxStatementBytes
    ) {
      statements.push(`${currentPrefix}${currentValues.join(', ')};`)
      currentValues = [valueSql]
      currentPrefix = `${verb} (${columns.join(', ')}) VALUES `
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

function asNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
