#!/usr/bin/env bun

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse, stringify } from 'comment-json'

type Environment = 'preview' | 'production'
type BindingName =
  | 'DB_META'
  | 'DB_CURRENT'
  | 'DB_HISTORY_HK_2025'
  | 'DB_HISTORY_HK_2026'
  | 'DB_SOURCE_HK_2025'
  | 'DB_SOURCE_HK_2026'

type Options = {
  binding: BindingName
  deploy: boolean
  dryRun: boolean
  environment: Environment
  iterations: number
  location: string
  migrate: boolean
  probe: boolean
  skipDelete: boolean
}

type D1ListEntry = {
  name: string
  uuid: string
}

type WranglerD1DatabaseEntry = {
  binding?: string
  database_id?: string
  database_name?: string
  preview_database_id?: string
}

type WranglerConfig = {
  d1_databases?: WranglerD1DatabaseEntry[]
  env?: Partial<
    Record<
      Environment,
      {
        d1_databases?: WranglerD1DatabaseEntry[]
      }
    >
  >
}

const repoRoot = resolve(import.meta.dir, '..')
const wranglerConfigPaths = [
  resolve(repoRoot, 'apps/atlas-api/wrangler.jsonc'),
  resolve(repoRoot, 'apps/atlas-app/wrangler.jsonc'),
  resolve(repoRoot, 'apps/harbour-api/wrangler.jsonc'),
  resolve(repoRoot, 'apps/harbour-workers/wrangler.jsonc'),
] as const

const bindingFamilies: Record<BindingName, string> = {
  DB_CURRENT: 'current',
  DB_HISTORY_HK_2025: 'history-hk-2025',
  DB_HISTORY_HK_2026: 'history-hk-2026',
  DB_META: 'meta',
  DB_SOURCE_HK_2025: 'source-hk-2025',
  DB_SOURCE_HK_2026: 'source-hk-2026',
}

const options = parseArgs(Bun.argv.slice(2))
const databaseName = resolveDatabaseName(options.binding, options.environment)

console.log(
  [
    'Recreating D1 binding.',
    `binding=${options.binding}`,
    `environment=${options.environment}`,
    `database=${databaseName}`,
    `location=${options.location}`,
  ].join(' '),
)

if (options.dryRun) {
  console.log('Dry run enabled. No remote or file changes will be made.')
  process.exit(0)
}

if (!options.skipDelete) {
  runCommand('Deleting existing D1 database', [
    'bun',
    'x',
    'wrangler',
    'd1',
    'delete',
    databaseName,
    '-y',
  ])
}

runCommand('Creating replacement D1 database', [
  'bun',
  'x',
  'wrangler',
  'd1',
  'create',
  databaseName,
  '--location',
  options.location,
])

const newDatabaseId = waitForDatabaseId(databaseName)
console.log(`Resolved new database id for ${databaseName}: ${newDatabaseId}`)

for (const configPath of wranglerConfigPaths) {
  patchWranglerConfig(configPath, options.binding, options.environment, newDatabaseId)
}

if (options.migrate) {
  runCommand('Applying migrations to the recreated database', [
    'bash',
    './libs/db/scripts/migrate-remote-db.sh',
    bindingFamilies[options.binding],
    options.environment,
  ])
}

if (options.deploy) {
  runCommand(`Deploying ${options.environment} workers`, [
    'bun',
    'run',
    `deploy:${options.environment}`,
  ])
}

if (options.probe) {
  runCommand(`Running ${options.environment} placement probes`, [
    'bash',
    './scripts/run-d1-placement-probes.sh',
    options.environment,
    String(options.iterations),
  ])
}

if (options.binding === 'DB_META') {
  console.log(
    [
      'Meta database recreated.',
      `Run \`bun run db:seed:${options.environment}:meta\` if you want to restore baseline meta seed data.`,
    ].join(' '),
  )
}

function parseArgs(args: string[]): Options {
  const defaults: Options = {
    binding: 'DB_META',
    deploy: false,
    dryRun: false,
    environment: 'preview',
    iterations: 20,
    location: detectDefaultLocationHint(),
    migrate: true,
    probe: false,
    skipDelete: false,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]

    switch (arg) {
      case '--binding':
        defaults.binding = expectValue(args, ++index, '--binding') as BindingName
        break
      case '--env':
      case '--environment':
        defaults.environment = expectValue(
          args,
          ++index,
          '--environment',
        ) as Environment
        break
      case '--location':
        defaults.location = expectValue(args, ++index, '--location')
        break
      case '--iterations':
        defaults.iterations = Number(expectValue(args, ++index, '--iterations'))
        break
      case '--deploy':
        defaults.deploy = true
        break
      case '--probe':
        defaults.probe = true
        break
      case '--dry-run':
        defaults.dryRun = true
        break
      case '--skip-delete':
        defaults.skipDelete = true
        break
      case '--skip-migrate':
        defaults.migrate = false
        break
      case '--help':
        printHelpAndExit(0)
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!isBindingName(defaults.binding)) {
    throw new Error(`Unsupported binding: ${defaults.binding}`)
  }

  if (!isEnvironment(defaults.environment)) {
    throw new Error(`Unsupported environment: ${defaults.environment}`)
  }

  if (!Number.isInteger(defaults.iterations) || defaults.iterations < 1) {
    throw new Error('--iterations must be a positive integer.')
  }

  return defaults
}

