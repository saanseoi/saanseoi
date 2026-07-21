import { resolve } from 'node:path'

import type { ParsedArgs } from '../options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')
const UPLOAD_INIT_SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/upload-init.fish')

export async function runUploadInitCommand(args: ParsedArgs, printUsage: () => void) {
  const invalidOptions = Object.keys(args.options).filter(key => key !== 'continue')

  if (
    args.positionals.length > 0 ||
    invalidOptions.length > 0 ||
    (args.options.continue !== undefined && args.options.continue !== true)
  ) {
    printUsage()
    throw new Error('`upload:init` accepts only the `--continue` option.')
  }

  const process = Bun.spawn({
    cmd: [
      'fish',
      UPLOAD_INIT_SCRIPT_PATH,
      ...(args.options.continue ? ['--continue'] : []),
    ],
    cwd: REPO_ROOT,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await process.exited

  if (exitCode !== 0) {
    throw new Error(`Upload initialization failed with exit code ${exitCode}.`)
  }
}
