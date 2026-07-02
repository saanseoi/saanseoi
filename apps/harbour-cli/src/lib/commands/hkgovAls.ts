import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { note, outro } from '@clack/prompts'

import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'

import { formatField } from '../display.ts'
import { prepareHkgovAlsAddressParquet } from '../hkgovAls.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'

export async function runHkgovAlsPrepCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceDir = args.positionals[0]
  const sourceVersion =
    typeof args.options['source-version'] === 'string'
      ? args.options['source-version']
      : inferSourceVersionFromPath(sourceDir ?? '')

  if (!sourceDir || !sourceVersion) {
    printUsage()
    throw new Error(
      'Invalid arguments for `prep-hkgov-als`. Pass <source-dir> and include --source-version only when it cannot be inferred from the path.',
    )
  }
  const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)

  const result = await prepareHkgovAlsAddressParquet({
    dbPath: typeof args.options.db === 'string' ? args.options.db : undefined,
    environment: target.environment,
    outputFile,
    cohortKey:
      typeof args.options['cohort-key'] === 'string'
        ? args.options['cohort-key']
        : sourceVersion,
    sourceDir,
    sourceVersion,
  })

  note(
    [
      formatField('outputFile', result.outputFile),
      formatField('sourceFiles', String(result.sourceFileCount)),
      formatField('featureCount', String(result.featureCount)),
    ].join('\n'),
    'PREP RESULT',
  )
  outro('ALS parquet preparation complete')
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-als-'))

  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
}
