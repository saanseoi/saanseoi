import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

type CliOptions = {
  configPath: string
  env: string
  isLocal: boolean
  isRemote: boolean
  manifestPath: string
  persistTo: string | null
}

type ManifestDatabaseEntry = {
  appliedMigrations?: string[]
  bindingName: string
  databaseName: string
  migrationsTable?: string
}

type SnapshotManifest = {
  databases?: ManifestDatabaseEntry[]
}

type D1Binding = {
  binding?: string
  database_name?: string
  migrations_dir?: string
  migrations_table?: string
}

type WranglerConfig = {
  d1_databases?: D1Binding[]
  env?: Record<string, { d1_databases?: D1Binding[] }>
}

type MigrationTarget = {
  bindingName: string
  databaseName: string
  migrationsDir: string
  migrationsTable: string
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.length === 0) {
    fail(
      'Usage: bun ./scripts/apply-d1-migration-manifest.ts <manifest.json> --config <path> --env <preview|production> [--local|--remote] [--persist-to <dir>]',
    )
  }

  const [manifestPathRaw, ...rest] = argv
  let configPath = ''
  let env = 'preview'
  let isLocal = false
  let isRemote = false
  let persistTo: string | null = null

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]

    switch (arg) {
      case '--config':
        configPath = rest[index + 1] ?? ''
        index += 1
        break
      case '--env':
        env = rest[index + 1] ?? env
        index += 1
        break
      case '--persist-to':
        persistTo = rest[index + 1] ?? null
        index += 1
        break
      case '--local':
        isLocal = true
        break
      case '--remote':
        isRemote = true
        break
      default:
        break
    }
  }

  if (!configPath) {
    fail('Applying snapshot migrations requires `--config`.')
  }

  if (isLocal === isRemote) {
    fail(
      'Choose exactly one of `--local` or `--remote` when applying snapshot migrations.',
    )
  }

  return {
    configPath: path.resolve(configPath),
    env,
    isLocal,
    isRemote,
    manifestPath: path.resolve(manifestPathRaw),
    persistTo,
  }
}

function getD1Entries(config: WranglerConfig, env: string) {
  if (env === 'production') {
    return config.env?.production?.d1_databases ?? config.d1_databases ?? []
  }

  return config.env?.preview?.d1_databases ?? config.d1_databases ?? []
}

function resolveTarget(
  configPath: string,
  env: string,
  bindingName: string,
): MigrationTarget {
  const raw = readFileSync(configPath, 'utf8')
  const config = JSON.parse(raw) as WranglerConfig
  const entry = getD1Entries(config, env).find(
    candidate => candidate.binding === bindingName,
  )

  if (!entry?.binding || !entry.database_name) {
    fail(`Could not resolve D1 binding ${bindingName} in ${configPath} for ${env}.`)
  }

  const migrationsDirRaw = entry.migrations_dir
  if (!migrationsDirRaw) {
    fail(`Binding ${bindingName} does not declare migrations_dir in ${configPath}.`)
  }

  return {
    bindingName: entry.binding,
    databaseName: entry.database_name,
    migrationsDir: path.resolve(path.dirname(configPath), migrationsDirRaw),
    migrationsTable: entry.migrations_table ?? 'd1_migrations',
  }
}

