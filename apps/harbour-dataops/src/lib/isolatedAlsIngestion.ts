import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { registerInterruptCleanup } from '../../../harbour-cli/src/lib/cli/interrupt.ts'
import type { HkgovAlsIngestOptions } from '../commands/hkgovAls.ts'

export type AlsIngestionRequest = {
  args: ParsedArgs
  target: UploadTarget
  options: HkgovAlsIngestOptions
  sourceVersion: string
}

/** Release the preparation and replay heaps before starting the next release. */
export async function ingestAlsReleaseInChild(
  input: AlsIngestionRequest,
  worker = fileURLToPath(new URL('./isolatedAlsIngestionWorker.ts', import.meta.url)),
) {
  const directory = await mkdtemp(join(tmpdir(), 'als-ingestion-'))
  let disposeInterrupt: (() => void) | undefined
  try {
    const request = join(directory, 'request.json')
    await writeFile(
      request,
      JSON.stringify({
        ...input,
        args: {
          ...input.args,
          options: { ...input.args.options, 'defer-api-release-set': true },
        },
        options: { ...input.options, isolatedSourceVersion: input.sourceVersion },
      }),
    )
    const child = Bun.spawn([process.execPath, '--smol', worker, request], {
      cwd: process.cwd(),
      env: process.env,
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })
    disposeInterrupt = registerInterruptCleanup(signal => child.kill(signal))
    const code = await child.exited
    if (code !== 0) {
      throw new Error(
        `ALS ingestion ${input.sourceVersion} exited with ${code}${child.signalCode ? ` (${child.signalCode})` : ''}; completed releases are retained.`,
      )
    }
  } finally {
    disposeInterrupt?.()
    await rm(directory, { recursive: true, force: true })
  }
}
