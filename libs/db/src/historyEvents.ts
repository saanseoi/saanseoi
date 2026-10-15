/** Canonical change identities. Composite identities use JSON arrays, never delimiters. */
export const historyEventTables = {
  division: { table: 'divisions', keys: ['id'] },
  divisionI18n: { table: 'divisionsI18n', keys: ['divisionId'], locale: 'locale' },
  divisionArea: { table: 'divisionAreas', keys: ['id'] },
  divisionBoundary: { table: 'divisionBoundaries', keys: ['id'] },
  address2d: { table: 'address2d', keys: ['id'] },
  address2dI18n: { table: 'address2dI18n', keys: ['addressId'], locale: 'locale' },
  address2dBuildingNumberLookup: {
    table: 'address2dBuildingNumberLookup',
    keys: ['addressId', 'buildingNumber'],
  },
  address3d: { table: 'address3d', keys: ['id'] },
  address3dI18n: { table: 'address3dI18n', keys: ['address3dId'], locale: 'locale' },
  place: { table: 'places', keys: ['id'] },
  placeI18n: { table: 'placesI18n', keys: ['placeId'], locale: 'locale' },
  street: { table: 'streets', keys: ['id'] },
  streetI18n: { table: 'streetsI18n', keys: ['streetId'], locale: 'locale' },
  streetGeometry: { table: 'streetGeometry', keys: ['streetId'] },
  streetNameChange: { table: 'streetNameChanges', keys: ['id'] },
  streetNameChangeStreet: {
    table: 'streetNameChangeStreets',
    keys: ['nameChangeId', 'streetId', 'role'],
  },
  streetChangelog: { table: 'streetChangelog', keys: ['streetId', 'recordKey'] },
  statsRecord: { table: 'statsRecords', keys: ['id'] },
  statsField: { table: 'statsFields', keys: ['datasetCode', 'fieldName'] },
  statsFieldI18n: {
    table: 'statsFieldsI18n',
    keys: ['datasetCode', 'fieldName'],
    locale: 'locale',
  },
  statsMeasure: { table: 'statsMeasures', keys: ['datasetCode', 'measureCode'] },
  statsMeasureI18n: {
    table: 'statsMeasuresI18n',
    keys: ['datasetCode', 'measureCode'],
    locale: 'locale',
  },
  statsValueI18n: {
    table: 'statsValuesI18n',
    keys: ['datasetCode', 'dimensionCode', 'valueCode'],
    locale: 'locale',
  },
} as const satisfies Record<
  string,
  { table: string; keys: readonly string[]; locale?: string }
>

export type HistoryRecordType = keyof typeof historyEventTables
export type HistoryEventDefinition = {
  table: string
  keys: readonly string[]
  locale?: string
}

export function historyEventDefinition(recordType: string): HistoryEventDefinition {
  const entry = historyEventTables[recordType as HistoryRecordType]
  if (!entry) throw new Error(`Unknown HISTORY record type: ${recordType}`)
  return entry
}

export function historyRecordIdSql(definition: HistoryEventDefinition, alias = '') {
  const prefix = alias ? `"${alias}".` : ''
  const keys = definition.keys.map(key => `${prefix}"${key}"`)
  return keys.length === 1 ? keys[0]! : `json_array(${keys.join(', ')})`
}

/** Read-only normalisation of inline events. This view stores no rows. */
export const historyEventsSql = historyEventsSqlForTables()

/** Partial local mirrors expose only the canonical tables they contain. */
export function historyEventsSqlForTables(tables?: ReadonlySet<string>) {
  const selects = Object.entries(historyEventTables)
    .filter(([, definition]) => !tables || tables.has(definition.table))
    .map(([type, definition]) => {
      const locale = 'locale' in definition ? `"${definition.locale}"` : "''"
      const producer = ['divisionAreas', 'divisionBoundaries'].includes(
        definition.table,
      )
        ? 'producerDatasetCode'
        : definition.table.startsWith('stats')
          ? 'datasetCode'
          : 'NULL'
      return `SELECT snapshotId, '${type}' AS recordType, ${historyRecordIdSql(definition)} AS recordId, ${locale} AS locale, versionHash, operation, createdAt, ${producer} AS producerDatasetCode FROM "${definition.table}"`
    })
  // workerd limits each compound SELECT to five terms, including stored views.
  // Group the branches so every compound remains within that limit.
  let groups = selects
  while (groups.length > 5) {
    const next: string[] = []
    for (let offset = 0; offset < groups.length; offset += 5)
      next.push(
        `SELECT * FROM (${groups.slice(offset, offset + 5).join('\nUNION ALL\n')})`,
      )
    groups = next
  }
  return groups.join('\nUNION ALL\n')
}

export type HistoryDeletion = {
  recordType: string
  recordId: string
  locale?: string
  snapshotId: string
  createdAt?: string
}

export function historyDeletionRow(input: HistoryDeletion) {
  const definition = historyEventDefinition(input.recordType)
  const keys: unknown =
    definition.keys.length === 1 ? [input.recordId] : JSON.parse(input.recordId)
  if (
    !Array.isArray(keys) ||
    keys.length !== definition.keys.length ||
    keys.some(key => typeof key !== 'string')
  )
    throw new Error(`Invalid ${input.recordType} identity`)
  const now = input.createdAt ?? new Date().toISOString()
  return {
    table: definition.table,
    row: {
      ...Object.fromEntries(definition.keys.map((key, index) => [key, keys[index]])),
      ...(definition.locale ? { [definition.locale]: input.locale ?? '' } : {}),
      snapshotId: input.snapshotId,
      operation: 'delete',
      versionHash: null,
      isCurrent: 0,
      createdAt: input.createdAt ?? now,
    },
  }
}

export function historyDeletionSql(input: HistoryDeletion) {
  const { table, row } = historyDeletionRow(input)
  const literal = (value: unknown) =>
    value == null
      ? 'NULL'
      : typeof value === 'number'
        ? String(value)
        : `'${String(value).replaceAll("'", "''")}'`
  return `INSERT INTO "${table}" (${Object.keys(row)
    .map(key => `"${key}"`)
    .join(
      ',',
    )}) VALUES (${Object.values(row).map(literal).join(',')}) ON CONFLICT DO NOTHING;`
}
