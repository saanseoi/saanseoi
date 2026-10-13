import { and, historySchema, sql } from '@repo/db'
import type { HarbourReadableDb } from '../../lib/db/types'

export type HistoryDictionaryTable =
  | 'statsFields'
  | 'statsFieldsI18n'
  | 'statsMeasures'
  | 'statsMeasuresI18n'
export type HistoryDictionaryReference = {
  datasetCode: string
  identity: string
  versionHash: string
}

/** Definition references may name an older payload, but never a sibling branch. */
export async function readHistoryDictionaryVersions(
  databases: readonly HarbourReadableDb[],
  snapshotIds: readonly string[],
  name: HistoryDictionaryTable,
  references: readonly HistoryDictionaryReference[],
) {
  const table = historySchema[name]
  const identity = 'fieldName' in table ? table.fieldName : table.measureCode
  const positions = new Map(snapshotIds.map((id, index) => [id, index]))
  const selected = new Map<string, Record<string, unknown>>()
  const uniqueReferences = [
    ...new Map(
      references.map(reference => [
        JSON.stringify([
          reference.datasetCode,
          reference.identity,
          reference.versionHash,
        ]),
        reference,
      ]),
    ).values(),
  ]
  for (const db of databases)
    for (let start = 0; start < uniqueReferences.length; start += 256) {
      const rows = await db
        .select()
        .from(table)
        .where(
          and(
            sql`${table.operation} = 'upsert'`,
            sql`${table.snapshotId} in (select value from json_each(${JSON.stringify(snapshotIds)}))`,
            sql`exists (select 1 from json_each(${JSON.stringify(uniqueReferences.slice(start, start + 256))}) ref
        where ${table.datasetCode} = json_extract(ref.value,'$.datasetCode')
          and ${identity} = json_extract(ref.value,'$.identity')
          and ${table.versionHash} = json_extract(ref.value,'$.versionHash'))`,
          ),
        )
        .all()
      for (const row of rows as Record<string, unknown>[]) {
        const key = JSON.stringify([
          row.datasetCode,
          row.fieldName ?? row.measureCode,
          row.versionHash,
          row.locale ?? '',
        ])
        const previous = selected.get(key)
        const position = positions.get(String(row.snapshotId))!
        if (previous?.snapshotId === row.snapshotId)
          throw new Error(
            `Multiple owners of ${name} definition ${key}/${row.snapshotId}.`,
          )
        if (!previous || positions.get(String(previous.snapshotId))! < position)
          selected.set(key, row)
      }
    }
  return [...selected.values()]
}
