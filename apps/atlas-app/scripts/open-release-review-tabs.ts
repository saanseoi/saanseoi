#!/usr/bin/env bun

import { chromium, type BrowserContext, type Page } from 'playwright'

const defaultBaseUrl = 'http://127.0.0.1:5173'
const guidePath = '/guides/use-the-api'

type Options = {
  baseUrl: URL
  headless: boolean
  printOnly: boolean
}

const usage = `Open the current API-domain release notes and their source releases.

Usage:
  bun apps/atlas-app/scripts/open-release-review-tabs.ts [options]

Options:
  --base-url <url>  Atlas app to review (default: ${defaultBaseUrl})
  --print           List the tabs without opening a review browser
  --headless        Run the discovery browser headlessly (implies --print)
  --help            Show this help

Examples:
  bun apps/atlas-app/scripts/open-release-review-tabs.ts
  bun apps/atlas-app/scripts/open-release-review-tabs.ts --base-url https://saanseoi.hk
  bun apps/atlas-app/scripts/open-release-review-tabs.ts --print`

function parseBaseUrl(value: string) {
  const baseUrl = new URL(value)
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error('--base-url must be an absolute HTTP(S) URL.')
  }
  return baseUrl
}

function parseOptions(args: string[]): Options | 'help' {
  let baseUrl = new URL(defaultBaseUrl)
  let headless = false
  let printOnly = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help') return 'help'
    if (argument === '--print') {
      printOnly = true
      continue
    }
    if (argument === '--headless') {
      headless = true
      continue
    }
    if (argument === '--base-url') {
      const value = args[index + 1]
      if (!value) throw new Error('--base-url requires a URL.')
      baseUrl = parseBaseUrl(value)
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }

  return { baseUrl, headless, printOnly: printOnly || headless }
}

const hasRoute = (href: string, baseUrl: URL, firstSegment: string) => {
  const url = new URL(href, baseUrl)
  const segments = url.pathname.split('/').filter(Boolean)
  return (
    url.origin === baseUrl.origin &&
    segments.length === 3 &&
    segments[0] === firstSegment
  )
}

const uniqueUrls = (hrefs: string[], baseUrl: URL) => [
  ...new Set(hrefs.map(href => new URL(href, baseUrl).href)),
]

async function collectHrefs(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(links =>
    links.flatMap(link => {
      const href = link.getAttribute('href')
      return href ? [href] : []
    }),
  )
}

async function loadPage(context: BrowserContext, url: URL | string) {
  const page = await context.newPage()
  const response = await page.goto(url.toString(), { waitUntil: 'domcontentloaded' })
  if (!response?.ok()) {
    await page.close()
    throw new Error(`Could not open ${url} (${response?.status() ?? 'no response'}).`)
  }
  return page
}

async function collectReleaseUrls(context: BrowserContext, baseUrl: URL) {
  const guideUrl = new URL(guidePath, baseUrl)
  const guidePage = await loadPage(context, guideUrl)
  const hrefs = await collectHrefs(
    guidePage,
    'a[aria-label^="How to use the "][href^="/apis/"]',
  )
  await guidePage.close()

  const releaseUrls = uniqueUrls(hrefs, baseUrl).filter(href =>
    hasRoute(href, baseUrl, 'apis'),
  )
  if (!releaseUrls.length) {
    throw new Error(`No published API-domain release notes were found at ${guideUrl}.`)
  }
  return releaseUrls
}

async function collectSourceUrls(
  context: BrowserContext,
  baseUrl: URL,
  releaseUrls: string[],
) {
  const sourceUrls = new Set<string>()

  for (const releaseUrl of releaseUrls) {
    const sourceTabUrl = new URL(releaseUrl)
    sourceTabUrl.hash = ''
    sourceTabUrl.searchParams.set('tab', 'sources')
    const page = await loadPage(context, sourceTabUrl)
    const hrefs = await collectHrefs(page, 'a[href^="/sources/"]')
    await page.close()

    for (const href of hrefs) {
      if (hasRoute(href, baseUrl, 'sources')) {
        sourceUrls.add(new URL(href, baseUrl).href)
      }
    }
  }

  return [...sourceUrls].sort((left, right) => left.localeCompare(right))
}

async function openTabs(context: BrowserContext, urls: string[]) {
  for (const url of urls) {
    await loadPage(context, url)
  }
}

const options = parseOptions(process.argv.slice(2))
if (options === 'help') {
  console.log(usage)
  process.exit(0)
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: options.headless,
})
const context = await browser.newContext()

try {
  const releaseUrls = await collectReleaseUrls(context, options.baseUrl)
  const sourceUrls = await collectSourceUrls(context, options.baseUrl, releaseUrls)
  const urls = [...releaseUrls, ...sourceUrls]

  if (options.printOnly) {
    console.log(
      `Found ${releaseUrls.length} API-domain release note(s) and ${sourceUrls.length} source release page(s).`,
    )
    for (const url of urls) console.log(url)
    await browser.close()
  } else {
    await openTabs(context, urls)
    console.log(
      `Opened ${releaseUrls.length} API-domain release note tab(s) and ${sourceUrls.length} source release tab(s).`,
    )
    await browser.disconnect()
  }
} catch (error) {
  await browser.close()
  throw error
}
