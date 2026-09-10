import type { SqlDeliveryBatch, SqlDeliveryPlan } from './sqlDeliveryTypes.ts'

export const RECEIPT_TABLE = 'harbourSqlDeliveryReceipts'
export const RECEIPT_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS ${RECEIPT_TABLE} (
  planId TEXT NOT NULL, batchIndex INTEGER NOT NULL, sha256 TEXT NOT NULL,
  PRIMARY KEY (planId, batchIndex)
);`

export function receiptSql(plan: SqlDeliveryPlan, batch: SqlDeliveryBatch) {
  // IDs and checksums are verified SHA-256 strings; the index is validated by the manifest reader.
  return `INSERT INTO ${RECEIPT_TABLE} (planId,batchIndex,sha256) VALUES ('${plan.id}',${batch.index},'${batch.sha256}');`
}

export function receiptQuery(plan: SqlDeliveryPlan, batch: SqlDeliveryBatch) {
  return `SELECT sha256 FROM ${RECEIPT_TABLE} WHERE planId = '${plan.id}' AND batchIndex = ${batch.index};`
}

export function checkReceipt(rows: Record<string, unknown>[], batch: SqlDeliveryBatch) {
  if (rows.length === 0) return false
  if (rows.length !== 1 || rows[0]?.sha256 !== batch.sha256)
    throw new Error(`SQL delivery receipt mismatch for batch ${batch.index}.`)
  return true
}
