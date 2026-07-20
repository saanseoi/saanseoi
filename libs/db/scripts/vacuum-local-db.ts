import { spinner } from '@clack/prompts'

type VacuumTarget = {
  bindingName: string
  sqlitePath: string
}

const targets = parseTargets(process.argv[2])
const progress = spinner({ withGuide: false })

progress.start(vacuumLabel(targets[0]?.bindingName))

for (const target of targets) {
  progress.message(vacuumLabel(target.bindingName))

  const sqlite = Bun.spawn(
    ['sqlite3', target.sqlitePath, 'PRAGMA wal_checkpoint(TRUNCATE); VACUUM;'],
    {
      stderr: 'inherit',
      stdout: 'ignore',
    },
  )
  const exitCode = await sqlite.exited

  if (exitCode !== 0) {
    progress.error(`Could not vacuum local D1 database ${target.bindingName}.`)
    process.exit(exitCode)
  }
}

progress.stop(
  `Vacuumed ${targets.length} local D1 ${targets.length === 1 ? 'database' : 'databases'}.`,
)

function parseTargets(value: string | undefined): VacuumTarget[] {
  if (!value) {
    throw new Error('Missing local D1 vacuum targets.')
  }

  const parsed: unknown = JSON.parse(value)

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    parsed.some(target => !isVacuumTarget(target))
  ) {
    throw new Error('Invalid local D1 vacuum targets.')
  }

  return parsed
}

function isVacuumTarget(value: unknown): value is VacuumTarget {
  return (
    typeof value === 'object' &&
    value !== null &&
    'bindingName' in value &&
    typeof value.bindingName === 'string' &&
    'sqlitePath' in value &&
    typeof value.sqlitePath === 'string'
  )
}

function vacuumLabel(bindingName: string | undefined) {
  return bindingName
    ? `Vacuuming local D1 database ${bindingName}`
    : 'Vacuuming local D1 databases'
}
