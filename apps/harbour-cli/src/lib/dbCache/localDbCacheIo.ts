import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  createCloudflareD1QueryClient,
  type RemoteD1QueryClient,
} from './remoteD1Client.ts'
import type {
  CachePruneOperation,
  D1TargetRecord,
  LocalDbCacheProgressEvent,
  RemoteTableImport,
  SqliteCacheWorkerPayload,
} from './localDbCacheTypes.ts'
import {
  CACHE_ROOT,
  DB_CACHE_PROGRESS_HEARTBEAT_MS,
  REPO_ROOT,
  SQLITE_CACHE_WORKER_PATH,
  WRANGLER_CONFIG_HOME,
  WRANGLER_CONFIG_PATH,
  WRANGLER_LOG_PATH,
} from './localDbCacheConfig.ts'

export async function replaceCachedTableRows(
  filePath: string,
  bindingName: string,
  tableImports: RemoteTableImport[],
  onTable?: (tableImport: RemoteTableImport) => Promise<void> | void,
  onBusy?: () => Promise<void> | void,
) {
  for (const tableImport of tableImports) {
    await onTable?.(tableImport)
  }

  await runWithHeartbeat(onBusy, () =>
    runSqliteCacheWorker({
      bindingName,
      filePath,
      tableImports,
      type: 'replace-table-rows',
    }),
  )
}

export async function checkpointSqliteDatabase(filePath: string) {
  await runSqliteCacheWorker({
    filePath,
    type: 'checkpoint',
  })
}

export async function exportRemoteDatabase(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  outputPath: string,
  options: { schemaOnly?: boolean } = {},
) {
  await runMirrorCommand([
    'bash',
    'libs/db/scripts/run-d1-export.sh',
    targetRecord.databaseName,
    '--config',
    WRANGLER_CONFIG_PATH,
    '--env',
    target,
    '--remote',
    ...(options.schemaOnly ? ['--no-data'] : []),
    '--output',
    outputPath,
  ])
}

export async function exportRemoteTable(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  tableName: string,
  outputPath: string,
  options: { schemaOnly?: boolean } = {},
) {
  await runMirrorCommand([
    'bash',
    'libs/db/scripts/run-d1-export.sh',
    targetRecord.databaseName,
    '--config',
    WRANGLER_CONFIG_PATH,
    '--env',
    target,
    '--remote',
    `--table=${tableName}`,
    ...(options.schemaOnly ? ['--no-data'] : []),
    '--output',
    outputPath,
  ])
}

export async function importDatabaseDumpsToSqlite(
  dumpPaths: string[],
  destinationPath: string,
  pruneOperations: CachePruneOperation[] = [],
  binaryTableImports: Array<
    Pick<RemoteTableImport, 'binaryRowsPath' | 'tableName'>
  > = [],
) {
  await runSqliteCacheWorker({
    binaryTableImports,
    destinationPath,
    dumpPaths,
    pruneOperations,
    type: 'import-dumps',
  })
}

export async function runWithProgressHeartbeat<T>(
  onProgress: ((event: LocalDbCacheProgressEvent) => Promise<void> | void) | undefined,
  event: LocalDbCacheProgressEvent,
  work: () => Promise<T>,
) {
  return runWithHeartbeat(() => onProgress?.(event), work)
}

async function runWithHeartbeat<T>(
  onHeartbeat: (() => Promise<void> | void) | undefined,
  work: () => Promise<T>,
) {
  let running = true
  const heartbeat = setInterval(() => {
    if (!running) {
      return
    }

    void onHeartbeat?.()
  }, DB_CACHE_PROGRESS_HEARTBEAT_MS)

  try {
    await onHeartbeat?.()
    return await work()
  } finally {
    running = false
    clearInterval(heartbeat)
  }
}

async function runSqliteCacheWorker(payload: SqliteCacheWorkerPayload) {
  await mkdir(CACHE_ROOT, { recursive: true })
  const payloadPath = resolve(
    CACHE_ROOT,
    `.sqlite-worker-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}.json`,
  )

  await writeFile(payloadPath, JSON.stringify(payload))

  try {
    const proc = Bun.spawn([process.execPath, SQLITE_CACHE_WORKER_PATH, payloadPath], {
      cwd: REPO_ROOT,
      env: process.env,
      stderr: 'pipe',
      stdout: 'pipe',
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    if (exitCode !== 0) {
      throw new Error((stderr || stdout || 'SQLite cache worker failed.').trim())
    }
  } finally {
    await rm(payloadPath, { force: true }).catch(() => undefined)
  }
}

export async function runMirrorCommand(command: string[]) {
  await mkdir(WRANGLER_CONFIG_HOME, { recursive: true })
  await mkdir(WRANGLER_LOG_PATH, { recursive: true })

  const proc = Bun.spawn(command, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? WRANGLER_LOG_PATH,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? WRANGLER_CONFIG_HOME,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (exitCode !== 0) {
    throw new Error((stderr || stdout || command.join(' ')).trim())
  }
}

export function createRemoteD1QueryClient(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
): RemoteD1QueryClient {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim()
  const apiToken = process.env.CLOUDFLARE_D1_TOKEN?.trim()

  if (accountId && apiToken && targetRecord.databaseId) {
    return createCloudflareD1QueryClient({
      accountId,
      apiToken,
      databaseId: targetRecord.databaseId,
    })
  }

  return {
    query: command => queryRemoteD1WithWrangler(targetRecord, target, command),
  }
}

async function queryRemoteD1WithWrangler(
  targetRecord: D1TargetRecord,
  target: 'preview' | 'production',
  command: string,
) {
  await mkdir(WRANGLER_CONFIG_HOME, { recursive: true })
  await mkdir(WRANGLER_LOG_PATH, { recursive: true })

  // Invoke Node directly so Bun cannot load repository .env files. The result
  // contains only ordinary SQL values or ASCII hex; BLOBs are never requested.
  const env = { ...process.env }
  if (env.CLOUDFLARE_D1_TOKEN) {
    env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_D1_TOKEN
  } else {
    delete env.CLOUDFLARE_API_TOKEN
  }
  const proc = Bun.spawn(
    [
      'node',
      resolve(REPO_ROOT, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      targetRecord.databaseName,
      '--config',
      WRANGLER_CONFIG_PATH,
      '--env',
      target,
      '--remote',
      '--command',
      command,
      '--json',
    ],
    {
      cwd: '/tmp',
      env: {
        ...env,
        WRANGLER_LOG_PATH: env.WRANGLER_LOG_PATH ?? WRANGLER_LOG_PATH,
        XDG_CONFIG_HOME: env.XDG_CONFIG_HOME ?? WRANGLER_CONFIG_HOME,
      },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(
      (stderr || stdout || `D1 query failed for ${targetRecord.bindingName}.`).trim(),
    )
  }
  const jsonStart = stdout.search(/^[[{]/m)
  if (jsonStart === -1) {
    throw new Error(
      `Unexpected D1 query response for ${targetRecord.bindingName}: ${stdout}`,
    )
  }
  const payload = JSON.parse(stdout.slice(jsonStart)) as
    | { error?: unknown; results?: Array<Record<string, unknown>>; success?: boolean }
    | Array<{
        error?: unknown
        results?: Array<Record<string, unknown>>
        success?: boolean
      }>
  const result = Array.isArray(payload) ? payload[0] : payload
  if (!result || result.success === false || result.error) {
    throw new Error(
      `D1 query failed for ${targetRecord.bindingName}: ${JSON.stringify(result?.error ?? result)}`,
    )
  }
  return result.results ?? []
}
