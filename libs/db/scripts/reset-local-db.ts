import { log, spinner } from '@clack/prompts'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { withDeliveryLock } from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryFiles.ts'
import { invalidateSqlDeliveryReleases } from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryGeneration.ts'
import { readPendingSqlDelivery } from '../../../apps/harbour-cli/src/lib/pipeline/local/sqlDeliveryPending.ts'

const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
type ResetStep = { pending: string; success: string; command: string[] }

export async function resetLocalDb(
  dbFamily: string,
  options: {
    repoRoot?: string
    executeStep?: (step: ResetStep) => Promise<void>
  } = {},
) {
  const repoRoot = options.repoRoot ?? resolve(scriptDir, '../../..')
  const cacheDir = resolve(repoRoot, '.local/d1/dev/v3/d1/miniflare-D1DatabaseObject')
  const executeStep = options.executeStep ?? (step => runStep(step, repoRoot))
  await withDeliveryLock(resolve(cacheDir, 'sql-delivery-lock'), async () => {
    if (dbFamily === 'all') {
      const pending = await readPendingSqlDelivery(cacheDir)
      if (pending) await invalidateSqlDeliveryReleases(cacheDir, [pending.releaseId])
    }

    await executeStep({
      pending: `Dropping ${describeFamily(dbFamily)} D1 tables`,
      success: `Dropped ${describeFamily(dbFamily)} D1 tables.`,
      command: ['bash', resolve(scriptDir, 'drop-local-db.sh'), dbFamily],
    })

    await executeStep({
      pending: `Applying ${describeFamily(dbFamily)} D1 migrations`,
      success: `Applied ${describeFamily(dbFamily)} D1 migrations.`,
      command: ['bash', resolve(scriptDir, 'migrate-local-db.sh'), dbFamily],
    })

    if (dbFamily === 'all' || dbFamily === 'meta') {
      await executeStep({
        pending: 'Synchronising local metadata registry',
        success: 'Synchronised local metadata registry.',
        command: ['bun', resolve(scriptDir, 'syncMetaRegistry.ts'), 'local'],
      })
    }

    await executeStep({
      pending: `Vacuuming ${describeFamily(dbFamily)} D1 databases`,
      success: `Vacuumed ${describeFamily(dbFamily)} D1 databases.`,
      command: ['bash', resolve(scriptDir, 'vacuum-local-db.sh'), dbFamily],
    })

    if (dbFamily !== 'all') return
    const startedAt = Date.now()
    const progress = spinner({ withGuide: false })
    progress.start('Clearing local upload state')

    const cleanup = await Promise.allSettled([
      rm(resolve(repoRoot, '.local/harbour-sql/releases/local'), {
        force: true,
        recursive: true,
      }),
      rm(resolve(repoRoot, '.local/harbour-sql/deliveries/local'), {
        force: true,
        recursive: true,
      }),
      rm(resolve(repoRoot, '.local/d1/dev/v3/r2'), { force: true, recursive: true }),
    ])
    for (const result of cleanup) {
      if (result.status === 'rejected') throw result.reason
    }
    // Keep ownership until every reset and cleanup step succeeds. The lock prevents
    // a new delivery from installing another marker while its retained files go away.
    await rm(resolve(cacheDir, 'pending-sql-delivery.json'), { force: true })

    progress.clear()
    log.message(formatCompletedStep('Cleared local upload state.', startedAt), {
      withGuide: false,
    })
  })
}

if (import.meta.main) await resetLocalDb(process.argv[2] ?? 'all')

function describeFamily(family: string) {
  return family === 'all' ? 'local' : `local ${family}`
}

async function runStep({ command, pending, success }: ResetStep, repoRoot: string) {
  const startedAt = Date.now()
  const progress = spinner({ withGuide: false })
  progress.start(pending)

  const child = Bun.spawn({
    cmd: command,
    cwd: repoRoot,
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  if (exitCode === 0) {
    progress.clear()
    log.message(formatCompletedStep(success, startedAt), {
      withGuide: false,
    })
    return
  }

  progress.error(`${pending} failed.`)
  const details = [stdout, stderr].filter(Boolean).join('\n').trim()

  if (details) {
    process.stderr.write(`${details}\n`)
  }

  process.exit(exitCode)
}

function formatCompletedStep(message: string, startedAt: number) {
  const elapsed = formatDurationMs(Date.now() - startedAt)
  return `${message} \u001B[90m(${elapsed})\u001B[39m`
}

function formatDurationMs(value: number) {
  if (value < 1000) {
    return `${Math.round(value)} ms`
  }

  const totalSeconds = value / 1000

  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(totalSeconds >= 10 ? 1 : 2)} s`
  }

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.round(totalSeconds % 60)

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
