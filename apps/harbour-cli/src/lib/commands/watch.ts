import { log, outro } from '@clack/prompts'

import type { UploadTarget } from '../options.ts'
import { watchCurrentUpload } from '../watch.ts'

export async function runWatchCommand(target: UploadTarget) {
  const result = await watchCurrentUpload(target)

  if (!result.hadActivity) {
    log.message('No active Harbour upload processing found.')
  }

  outro('Harbour upload watch complete')
}
