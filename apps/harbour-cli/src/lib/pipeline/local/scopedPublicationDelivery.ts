import {
  buildBeginPublicationSql,
  buildCompletePublicationSql,
  buildPublicationGuardSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { splitSqlStatements } from '@repo/core/pipeline/services/addresses/sqlImportStages'
import type { NetStatement } from './netSqlitePlanTypes.ts'
import type { SqlDeliveryTarget } from './sqlDeliveryTypes.ts'

export type ScopedPublicationReceipt = {
  snapshotId: string
  publicationToken: string
  preparedAt: string | null
}

/** Keep intermediate publication ownership outside the final data difference. */
export function scopedPublicationDelivery(input: {
  preparation: () => PublicationPreparation
  previous: () => ScopedPublicationReceipt | null
  validation: () => string
  target: SqlDeliveryTarget
  capture: (
    target: SqlDeliveryTarget,
    bytes: Uint8Array,
    kind: 'bound',
  ) => Promise<void>
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
    const previous = input.previous()
    await emit(buildBeginPublicationSql({ ...input.preparation(), previous }))
    started = true
  }
  return {
    begin,
    async append(target: SqlDeliveryTarget, bytes: Uint8Array, kind: 'bound') {
      await begin()
      if (target.bindingName !== input.target.bindingName) {
        await input.capture(target, bytes, kind)
        return
      }
      const mutations = JSON.parse(new TextDecoder().decode(bytes)) as NetStatement[]
      await input.capture(
        target,
        Buffer.from(
          JSON.stringify([
            { sql: buildPublicationGuardSql(input.preparation()), params: [] },
            ...mutations,
          ]),
        ),
        'bound',
      )
    },
    async complete() {
      const previous = input.previous()
      const preparation = input.preparation()
      if (
        !started &&
        previous?.snapshotId === preparation.snapshotId &&
        previous.preparedAt
      )
        return
      await begin()
      await emit(
        buildCompletePublicationSql({
          ...preparation,
          validationSql: input.validation(),
        }),
      )
    },
  }
}
