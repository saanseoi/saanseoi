#!/usr/bin/env bun
// Run against an existing server. Fresh browser contexts do not clear server caches.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.AUDIT_BASE_URL ?? 'http://localhost:5173'
const paths = process.argv.slice(2)
if (!paths.length)
  paths.push('/apis/addresses/data-hk-addresses-2026-08-19.0?tab=audit')
const browser = await chromium.launch({ headless: true })
try {
  for (const path of paths) {
    const context = await browser.newContext({
      locale: 'en-GB',
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    const network = await context.newCDPSession(page)
    await network.send('Network.enable', {
      maxTotalBufferSize: 100_000_000,
      maxResourceBufferSize: 20_000_000,
    })
    const errors: string[] = []
    const captureFailures: string[] = []
    const responses: Promise<void>[] = []
    const requests: { url: string; bytes: number }[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      responses.push(
        (async () => {
          if (response.status() >= 400)
            errors.push(`${response.status()} ${response.url()}`)
          if (!response.url().includes('/_app/remote/')) return
          const body = await response.text()
          requests.push({
            url: response.url().split('?')[0],
            bytes: Buffer.byteLength(body),
          })
          if (/"type":"error"/.test(body)) errors.push(body)
        })().catch(error =>
          captureFailures.push(`${response.url().split('?')[0]}: ${error}`),
        ),
      )
    })
    const search = page.getByRole('searchbox', {
      name: /Search processing audit/,
    })
    async function settle() {
      await search.waitFor()
      // Includes the search debounce; networkidle alone can finish before it fires.
      await page.waitForTimeout(350)
      await page.waitForLoadState('networkidle')
      await page
        .locator('[aria-busy="true"]')
        .first()
        .waitFor({ state: 'hidden', timeout: 30_000 })
      assert.equal(await page.getByRole('alert').count(), 0)
    }
    async function sample(label: string, action: () => Promise<unknown>) {
      const start = performance.now()
      const before = requests.length
      await action()
      await settle().catch(async error => {
        console.error({
          label,
          url: page.url(),
          errors,
          body: (await page.locator('body').innerText()).slice(-5000),
        })
        throw error
      })
      await Promise.all(responses)
      const cdp = await context.newCDPSession(page)
      await cdp.send('HeapProfiler.collectGarbage')
      const heap = await cdp.send('Runtime.getHeapUsage')
      await cdp.detach()
      console.log(
        JSON.stringify({
          path,
          label,
          settledMs: Math.round(performance.now() - start),
          remoteRequests: requests.length - before,
          remoteDecodedBytes: requests
            .slice(before)
            .reduce((sum, r) => sum + r.bytes, 0),
          heapBytes: heap.usedSize,
        }),
      )
    }
    await sample('fresh-browser', () => page.goto(new URL(path, base).href))
    await sample('warm-reload', () => page.reload())
    const original = await page.locator('p[aria-busy]').first().innerText()
    await page.evaluate(() => {
      const state = { flashes: 0 }
      Object.assign(window, { auditTestState: state })
      new MutationObserver(records => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (
              node instanceof Element &&
              (node.matches('[role="status"][aria-label]') ||
                node.querySelector('[role="status"][aria-label]'))
            )
              state.flashes++
          }
      }).observe(document.body, { childList: true, subtree: true })
    })
    for (const query of ['mmog', 'Kowloon', '', 'mmog', '']) {
      await sample(`search:${query || '<clear>'}`, () => search.fill(query))
      if (query === 'mmog')
        assert.match(await page.locator('p[aria-busy]').first().innerText(), /^0\s*\//)
      if (!query)
        assert.equal(await page.locator('p[aria-busy]').first().innerText(), original)
    }
    assert.equal(
      await page.evaluate(
        () =>
          (window as unknown as { auditTestState: { flashes: number } }).auditTestState
            .flashes,
      ),
      0,
      'Search reintroduced loading skeletons',
    )
    await page.getByRole('tab', { name: 'Release', exact: true }).click()
    await page.getByRole('tab', { name: 'Audit', exact: true }).click()
    await settle()
    assert.equal(await search.inputValue(), '')
    const returnUrl = page.url()
    const older = page.getByRole('link', { name: /Older release/ }).first()
    const olderUrl = new URL((await older.getAttribute('href'))!, base)
    await older.click()
    await page.waitForURL(url => url.pathname === olderUrl.pathname)
    await settle()
    await page.goBack()
    await settle()
    assert.equal(new URL(page.url()).pathname, new URL(returnUrl).pathname)
    assert.equal(
      await page
        .getByRole('tab', { name: 'Audit', exact: true })
        .getAttribute('aria-selected'),
      'true',
    )
    await Promise.all(responses)
    assert.deepEqual(errors, [], 'Page or remote-query errors')
    console.log(JSON.stringify({ path, passed: true, captureFailures, requests }))
    await context.close()
  }
} finally {
  await browser.close()
}
