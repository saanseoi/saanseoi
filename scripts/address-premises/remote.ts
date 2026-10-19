// biome-ignore-all lint/suspicious/noUndeclaredEnvVars: Direct operational CLI, not a cached Turbo task.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readDeploymentConfig } from './config'
import {
  assertLocked,
  counts,
  lock,
  marker,
  migrate,
  unlock,
  type Query,
  type Row,
  type Statement,
} from './data'

type Target = { binding: string; database_id: string; database_name: string }
const root = resolve(import.meta.dir, '../..')
const [phase, environment] = Bun.argv.slice(2)
if (
  !['check', 'begin', 'apply', 'finish'].includes(phase ?? '') ||
  !['preview', 'production'].includes(environment ?? '')
)
  throw new Error(
    'Usage: bun scripts/address-premises/remote.ts <check|begin|apply|finish> <preview|production>',
  )
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_D1_TOKEN
if (!account || !token)
  throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN are required')
const config = await readDeploymentConfig(`${root}/apps/harbour-api/wrangler.jsonc`)
const bindings: Target[] = config.env[environment!].d1_databases
const targets = bindings.filter(
  d =>
    d.binding === 'DB_CURRENT' ||
    /^DB_HISTORY_[A-Z]{2}_(BEFORE|\d{4})$/.test(d.binding),
)
if (
  !targets.some(d => d.binding === 'DB_CURRENT') ||
  targets.length < 2 ||
  new Set(targets.map(d => d.database_id)).size !== targets.length
)
  throw new Error('Incomplete or duplicate CURRENT/HISTORY targets')
const output = `${root}/.local/address-premises/${environment}`
await mkdir(output, { recursive: true })

// Space requests across concurrently processed shards; retry only explicit rate limits.
let nextRequestAt = 0
async function paceRequest() {
  const wait = Math.max(0, nextRequestAt - Date.now())
  nextRequestAt = Math.max(nextRequestAt, Date.now()) + 300
  if (wait) await new Promise(resolve => setTimeout(resolve, wait))
}

