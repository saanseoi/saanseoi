import { resolve } from 'node:path'

import type { ParsedArgs } from '../options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../')
const UPLOAD_INIT_SCRIPT_PATH = resolve(REPO_ROOT, 'scripts/upload-init.fish')

export async function runUploadInitCommand(args: ParsedArgs, printUsage: () => void) {
  if (args.positionals.length > 0 || Object.keys(args.options).length > 0) {
    printUsage()
    throw new Error('`upload:init` does not accept arguments or options.')
  }

  const process = Bun.spawn({
    cmd: ['fish', UPLOAD_INIT_SCRIPT_PATH],
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
