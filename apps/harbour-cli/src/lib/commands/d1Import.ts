import { cancel, confirm, isCancel, note, outro } from '@clack/prompts'

import { importD1SqlFile } from '../d1Import.ts'
import { formatField } from '../display.ts'
import { resolveOptionalPositiveInteger, type ParsedArgs } from '../options.ts'

export async function runD1ImportCommand(
  args: ParsedArgs,
  options: {
    printUsage: () => void
    skipConfirm: boolean
  },
) {
  const filePath = args.positionals[0]
  const accountId =
    typeof args.options['account-id'] === 'string'
      ? args.options['account-id']
      : process.env.CLOUDFLARE_ACCOUNT_ID
  const databaseId =
    typeof args.options['database-id'] === 'string'
      ? args.options['database-id']
      : undefined
  const apiTokenEnv =
    typeof args.options['api-token-env'] === 'string'
      ? args.options['api-token-env']
      : 'CLOUDFLARE_D1_TOKEN'
  const apiToken =
    typeof args.options['api-token'] === 'string'
      ? args.options['api-token']
      : process.env[apiTokenEnv]
  const pollIntervalMs = resolveOptionalPositiveInteger(
    args.options['poll-interval-ms'],
    'poll-interval-ms',
  )

  if (!filePath || !accountId || !databaseId || !apiToken) {
    options.printUsage()
    throw new Error(
      'Invalid arguments for `d1:import-sql`. Pass <file.sql>, --account-id, --database-id, and --api-token or --api-token-env.',
    )
  }

  if (!options.skipConfirm) {
    const shouldContinue = await confirm({
      message: `Import ${filePath} into D1 database ${databaseId}?`,
      initialValue: false,
    })

    if (isCancel(shouldContinue) || !shouldContinue) {
      cancel('D1 IMPORT CANCELLED')
      process.exit(1)
    }
  }

  const result = await importD1SqlFile({
    accountId,
    apiToken,
    databaseId,
    filePath,
    pollIntervalMs,
  })

  note(
    [
      formatField('file', filePath),
      formatField('databaseId', databaseId),
      formatField('bytes', String(result.bytes)),
      formatField('etag', result.etag),
      formatField('uploadedEtag', result.uploadedEtag ?? '-'),
      formatField('filename', result.filename),
      formatField('success', String(result.poll.success)),
      formatField('status', result.poll.status ?? '-'),
      formatField('error', result.poll.error ?? '-'),
    ].join('\n'),
    'D1 IMPORT RESULT',
  )
  outro('D1 SQL import complete')
}
