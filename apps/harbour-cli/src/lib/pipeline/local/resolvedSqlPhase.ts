import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { createLocalExecBinding } from '../../dbCache/localDbCache.ts'
import { prepareNativeSqlDelivery, runNativeSqlDelivery } from './nativeSqlDelivery.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from './releaseSqlDelivery.ts'
import { sqlDeliveryPhaseDirectory, type SqlDeliveryPhase } from './sqlDeliveryPhase.ts'
import {
  captureResolvedSqlPlan,
  type ResolvedSqlCandidates,
  type ResolvedSqlTarget,
} from './resolvedSqlPlan.ts'
import type { PublicationTable } from '@repo/core/pipeline/services/publication/sql.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../addresses/processLocalAddressSqlUploadImport.ts'

export function resolvedCandidateContext(
  context: LocalAddressDbContext,
  candidates: ResolvedSqlCandidates,
): LocalAddressDbContext {
  const targetFor = (
    targets: LocalAddressDbContext['historyTargets'],
    selected: unknown,
    binding?: { bindingName?: string },
  ) =>
    binding?.bindingName ?? targets?.find(target => target.db === selected)?.bindingName
  const history = targetFor(
    context.historyTargets,
    context.historyDb,
    context.historyBinding,
  )
  const source = targetFor(
    context.sourceTargets,
    context.sourceDb,
    context.sourceBinding,
  )
  const binding = (name: string | undefined) =>
    name && candidates[name]
      ? createLocalExecBinding(candidates[name]!.db, name)
      : undefined
  const targets = (items: LocalAddressDbContext['historyTargets'] = []) =>
    items.map(target => ({
      ...target,
      ...(candidates[target.bindingName]
        ? {
            db: candidates[target.bindingName]!.drizzle,
            binding: binding(target.bindingName),
          }
        : {}),
    }))
  return {
    ...context,
    currentDb: (candidates.DB_CURRENT?.drizzle ??
      context.currentDb) as typeof context.currentDb,
    metaDb: (candidates.DB_META?.drizzle ?? context.metaDb) as typeof context.metaDb,
    historyDb: ((history && candidates[history]?.drizzle) ||
      context.historyDb) as typeof context.historyDb,
    sourceDb: ((source && candidates[source]?.drizzle) ||
      context.sourceDb) as typeof context.sourceDb,
    currentBinding: binding('DB_CURRENT'),
    metaBinding: binding('DB_META'),
    historyBinding: binding(history),
    sourceBinding: binding(source),
    historyTargets: targets(context.historyTargets),
    sourceTargets: targets(context.sourceTargets),
    state: {
      ...context.state,
      files: Object.fromEntries(
        Object.entries(candidates).map(([name, candidate]) => [name, candidate.path]),
      ),
    },
  }
}

/** Same sealed final-difference plan serves native delivery and remote acknowledgement. */
export async function deliverResolvedSqlPhase(
  input: SqlDeliveryPhase & {
    targets: Record<string, ResolvedSqlTarget>
    publicationTables?: PublicationTable[]
  },
  generate: (
    context: LocalAddressDbContext,
    candidates: ResolvedSqlCandidates,
  ) => Promise<Record<string, unknown>>,
) {
  const local = input.context.state.target === 'local'
  const directory = sqlDeliveryPhaseDirectory(input)
  const files = Object.fromEntries(
    Object.entries(input.targets).map(([binding, target]) => [binding, target.path]),
  )
  const targets = Object.fromEntries(
    Object.entries(input.targets).map(([binding, target]) => [
      binding,
      { ...target, databaseId: local ? binding : target.databaseId },
    ]),
  )
  const prepare = async (
    append: Parameters<typeof captureResolvedSqlPlan>[0]['append'],
  ) => {
    const result = await captureResolvedSqlPlan({
      targets,
      publicationTables: input.publicationTables,
      append,
      generate: candidates =>
        generate(resolvedCandidateContext(input.context, candidates), candidates),
    })
    return { ...result.result, mutationSummary: result.mutationSummary }
  }
  const preparation = {
    ...input,
    inputs: {
      ...input.inputs,
      planner: 'resolved-family-v1',
      independentBoundTargets: false,
    },
    directory,
  }
  if (local) {
    const plan = await prepareNativeSqlDelivery({
      ...preparation,
      files,
      ownershipDirectory: input.context.state.dbCacheDir,
      generate: prepare,
    })
    input.validateOutputs?.(plan.outputs)
    await runNativeSqlDelivery(directory, { files, onProgress: input.onProgress })
    return plan.outputs
  }
  const accountId = resolveCloudflareAccountId({
    remote: true,
    environment: input.context.state.target === 'production' ? 'production' : 'preview',
  })
  const apiToken = resolveCloudflareD1ApiToken()
  if (!accountId || !apiToken)
    throw new Error('SQL delivery requires Cloudflare account and D1 credentials.')
  const plan = await prepareReleaseSqlDelivery({
    ...preparation,
    generate: capture => prepare((target, bytes, kind) => capture(target, bytes, kind)),
  })
  input.validateOutputs?.(plan.outputs)
  const execution = { ...input, directory, accountId, apiToken }
  if (input.mode !== 'local')
    await executeReleaseSqlDelivery({ ...execution, mode: 'remote' })
  if (input.mode !== 'remote')
    await executeReleaseSqlDelivery({ ...execution, mode: 'local' })
  return plan.outputs
}