function expectValue(args: string[], index: number, flag: string) {
  const value = args[index]

  if (!value) {
    throw new Error(`Missing value for ${flag}`)
  }

  return value
}

function printHelpAndExit(code: number): never {
  console.log(`Usage:
  bun ./scripts/recreate-d1-binding.ts --binding DB_META --env preview [options]

Options:
  --binding <binding>       One of DB_META, DB_CURRENT, DB_HISTORY_HK_2025, DB_HISTORY_HK_2026, DB_SOURCE_HK_2025, DB_SOURCE_HK_2026
  --env <preview|production>
  --location <hint>         Passed through to wrangler d1 create. Defaults to apac-ne when supported by wrangler, otherwise apac.
  --deploy                  Run bun run deploy:<env> after patching configs.
  --probe                   Run placement probes after optional deploy.
  --iterations <n>          Probe iterations when --probe is set. Defaults to 20.
  --skip-delete             Skip wrangler d1 delete before create.
  --skip-migrate            Skip migrations after recreate.
  --dry-run                 Print intent without mutating remote state or files.
`)
  process.exit(code)
}

function isBindingName(value: string): value is BindingName {
  return value in bindingFamilies
}

function isEnvironment(value: string): value is Environment {
  return value === 'preview' || value === 'production'
}

function resolveDatabaseName(binding: BindingName, environment: Environment) {
  const raw = readFileSync(resolve(repoRoot, 'apps/harbour-api/wrangler.jsonc'), 'utf8')
  const config = parse(raw) as WranglerConfig
  const envConfig = config.env?.[environment]
  const entries = envConfig?.d1_databases ?? []
  const match = entries.find(entry => entry.binding === binding)

  if (!match?.database_name) {
    throw new Error(`Could not resolve database_name for ${binding} in ${environment}.`)
  }

  return String(match.database_name)
}

function waitForDatabaseId(databaseName: string) {
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const databases = listDatabases()
    const match = databases.find(database => database.name === databaseName)

    if (match?.uuid) {
      return match.uuid
    }

    console.log(
      `Database id for ${databaseName} not visible yet. Waiting before retry ${attempt}/10.`,
    )
    Bun.sleepSync(2000)
  }

  throw new Error(`Timed out waiting for a new database id for ${databaseName}.`)
}

function listDatabases() {
  const output = execFileSync('bun', ['x', 'wrangler', 'd1', 'list', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
  })

  return JSON.parse(output) as D1ListEntry[]
}

function detectDefaultLocationHint() {
  try {
    const helpOutput = execFileSync(
      'bun',
      ['x', 'wrangler', 'd1', 'create', '--help'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['inherit', 'pipe', 'inherit'],
      },
    )

    return helpOutput.includes('apac-ne') ? 'apac-ne' : 'apac'
  } catch {
    return 'apac'
  }
}

function patchWranglerConfig(
  configPath: string,
  binding: BindingName,
  environment: Environment,
  newDatabaseId: string,
) {
  const raw = readFileSync(configPath, 'utf8')
  const config = parse(raw) as WranglerConfig
  let changed = false

  const patchEntry = (
    entry: WranglerD1DatabaseEntry,
    mode: 'preview-primary' | 'preview-reference' | 'production-primary',
  ) => {
    if (!entry || entry.binding !== binding) {
      return
    }

    switch (mode) {
      case 'preview-primary':
        if (entry.database_id !== newDatabaseId) {
          entry.database_id = newDatabaseId
          changed = true
        }
        if (
          'preview_database_id' in entry &&
          entry.preview_database_id !== newDatabaseId
        ) {
          entry.preview_database_id = newDatabaseId
          changed = true
        }
        break
      case 'preview-reference':
        if (
          'preview_database_id' in entry &&
          entry.preview_database_id !== newDatabaseId
        ) {
          entry.preview_database_id = newDatabaseId
          changed = true
        }
        break
      case 'production-primary':
        if (entry.database_id !== newDatabaseId) {
          entry.database_id = newDatabaseId
          changed = true
        }
        break
    }
  }

  const patchEntries = (
    entries: unknown,
    mode: 'preview-primary' | 'preview-reference' | 'production-primary',
  ) => {
    if (!Array.isArray(entries)) {
      return
    }

    for (const entry of entries) {
      patchEntry(entry, mode)
    }
  }

  if (environment === 'preview') {
    patchEntries(config.d1_databases, 'preview-primary')
    patchEntries(config.env?.preview?.d1_databases, 'preview-primary')
    patchEntries(config.env?.production?.d1_databases, 'preview-reference')
  } else {
    patchEntries(config.env?.production?.d1_databases, 'production-primary')
  }

  if (!changed) {
    console.log(
      `No ${environment} D1 id changes needed in ${relativeToRepo(configPath)}.`,
    )
    return
  }

  writeFileSync(configPath, `${stringify(config, null, 2)}\n`)
  console.log(`Patched ${relativeToRepo(configPath)} with ${binding}=${newDatabaseId}.`)
}

function relativeToRepo(path: string) {
  return path.replace(`${repoRoot}/`, '')
}

function runCommand(label: string, command: string[]) {
  const [executable, ...args] = command

  if (!executable) {
    throw new Error(`Cannot run "${label}" with an empty command.`)
  }

  console.log(`${label}: ${command.join(' ')}`)
  execFileSync(executable, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  })
}
