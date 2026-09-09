#!/usr/bin/env bun

const atlasAppUrl = 'http://localhost:5173'
const atlasApiUrl = 'http://localhost:8787'
const registryReleasesPath = '/v0.1/api/releases?view=review'

type RegistryRelease = {
  apiFamily: string
  code: string
  contributingSources?: Array<{
    sourceCode: string
    sourceReleaseCode: string
  }>
}

const apiReleaseTabs = [
  'release',
  'guide',
  'schema',
  'samples',
  'stats',
  'audit',
  'sources',
] as const

const sourceReleaseTabs = [
  'notes',
  'schema',
  'samples',
  'stats',
  'audit',
  'releases',
  'assembly',
] as const

const usage = `Open every tab for the latest local API-domain releases and their source releases.

Usage:
  bun run review:release-tabs [--print]

Discovery fetches ${atlasApiUrl}${registryReleasesPath}, then passes every local URL to one $BROWSER instance.

Options:
  --print  List the URLs without opening $BROWSER
  --help   Show this help`

function isRegistryRelease(value: unknown): value is RegistryRelease {
  if (!value || typeof value !== 'object') return false
  const release = value as Partial<RegistryRelease>
  return typeof release.apiFamily === 'string' && typeof release.code === 'string'
}

function parsePrintOnly(args: string[]) {
  if (args.includes('--help')) {
    console.log(usage)
    process.exit(0)
  }
  if (args.every(argument => argument === '--print')) return args.includes('--print')
  throw new Error(`Unknown option: ${args.find(argument => argument !== '--print')}`)
}

async function getReviewReleases() {
  const requestUrl = new URL(registryReleasesPath, atlasApiUrl).href
  let response: Response

  try {
    response = await fetch(requestUrl, { signal: AbortSignal.timeout(10_000) })
  } catch {
    throw new Error(
      `Atlas API is not available at ${atlasApiUrl}. Start it with \`bun run dev:atlas\`, then rerun \`bun run review:release-tabs\`.`,
    )
  }

  if (!response.ok) {
    throw new Error(
      `Registry request failed: ${requestUrl} returned HTTP ${response.status}.`,
    )
  }

  const body = (await response.json()) as { data?: unknown }
  if (!Array.isArray(body.data) || !body.data.every(isRegistryRelease)) {
    throw new Error(`The registry response at ${requestUrl} has an unexpected shape.`)
  }

  return body.data
}

function tabUrl(pathname: string, tab: string) {
  const url = new URL(pathname, atlasAppUrl)
  url.searchParams.set('tab', tab)
  return url.href
}

const releaseUrls = (release: RegistryRelease) => {
  const pathname = `/apis/${encodeURIComponent(release.apiFamily)}/${encodeURIComponent(release.code)}`
  return apiReleaseTabs.map(tab => tabUrl(pathname, tab))
}

const sourceUrls = (
  source: NonNullable<RegistryRelease['contributingSources']>[number],
) => {
  const pathname = `/sources/${encodeURIComponent(source.sourceCode)}/${encodeURIComponent(source.sourceReleaseCode)}`
  return sourceReleaseTabs.map(tab => tabUrl(pathname, tab))
}

function buildReviewUrls(releases: RegistryRelease[]) {
  const apiUrls = releases.flatMap(releaseUrls)
  const sourceTabUrls = [
    ...new Set(
      releases.flatMap(release =>
        (release.contributingSources ?? []).flatMap(sourceUrls),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right))
  return [...apiUrls, ...sourceTabUrls]
}

async function main() {
  const printOnly = parsePrintOnly(process.argv.slice(2))
  const urls = buildReviewUrls(await getReviewReleases())
  if (!urls.length) throw new Error('The registry has no published API releases.')

  if (printOnly) {
    for (const url of urls) console.log(url)
    return
  }

  const browser = process.env.BROWSER
  if (!browser) throw new Error('$BROWSER is not set.')

  const browserProcess = Bun.spawn([browser, ...urls], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  browserProcess.unref()

  console.log(`Opened ${urls.length} review tabs in $BROWSER.`)
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
