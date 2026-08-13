import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { rebuildRemoteDbCache } from '../addressSql/localDbCache.ts'

export async function runCacheRebuildCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (
    args.positionals.length > 0 ||
    Object.keys(args.options).some(key => key !== 'target') ||
    !target.remote
  ) {
    printUsage()
    throw new Error('`cache:rebuild` accepts only `--target preview|production`.')
  }

  await rebuildRemoteDbCache(target)
}