async function api(
  target: Target,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<unknown> {
  await paceRequest()
  const batch = (body as { batch?: Statement[] } | undefined)?.batch
  const readOnly =
    body === undefined ||
    !!batch?.every(statement =>
      /^\s*(SELECT\b|PRAGMA\s+(table_info|foreign_key_check)\b)/i.test(statement.sql),
    )
  let response: Response
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${target.database_id}${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60_000),
      },
    )
  } catch (error) {
    if (!readOnly || attempt >= 3) throw error
    console.warn(
      JSON.stringify({
        binding: target.binding,
        retry: attempt + 1,
        reason: 'read transport failure',
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 2000))
    return api(target, path, body, attempt + 1)
  }
  if (readOnly && response.status >= 500 && attempt < 3) {
    await response.body?.cancel()
    console.warn(
      JSON.stringify({
        binding: target.binding,
        retry: attempt + 1,
        status: response.status,
      }),
    )
    await new Promise(resolve => setTimeout(resolve, 2000))
    return api(target, path, body, attempt + 1)
  }
  if (response.status === 429 && attempt < 5) {
    await response.body?.cancel()
    const delay = Math.min(
      30_000,
      Math.max(1000, Number(response.headers.get('retry-after') ?? 5) * 1000),
    )
    await new Promise(resolve => setTimeout(resolve, delay))
    return api(target, path, body, attempt + 1)
  }
  const payload = (await response.json()) as {
    success: boolean
    result: unknown
    errors?: unknown
  }
  if (!response.ok || !payload.success)
    throw new Error(
      `${target.binding}: Cloudflare ${response.status}: ${JSON.stringify(payload.errors)}`,
    )
  return payload.result
}
function query(target: Target): Query {
  return async (statements: Statement[]) => {
    const results = (await api(target, '/query', { batch: statements })) as Array<{
      success: boolean
      results: Row[]
    }>
    if (results.length !== statements.length || results.some(result => !result.success))
      throw new Error(`${target.binding}: incomplete or failed D1 batch`)
    return results.map(result => result.results)
  }
}
async function recorded(target: Target, name = marker) {
  const [rows] = await query(target)([
    { sql: 'SELECT name FROM d1_migrations WHERE name=?', params: [name] },
  ])
  return rows!.length === 1
}
async function needsMaintenance(target: Target) {
  if (!(await recorded(target))) return true
  const [columns, locks] = await query(target)([
    { sql: 'PRAGMA table_info(address2dI18n)' },
    {
      sql: "SELECT name FROM sqlite_master WHERE type='trigger' AND substr(name,1,15)='_premises_lock_'",
    },
  ])
  if (
    !columns!.some(c => c.name === 'premisesName') ||
    columns!.some(c => c.name === 'estateName')
  )
    throw new Error('Recorded maintenance does not match schema')
  return locks!.length > 0
}
async function command(args: string[]) {
  const child = Bun.spawn(args, { cwd: root, stdout: 'inherit', stderr: 'inherit' })
  if ((await child.exited) !== 0)
    throw new Error(`Command failed: ${args.slice(0, 4).join(' ')}`)
}
async function serviceConfig(service: string) {
  const config = await readDeploymentConfig(`${root}/apps/${service}/wrangler.jsonc`)
  return config.env[environment!]
}
async function servicesAre(maintenance: boolean) {
  for (const service of ['atlas-api', 'harbour-api']) {
    const settings = await serviceConfig(service)
    const domain = settings.routes.find(
      (route: { custom_domain?: boolean }) => route.custom_domain,
    )?.pattern
    if (!domain) throw new Error(`No custom domain for ${service}`)
    const response = await fetch(
      `https://${domain}/${service === 'atlas-api' && !maintenance ? 'openapi/addresses/v0.1' : 'openapi'}?premises-migration=${Date.now()}`,
      { signal: AbortSignal.timeout(30_000), cache: 'no-store' },
    )
    if (maintenance) {
      if (
        response.status !== 503 ||
        response.headers.get('x-saanseoi-maintenance') !== 'address-premises-name-v1'
      )
        throw new Error(`${service}: maintenance response not live`)
    } else {
      if (!response.ok || response.headers.has('x-saanseoi-maintenance'))
        throw new Error(`${service}: application is not restored`)
      const body = await response.text()
      if (
        service === 'atlas-api' &&
        (!body.includes('premisesName') || body.includes('estateName'))
      )
        throw new Error('Live Address API does not expose the premises contract')
    }
  }
}
const workerConfig = await serviceConfig('harbour-workers')
const queues: string[] = (workerConfig.queues?.consumers ?? []).map(
  (c: { queue: string }) => c.queue,
)
if (!queues.length) throw new Error('No cleanup queue configured')
const current = targets.find(target => target.binding === 'DB_CURRENT')!
async function queuePaused(name: string) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/queues?name=${encodeURIComponent(name)}`,
    {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    },
  )
  const payload = (await response.json()) as {
    success: boolean
    result: Array<{ queue_name: string; settings?: { delivery_paused?: boolean } }>
  }
  const queue = payload.result?.find(q => q.queue_name === name)
  if (!response.ok || !payload.success || !queue)
    throw new Error(`Cannot verify queue state: ${name}`)
  return queue.settings?.delivery_paused === true
}

// Verify exact names and IDs before any mutation, including every retained registered shard.
for (const target of targets) {
  const info = (await api(target, '')) as { name: string }
  if (info.name !== target.database_name)
    throw new Error(`Database identity mismatch: ${target.binding}`)
}
const meta = bindings.find(d => d.binding === 'DB_META')!
const [registered] = await query(meta)([
  {
    sql: "SELECT databaseId, bindingName FROM dataShards WHERE environment=? AND shardType='history'",
    params: [environment],
  },
])
for (const shard of registered!)
  if (
    !targets.some(
      d => d.database_id === shard.databaseId && d.binding === shard.bindingName,
    )
  )
    throw new Error(
      `Retained HISTORY shard missing from configuration: ${shard.bindingName}`,
    )

if (phase === 'check') {
  let needed = false
  for (const target of targets) if (await needsMaintenance(target)) needed = true
  console.log(
    JSON.stringify({
      environment,
      needed,
      databases: targets.map(d => d.database_name),
    }),
  )
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `needed=${needed}\n`)
} else if (phase === 'begin') {
  // Refuse active ingestion before touching service availability.
  const [running] = await query(meta)([
    { sql: "SELECT count(*) AS n FROM processingRuns WHERE status='running'" },
  ])
  if (Number(running![0]!.n))
    throw new Error('Ingestion is active; finish or stop it before retrying deployment')
  const recovery = []
  for (const target of targets) {
    const bookmark = (await api(target, '/time_travel/bookmark')) as {
      bookmark?: string
    }
    if (!bookmark.bookmark)
      throw new Error(`Missing recovery bookmark for ${target.binding}`)
    recovery.push({ ...target, ...bookmark })
  }
  // Persist before maintenance starts; workflow uploads this even when later steps fail.
  await writeFile(
    `${output}/recovery-${Date.now()}.json`,
    JSON.stringify(
      { at: new Date().toISOString(), environment, databases: recovery },
      null,
      2,
    ),
  )
  for (const queue of queues) {
    const owned = `${marker}-queue-${queue}`
    if (!(await queuePaused(queue)) && !(await recorded(current, owned)))
      await query(current)([
        { sql: 'INSERT INTO d1_migrations(name) VALUES (?)', params: [owned] },
      ])
    await command(['bun', 'x', 'wrangler', 'queues', 'pause-delivery', queue])
    if (!(await queuePaused(queue))) throw new Error(`Queue did not pause: ${queue}`)
  }
  for (const service of ['atlas-api', 'harbour-api'])
    await command([
      'bun',
      'x',
      'wrangler',
      'deploy',
      `${root}/scripts/address-premises/${service === 'atlas-api' ? 'atlas-maintenance-worker' : 'maintenance-worker'}.ts`,
      '--config',
      `${root}/apps/${service}/wrangler.jsonc`,
      '--env',
      environment!,
      '--keep-vars',
    ])
  await servicesAre(true)
  const [stillRunning] = await query(meta)([
    { sql: "SELECT count(*) AS n FROM processingRuns WHERE status='running'" },
  ])
  if (Number(stillRunning![0]!.n))
    throw new Error(
      'Ingestion started during maintenance setup; stop it before retrying',
    )
  for (const target of targets) await lock(query(target))
  const frozenRecovery = []
  for (const target of targets)
    frozenRecovery.push({
      ...target,
      ...((await api(target, '/time_travel/bookmark')) as object),
    })
  await writeFile(
    `${output}/frozen-recovery-${Date.now()}.json`,
    JSON.stringify({ environment, databases: frozenRecovery }, null, 2),
  )
  for (const target of targets) {
    const before = await counts(query(target))
    await writeFile(
      `${output}/${target.binding}-before.json`,
      JSON.stringify(before, null, 2),
    )
  }
} else if (phase === 'apply') {
  await servicesAre(true)
  const applied = await Promise.allSettled(
    targets.map(async target => {
      try {
        const result = await migrate(
          query(target),
          target.binding !== 'DB_CURRENT',
          progress =>
            console.log(JSON.stringify({ binding: target.binding, ...progress })),
        )
        const before = JSON.parse(
          await readFile(`${output}/${target.binding}-before.json`, 'utf8'),
        )
        if (JSON.stringify(before) !== JSON.stringify(result.tables))
          throw new Error(`${target.binding}: schema migration changed table counts`)
        await writeFile(
          `${output}/${target.binding}-verified.json`,
          JSON.stringify(result, null, 2),
        )
        console.log(JSON.stringify({ binding: target.binding, ...result }))
      } catch (error) {
        console.error(
          JSON.stringify({
            binding: target.binding,
            stage: 'failed',
            error: error instanceof Error ? error.message : String(error),
          }),
        )
        throw error
      }
    }),
  )
  const failures = applied.filter(result => result.status === 'rejected')
  if (failures.length)
    throw new AggregateError(
      failures.map(result => result.reason),
      'Address maintenance failed; keep services paused',
    )
  // Mark complete only after every shard passes. Locks remain until both APIs are restored.
  for (const target of targets)
    if (!(await recorded(target, `${marker}-verified`)))
      await query(target)([
        {
          sql: 'INSERT INTO d1_migrations(name) VALUES (?)',
          params: [`${marker}-verified`],
        },
      ])
} else {
  await servicesAre(false)
  for (const target of targets) {
    if (!(await recorded(target, `${marker}-verified`)))
      throw new Error(`Unverified migration: ${target.binding}`)
    // Every hash was read back by apply. Continuous write locks make another full scan unnecessary.
    await assertLocked(query(target))
  }
  for (const target of targets) await unlock(query(target))
  for (const queue of queues) {
    const owned = `${marker}-queue-${queue}`
    if (await recorded(current, owned)) {
      await command(['bun', 'x', 'wrangler', 'queues', 'resume-delivery', queue])
      if (await queuePaused(queue)) throw new Error(`Queue did not resume: ${queue}`)
      await query(current)([
        { sql: 'DELETE FROM d1_migrations WHERE name=?', params: [owned] },
      ])
    }
  }
  for (const target of targets)
    if (!(await recorded(target)))
      await query(target)([
        { sql: 'INSERT INTO d1_migrations(name) VALUES (?)', params: [marker] },
      ])
  await writeFile(
    `${output}/complete.json`,
    JSON.stringify({ environment, completedAt: new Date().toISOString() }, null, 2),
  )
}
