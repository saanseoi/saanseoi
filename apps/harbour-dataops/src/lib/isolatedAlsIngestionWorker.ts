import { readFile } from 'node:fs/promises'
import { installInterruptHandler } from '../../../harbour-cli/src/lib/cli/interrupt.ts'
import { installInitialisationIndent } from '../../../harbour-cli/src/lib/cli/initialisationIndent.ts'
import { disposeRemoteR2 } from '../../../harbour-cli/src/lib/storage/remoteR2.ts'
import { runHkgovAlsIngestCommand } from '../commands/hkgovAls.ts'
import type { AlsIngestionRequest } from './isolatedAlsIngestion.ts'
import { terminalSafeText } from './terminal.ts'

const disposeInterrupt = installInterruptHandler()
try {
  const input: AlsIngestionRequest = JSON.parse(
    await readFile(process.argv[2]!, 'utf8'),
  )
  if (
    !input.sourceVersion ||
    input.options.isolatedSourceVersion !== input.sourceVersion
  )
    throw new Error('ALS ingestion worker requires one exact source version.')
  installInitialisationIndent(input.args.command ?? undefined)
  await runHkgovAlsIngestCommand(input.args, input.target, () => {}, input.options)
} catch (error) {
  console.error(
    terminalSafeText(error instanceof Error ? error.message : String(error)),
  )
  process.exitCode = 1
} finally {
  await disposeRemoteR2()
  disposeInterrupt()
}
