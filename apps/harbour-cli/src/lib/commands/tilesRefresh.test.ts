import { expect, test } from 'bun:test'

test('regional refresh retries reach routing publication while retaining basemap recovery and force paths', async () => {
  // Isolate module mocks from the other tiles tests.
  const script = `
    import { mock } from 'bun:test'
    import assert from 'node:assert/strict'
    import * as storage from './tilesStorage.ts'
    import * as recovery from './tilesCatalogueRecovery.ts'
    import * as execution from './tilesExecution.ts'
    import * as delivery from '../pipeline/local/sqlDeliveryFiles.ts'
    let published = true
    let pending = false
    let routingFails = false
    const calls = []
    mock.module('./tilesStorage.ts', () => ({
      ...storage,
      readRegionVersions: async () => ({ versions: published ? [{ version: '2026-10-01' }] : [] }),
    }))
    mock.module('./tilesCatalogueRecovery.ts', () => ({
      ...recovery,
      readTilesCatalogueIntent: async () => pending ? {} : null,
    }))
    mock.module('../pipeline/local/sqlDeliveryFiles.ts', () => ({
      ...delivery,
      withDeliveryLock: async () => { throw new Error('basemap publication reached') },
    }))
    mock.module('./tilesPreviews.ts', () => ({
      renderBasemapPreviews: async ({ region }) => calls.push('preview:' + region.code),
      renderStyleLibraryPreviews: async region => calls.push('styles:' + region.code),
    }))
    mock.module('./tilesExecution.ts', () => ({
      ...execution,
      run: async command => {
        calls.push(command)
        if (routingFails) throw new Error('routing upload failed')
      },
    }))
    const { runTilesRefreshCommand } = await import('./tiles.ts')
    const refresh = (region, options = {}) => runTilesRefreshCommand({
      command: 'tiles:refresh', positionals: [],
      options: { region, date: '2026-10-01', ...options },
    }, () => { throw new Error('unexpected usage') })
    for (const region of ['hk', 'mo']) {
      routingFails = true
      await assert.rejects(refresh(region), /routing upload failed/)
      routingFails = false
      calls.length = 0
      await refresh(region)
      assert.deepEqual(calls, [
        'preview:' + region, 'styles:' + region,
        ['python3', 'scripts/routing/publish.py', '--region', region, '--version', '2026-10-01'],
      ])
      await assert.rejects(refresh(region, { force: true }), /basemap publication reached/)
      pending = true
      await assert.rejects(refresh(region), /basemap publication reached/)
      pending = false
      published = false
      await assert.rejects(refresh(region), /basemap publication reached/)
      published = true
      calls.length = 0
      await refresh(region, { 'dry-run': true })
      assert.equal(calls.some(Array.isArray), false)
    }
  `
  const child = Bun.spawn([process.execPath, '-e', script], {
    cwd: import.meta.dir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
    new Response(child.stdout).text(),
  ])
  expect(stderr).toBe('')
  expect(exitCode).toBe(0)
})
