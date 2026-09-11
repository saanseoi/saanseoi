import type { AddressPublicationReceipt } from '@repo/core/pipeline/db/addressPublication'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from '../local/releaseSqlDelivery.ts'
import { captureNetSqlitePlan } from '../local/netSqlitePlan.ts'
import { executeNativeSqlStatements } from '../local/nativeSqlStatements.ts'
import { withSqlDeliveryCapture } from '../local/sqlDeliveryCapture.ts'
import {
  sqlDeliveryPhaseDirectory,
  type SqlDeliveryPhase,
} from '../local/sqlDeliveryPhase.ts'
import {
  addressMutationTables,
  buildDeliveredAddressValidationSql,
  validateResolvedAddressProjection,
} from './resolvedAddressDelivery.ts'
import { addressPublicationDelivery } from './addressPublicationDelivery.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from './processLocalAddressSqlUploadImport.ts'

/** Resolve supplementary Address SQL on copies; deliver only guarded final differences. */
export async function deliverResolvedAddressSqlPhase(
  input: SqlDeliveryPhase & {
    scopeId: string
    snapshotId: string
    expectedCount: number
  },
  generate: () => Promise<unknown>,
) {
  const files = input.context.state.files
  if (!files) throw new Error('Resolved Address delivery requires local mirror files.')
  const local = input.context.state.target === 'local'
  const directory = sqlDeliveryPhaseDirectory(input)
  const generatePlan: Parameters<typeof prepareNativeSqlDelivery>[0]['generate'] =
    async rawCapture => {
      const capture: typeof rawCapture = (target, bytes, kind) =>
        rawCapture(
          {
            ...target,
            databaseId: local ? target.bindingName : target.databaseId,
          },
          bytes,
          kind,
        )
      let previous: AddressPublicationReceipt | null = null
      let validationSql = '0'
      const publication = addressPublicationDelivery({
        owner: {
          scopeId: input.scopeId,
          snapshotId: input.snapshotId,
          publicationToken: crypto.randomUUID(),
        },
        previous: () => previous,
        validation: () => validationSql,
        target: {
          bindingName: 'DB_CURRENT',
          databaseId:
            input.context.state.bindings.DB_CURRENT?.databaseId ?? 'DB_CURRENT',
        },
        capture: (target, bytes, kind) => {
          if (!target.databaseId)
            throw new Error('Address delivery requires a database identity.')
          return capture(
            {
              databaseId: target.databaseId,
              bindingName: target.bindingName ?? target.databaseId,
            },
            bytes,
            kind,
          )
        },
      })
      const metadata: Uint8Array[] = []
      await captureNetSqlitePlan({
        targets: Object.fromEntries(
          Object.entries(files).flatMap(([binding, path]) => {
            const tables = addressMutationTables(binding)
            return tables.length
              ? [
                  [
                    binding,
                    {
                      path,
                      databaseId:
                        input.context.state.bindings[binding]?.databaseId ?? binding,
                      tables,
                    },
                  ],
                ]
              : []
          }),
        ),
        limits: { maxStatements: 63, maxPayloadBytes: 4 * 1024 * 1024 - 4096 },
        append: publication.append,
        generate: async candidates => {
          const current = candidates.DB_CURRENT?.db
          if (!current) throw new Error('Address planning requires DB_CURRENT.')
          previous = current
            .query<AddressPublicationReceipt, [string]>(
              'SELECT * FROM addressPublicationState WHERE scopeId = ?',
            )
            .get(input.scopeId)
          await withSqlDeliveryCapture(
            async (target, bytes) => {
              const binding = local
                ? target.databaseId
                : Object.entries(input.context.state.bindings).find(
                    ([, value]) => value.databaseId === target.databaseId,
                  )?.[0]
              if (binding === 'DB_META') {
                metadata.push(bytes)
                return
              }
              const candidate = binding ? candidates[binding]?.db : undefined
              if (!candidate)
                throw new Error('Supplementary Address SQL resolved an unknown target.')
              candidate
                .transaction(() =>
                  executeNativeSqlStatements(
                    candidate,
                    new TextDecoder().decode(bytes),
                  ),
                )
                .immediate()
            },
            generate,
            local,
          )
          validateResolvedAddressProjection(current, input.scopeId, input.expectedCount)
          validationSql = buildDeliveredAddressValidationSql(current, input.scopeId)
        },
      })
      await publication.complete()
      for (const bytes of metadata)
        await capture(
          {
            bindingName: 'DB_META',
            databaseId: input.context.state.bindings.DB_META?.databaseId ?? 'DB_META',
          },
          bytes,
          'sql',
        )
      return input.captureOutputs?.()
    }
  if (local) {
    await prepareNativeSqlDelivery({
      ...input,
      directory,
      files,
      ownershipDirectory: input.context.state.dbCacheDir,
      generate: generatePlan,
    })
    await runNativeSqlDelivery(directory, { files, onProgress: input.onProgress })
    return
  }
  const accountId = resolveCloudflareAccountId({
    remote: true,
    environment: input.context.state.target === 'production' ? 'production' : 'preview',
  })
  const apiToken = resolveCloudflareD1ApiToken()
  if (!accountId || !apiToken)
    throw new Error('SQL delivery requires Cloudflare account and D1 credentials.')
  await prepareReleaseSqlDelivery({ ...input, directory, generate: generatePlan })
  const execution = { ...input, directory, accountId, apiToken }
  await executeReleaseSqlDelivery({ ...execution, mode: 'remote' })
  await executeReleaseSqlDelivery({ ...execution, mode: 'local' })
}
