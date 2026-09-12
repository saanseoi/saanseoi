import {
  buildAddressPublicationGuardSql,
  buildBeginAddressPublicationSql,
  buildPrepareAddressPublicationSql,
  type AddressPublicationOwner,
  type AddressPublicationReceipt,
} from '@repo/core/pipeline/db/addressPublication'
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import type { NetStatement } from '../local/netSqlitePlanTypes.ts'

type Target = { databaseId: string | null; bindingName?: string }
type Capture = (target: Target, bytes: Uint8Array, kind: 'bound') => Promise<void>

/** Scope ownership and every mutation share a delivery transaction and its receipt. */
export function addressPublicationDelivery(input: {
  owner: AddressPublicationOwner
  target: Target
  capture: Capture
  previous: () => AddressPublicationReceipt | null
  validation: () => string
}) {
  let started = false
  const emit = (sql: string) =>
    input.capture(
      input.target,
      Buffer.from(
        JSON.stringify(splitSqlStatements(sql).map(sql => ({ sql, params: [] }))),
      ),
      'bound',
    )
  const begin = async () => {
    if (started) return
    await emit(buildBeginAddressPublicationSql(input.owner, input.previous()))
    started = true
  }
  return {
    async append(target: Target, bytes: Uint8Array, kind: 'bound') {
      await begin()
      if (target.bindingName !== 'DB_CURRENT') {
        await input.capture(target, bytes, kind)
        return
      }
      const mutations = JSON.parse(new TextDecoder().decode(bytes)) as NetStatement[]
      await input.capture(
        target,
        Buffer.from(
          JSON.stringify([
            { sql: buildAddressPublicationGuardSql(input.owner), params: [] },
            ...mutations,
          ]),
        ),
        'bound',
      )
    },
    async complete() {
      const previous = input.previous()
      // A completed, acknowledged replay requires no state writes, including
      // when public release-set publication was deliberately deferred.
      if (
        !started &&
        previous?.snapshotId === input.owner.snapshotId &&
        previous.preparedAt
      )
        return
      await begin()
      await emit(buildPrepareAddressPublicationSql(input.owner, input.validation()))
    },
  }
}
