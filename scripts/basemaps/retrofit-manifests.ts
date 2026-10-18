import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve(process.argv[2] ?? '/tmp/basemap-backfill')
const apply = process.argv.includes('--apply')
const purgeOnly = process.argv.includes('--purge-only')
const manifestUrls: string[] = []
const rows = JSON.parse(
  await readFile(resolve(directory, 'stats.json'), 'utf8'),
) as Array<{ region: string; version: string; archiveSha256: string }>
const names: Record<string, string> = { hk: 'hongkong', mo: 'macau', gba: 'gba' }
const wrangler = resolve(import.meta.dir, '../../node_modules/.bin/wrangler')
await mkdir(resolve(directory, 'r2-originals'), { recursive: true })
async function run(args: string[]) {
  const process = Bun.spawn([wrangler, ...args], {
    env: { ...Bun.env, WRANGLER_LOG_PATH: '/tmp/basemap-retrofit-wrangler.log' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [status, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (status !== 0) throw new Error(`Wrangler failed (${status}): ${stderr || stdout}`)
}
for (const row of rows) {
  if (!names[row.region] || !/^\d{4}-\d{2}-\d{2}$/.test(row.version))
    throw new Error('Invalid release identity')
  const proposed = JSON.parse(
    await readFile(
      resolve(directory, `${row.region}-${row.version}.manifest.json`),
      'utf8',
    ),
  )
  if (!proposed.release.schemaEvidence) continue
  manifestUrls.push(
    `https://tiles.saanseoi.hk/releases/${row.region}/${row.version}.json`,
  )
  if (purgeOnly) continue
  const key = `ss-pmtiles/basemap/${row.region}/${names[row.region]}-${row.version}.json`
  const originalPath = resolve(
    directory,
    'r2-originals',
    `${row.region}-${row.version}.json`,
  )
  const currentPath = resolve(directory, `${row.region}-${row.version}.r2-current.json`)
  await run(['r2', 'object', 'get', key, '--remote', '--file', currentPath])
  const originalText = await readFile(currentPath, 'utf8')
  const original = JSON.parse(originalText)
  if (
    original.region.code !== row.region ||
    original.release.version !== row.version ||
    original.release.archive.sha256 !== row.archiveSha256
  )
    throw new Error(`Manifest identity changed: ${key}`)
  if (original.release.schema) {
    console.log(`Already recorded: ${key}`)
    continue
  }
  await writeFile(originalPath, originalText, { flag: 'wx' }).catch(error => {
    if (error.code !== 'EEXIST') throw error
  })
  const updated = {
    ...original,
    release: {
      ...original.release,
      schema: proposed.release.schema,
      schemaEvidence: proposed.release.schemaEvidence,
    },
  }
  const updatedPath = resolve(directory, `${row.region}-${row.version}.r2-updated.json`)
  await writeFile(updatedPath, `${JSON.stringify(updated, null, 2)}\n`)
  if (apply) {
    await run([
      'r2',
      'object',
      'put',
      key,
      '--remote',
      '--file',
      updatedPath,
      '--content-type',
      'application/json',
    ])
    const verification = resolve(
      directory,
      `${row.region}-${row.version}.r2-verified.json`,
    )
    await run(['r2', 'object', 'get', key, '--remote', '--file', verification])
    if (
      (await readFile(verification, 'utf8')) !== (await readFile(updatedPath, 'utf8'))
    )
      throw new Error(`Verification failed: ${key}`)
  }
  console.log(`${apply ? 'Retrofitted and verified' : 'Prepared'}: ${key}`)
}

if ((apply || purgeOnly) && manifestUrls.length) {
  const token = process.env.CLOUDFLARE_API_TOKEN
  if (!token)
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required to purge the updated manifest URLs',
    )
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const zones = await fetch(
    'https://api.cloudflare.com/client/v4/zones?name=saanseoi.hk&status=active',
    { headers },
  )
  const zone = (await zones.json()) as {
    success: boolean
    result?: Array<{ id: string }>
  }
  if (!zones.ok || !zone.success || !zone.result?.[0])
    throw new Error('Could not resolve the zone for exact manifest cache purging')
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zone.result[0].id}/purge_cache`,
    { method: 'POST', headers, body: JSON.stringify({ files: manifestUrls }) },
  )
  const result = (await response.json()) as { success: boolean }
  if (!response.ok || !result.success)
    throw new Error('Exact manifest cache purge failed')
  console.log(`Purged ${manifestUrls.length} manifest URLs; tile caches retained`)
}
