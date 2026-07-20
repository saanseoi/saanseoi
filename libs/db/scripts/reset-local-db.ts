import { spinner } from '@clack/prompts'
import { rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const dbFamily = process.argv[2] ?? 'all'
const scriptDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
const repoRoot = resolve(scriptDir, '../../..')

await runStep({
  pending: `Dropping ${describeFamily(dbFamily)} D1 tables`,
  success: `Dropped ${describeFamily(dbFamily)} D1 tables.`,
  command: ['bash', resolve(scriptDir, 'drop-local-db.sh'), dbFamily],
})

await runStep({
  pending: `Applying ${describeFamily(dbFamily)} D1 migrations`,
  success: `Applied ${describeFamily(dbFamily)} D1 migrations.`,
  command: ['bash', resolve(scriptDir, 'migrate-local-db.sh'), dbFamily],
})

if (dbFamily === 'all' || dbFamily === 'meta') {
  await runStep({
    pending: 'Synchronizing local metadata registry',
    success: 'Synchronized local metadata registry.',
    command: ['bun', resolve(scriptDir, 'syncMetaRegistry.ts'), 'local'],
  })
}

await runStep({
  pending: `Vacuuming ${describeFamily(dbFamily)} D1 databases`,
  success: `Vacuumed ${describeFamily(dbFamily)} D1 databases.`,
  command: ['bash', resolve(scriptDir, 'vacuum-local-db.sh'), dbFamily],
})

if (dbFamily === 'all') {
  const progress = spinner()
  progress.start('Clearing local upload state')

  await Promise.all([
    rm(resolve(repoRoot, '.local/harbour-sql/releases'), {
      force: true,
      recursive: true,
    }),
    rm(resolve(repoRoot, '.local/d1/dev/v3/r2'), { force: true, recursive: true }),
  ])

  progress.stop('Cleared local upload state.')
}

function describeFamily(family: string) {
  return family === 'all' ? 'local' : `local ${family}`
}

async function runStep({
  command,
  pending,
  success,
}: {
  command: string[]
  pending: string
  success: string
}) {
  const progress = spinner()
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
    progress.stop(success)
    return
  }

  progress.error(`${pending} failed.`)
  const details = [stdout, stderr].filter(Boolean).join('\n').trim()

  if (details) {
    process.stderr.write(`${details}\n`)
  }

  process.exit(exitCode)
}