function listMigrationFiles(migrationsDir: string, root = migrationsDir): string[] {
  const entries = readdirSync(migrationsDir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const entryPath = path.join(migrationsDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listMigrationFiles(entryPath, root))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.sql')) {
      files.push(path.relative(root, entryPath).replaceAll(path.sep, '/'))
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

function sqlIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function defaultXdgConfigHome(configPath: string) {
  return path.resolve(path.dirname(configPath), '../../.local/wrangler')
}

function parseWranglerExecuteJson(raw: string) {
  const payload = JSON.parse(raw) as
    | Array<{ error?: string; success?: boolean }>
    | { error?: string; success?: boolean }

  const first = Array.isArray(payload) ? payload[0] : payload

  if (!first) {
    fail(
      'Wrangler D1 execute returned an empty payload while applying snapshot migrations.',
    )
  }

  if (first.error) {
    fail(
      typeof first.error === 'string'
        ? first.error
        : `Wrangler D1 execute failed: ${JSON.stringify(first.error)}`,
    )
  }

  if (first.success === false) {
    fail(`Wrangler D1 execute reported failure: ${raw}`)
  }
}

function runWranglerExecute(
  options: CliOptions,
  bindingName: string,
  args: { command?: string; file?: string },
) {
  const proc = Bun.spawnSync({
    cmd: [
      'bun',
      'x',
      'wrangler',
      'd1',
      'execute',
      bindingName,
      '--config',
      options.configPath,
      '--env',
      options.env,
      ...(options.isLocal
        ? ['--local', ...(options.persistTo ? ['--persist-to', options.persistTo] : [])]
        : options.isRemote
          ? ['--remote']
          : []),
      '--json',
      ...(args.command ? ['--command', args.command] : []),
      ...(args.file ? ['--file', args.file] : []),
    ],
    cwd: path.dirname(options.configPath),
    env: {
      ...process.env,
      XDG_CONFIG_HOME:
        process.env.XDG_CONFIG_HOME ?? defaultXdgConfigHome(options.configPath),
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (proc.exitCode !== 0) {
    const stderr = new TextDecoder().decode(proc.stderr).trim()
    fail(
      stderr.length > 0
        ? stderr
        : `Wrangler D1 execute failed while applying snapshot migrations for ${bindingName}.`,
    )
  }

  parseWranglerExecuteJson(new TextDecoder().decode(proc.stdout))
}

function ensureManifestHasMigrationState(entry: ManifestDatabaseEntry) {
  if (!Array.isArray(entry.appliedMigrations)) {
    fail(
      `Snapshot manifest entry for ${entry.bindingName} is missing appliedMigrations. Recreate the snapshot with the updated snapshot command.`,
    )
  }

  return entry.appliedMigrations
}

function validateMigrationPrefix(
  bindingName: string,
  available: string[],
  expected: string[],
) {
  const prefix = available.slice(0, expected.length)

  if (prefix.length !== expected.length) {
    fail(
      `Snapshot for ${bindingName} references ${expected.length} migrations, but only ${available.length} are available in the current repo.`,
    )
  }

  for (let index = 0; index < expected.length; index += 1) {
    if (prefix[index] !== expected[index]) {
      fail(
        `Snapshot migration history for ${bindingName} does not match the current repo.\nExpected prefix: ${expected.join(', ')}\nCurrent prefix: ${prefix.join(', ')}`,
      )
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const manifest = JSON.parse(
    readFileSync(options.manifestPath, 'utf8'),
  ) as SnapshotManifest
  const entries = manifest.databases ?? []

  for (const entry of entries) {
    const target = resolveTarget(options.configPath, options.env, entry.bindingName)
    const expectedMigrations = ensureManifestHasMigrationState(entry)

    if ((entry.migrationsTable ?? target.migrationsTable) !== target.migrationsTable) {
      fail(
        `Snapshot migration table mismatch for ${entry.bindingName}: snapshot=${entry.migrationsTable ?? 'unknown'} current=${target.migrationsTable}`,
      )
    }

    if (expectedMigrations.length === 0) {
      continue
    }

    const availableMigrations = listMigrationFiles(target.migrationsDir)
    validateMigrationPrefix(entry.bindingName, availableMigrations, expectedMigrations)

    runWranglerExecute(options, entry.bindingName, {
      command: `CREATE TABLE IF NOT EXISTS ${sqlIdentifier(target.migrationsTable)} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );`,
    })

    for (const migrationName of expectedMigrations) {
      const migrationPath = path.join(target.migrationsDir, migrationName)
      if (!existsSync(migrationPath)) {
        fail(
          `Snapshot migration file for ${entry.bindingName} is missing from the repo: ${migrationPath}`,
        )
      }

      console.log(
        `Applying snapshot migration for ${entry.bindingName}: ${migrationName}`,
      )
      runWranglerExecute(options, entry.bindingName, { file: migrationPath })
      runWranglerExecute(options, entry.bindingName, {
        command: `INSERT INTO ${sqlIdentifier(target.migrationsTable)} (name) VALUES (${sqlString(migrationName)});`,
      })
    }
  }
}

main()
