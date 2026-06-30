import {
  buildMetaRegistrySyncSql,
  metaRegistryRequiredTables,
  type MetaRegistrySyncEnvironment,
} from '../src/registry'

const target = process.argv[2] ?? 'local'

if (!['local', 'preview', 'production'].includes(target)) {
  console.error(`Unsupported sync target: ${target}`)
  console.error('Usage: bun ./scripts/syncMetaRegistry.ts [local|preview|production]')
  process.exit(1)
}

const scriptDir = new URL('.', import.meta.url)
const databaseName = target === 'production' ? 'ss-meta-db-prod' : 'ss-meta-db-preview'
const registryEnvironment: MetaRegistrySyncEnvironment =
  target === 'production' ? 'production' : 'preview'
const wranglerConfigPath = new URL(
  '../../../apps/harbour-api/wrangler.jsonc',
  scriptDir,
)
const persistPath = new URL('../../../.local/d1/dev', scriptDir)
const xdgConfigHomePath = new URL('../../../.local/wrangler', scriptDir)
const wranglerLogPath = new URL('../../../.local/wrangler/logs', scriptDir)

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function buildWranglerSyncTargetArgs() {
  return [
    '--config',
    wranglerConfigPath.pathname,
    '--env',
    target === 'production' ? 'production' : 'preview',
    ...(target === 'local'
      ? ['--local', '--persist-to', persistPath.pathname]
      : ['--remote']),
  ]
}

function parseWranglerExecuteJson(raw: string) {
  let payload:
    | Array<{
        results?: Array<Record<string, unknown>>
        success?: boolean
        error?: string
      }>
    | {
        results?: Array<Record<string, unknown>>
        success?: boolean
        error?: string
      }

  try {
    payload = JSON.parse(raw) as typeof payload
  } catch {
    throw new Error(`Unexpected wrangler d1 execute response: ${raw}`)
  }

  const first = Array.isArray(payload) ? payload[0] : payload

  if (first?.error) {
    const errorText =
      typeof first.error === 'string' ? first.error : JSON.stringify(first.error)
    throw new Error(`Wrangler D1 execute failed: ${errorText}`)
  }

  const result = first as
    | {
        results?: Array<Record<string, unknown>>
        success?: boolean
      }
    | undefined

  if (!result || result.success === false) {
    throw new Error(`Unexpected wrangler d1 execute response: ${raw}`)
  }

  return Array.isArray(result.results) ? result.results : []
}

function decodeOutput(output: ArrayBufferLike | Uint8Array | null | undefined) {
  if (!output) {
    return ''
  }

  const bytes = output instanceof Uint8Array ? output : new Uint8Array(output)

  return new TextDecoder().decode(bytes).trim()
}

function runWranglerExecute(command: string) {
  const proc = Bun.spawnSync({
    cmd: [
      'bun',
      'x',
      'wrangler',
      'd1',
      'execute',
      databaseName,
      ...buildWranglerSyncTargetArgs(),
      '--json',
      '--command',
      command,
    ],
    cwd: new URL('..', scriptDir).pathname,
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? xdgConfigHomePath.pathname,
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? wranglerLogPath.pathname,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (proc.exitCode !== 0) {
    const stderr = decodeOutput(proc.stderr)
    const stdout = decodeOutput(proc.stdout)
    const details = [stderr, stdout].filter(part => part.length > 0).join('\n')

    throw new Error(
      details.length > 0 ? details : `Wrangler d1 execute failed for ${databaseName}.`,
    )
  }

  return parseWranglerExecuteJson(decodeOutput(proc.stdout))
}

function buildMissingTablesMessage(missingTables: string[]) {
  const tableList = missingTables.join(', ')

  if (target === 'preview' || target === 'local') {
    const resetCommand =
      target === 'preview'
        ? 'bun run db:reset:preview:meta'
        : 'bun run --filter @repo/db db:reset:local:meta'

    return [
      `Meta schema preflight failed for ${target}: missing required tables ${tableList}.`,
      'This database appears to have stale migration state: Wrangler reported no pending migrations, but the registry sync expects the current meta schema.',
      `Reset and reapply the meta schema with \`${resetCommand}\`, then rerun the sync command.`,
    ].join(' ')
  }

  return [
    `Meta schema preflight failed for production: missing required tables ${tableList}.`,
    'Do not continue syncing production until the migration ledger and live schema are reconciled.',
  ].join(' ')
}

function assertMetaSchemaReady() {
  const query = [
    'SELECT name',
    'FROM sqlite_master',
    "WHERE type = 'table'",
    `AND name IN (${metaRegistryRequiredTables.map(sqlString).join(', ')})`,
    'ORDER BY name;',
  ].join(' ')
  const rows = runWranglerExecute(query)
  const existing = new Set(
    rows
      .map(row => (typeof row.name === 'string' ? row.name : null))
      .filter((row): row is string => row !== null),
  )
  const missing = metaRegistryRequiredTables.filter(table => !existing.has(table))

  if (missing.length > 0) {
    throw new Error(buildMissingTablesMessage([...missing]))
  }
}

function main() {
  assertMetaSchemaReady()
  const resultRows = runWranglerExecute(buildMetaRegistrySyncSql(registryEnvironment))
  console.log(`Meta registry sync succeeded. result_rows=${resultRows.length}`)
}

try {
  main()
  process.exit(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
