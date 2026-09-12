import { requireDefined } from '@repo/core/requireDefined'
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import {
  groupAuditSqlStatements,
  AUDIT_COMMIT_START,
  AUDIT_COMMIT_END,
} from '@repo/core/pipeline/db/processingActionSqlGroups'
import { withSqlDeliveryCapture } from './sqlDeliveryCapture.ts'

/** Coalesce generated SQL in order, splitting large artefacts only between statements. */
export async function captureSqlDeliveryBatches(
  capture: (target: { databaseId: string | null }, bytes: Uint8Array) => Promise<void>,
  generate: () => Promise<unknown>,
  maxBytes = 64 * 1024 * 1024,
  local = false,
) {
  let target: { databaseId: string | null } | undefined
  let bytes = 0
  let parts: Uint8Array[] = []
  let pending = Promise.resolve()
  const flush = async () => {
    if (!target || !parts.length) return
    const buffer = new Uint8Array(bytes)
    let offset = 0
    for (const part of parts) {
      buffer.set(part, offset)
      offset += part.byteLength
    }
    await capture(target, buffer)
    parts = []
    bytes = 0
    target = undefined
  }
  const append = async (
    destination: { databaseId: string | null },
    payload: Uint8Array,
  ) => {
    if (payload.byteLength + 1 > maxBytes)
      throw new Error('SQL delivery statement exceeds the payload budget.')
    if (
      target &&
      (target.databaseId !== destination.databaseId ||
        bytes + payload.byteLength + 1 > maxBytes)
    )
      await flush()
    target = destination
    parts.push(payload, new Uint8Array([10]))
    bytes += payload.byteLength + 1
  }
  try {
    await withSqlDeliveryCapture(
      (destination, payload) => {
        pending = pending.then(async () => {
          if (payload.byteLength + 1 <= maxBytes) {
            await append(destination, payload)
            return
          }
          // These are generated DML artefacts, not arbitrary user SQL or transactions.
          const statements = splitSqlStatements(
            new TextDecoder('utf-8', { fatal: true }).decode(payload),
          )
          if (
            statements.some(statement =>
              /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(statement),
            )
          )
            throw new Error('Cannot split a SQL delivery transaction across payloads.')
          for (const group of groupAuditSqlStatements(statements, 1)) {
            const sql =
              group.length > 1
                ? [AUDIT_COMMIT_START, ...group, AUDIT_COMMIT_END].join('\n')
                : requireDefined(group[0])
            await append(destination, new TextEncoder().encode(sql))
          }
        })
        return pending
      },
      generate,
      local,
    )
    await pending
    await flush()
  } finally {
    await pending
  }
}
