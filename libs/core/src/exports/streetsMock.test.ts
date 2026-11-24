import { expect, test } from 'bun:test'
import { streetMockRows, prepareStreetMock, serveStreetMock } from './streetsMock'
import { exportFixture } from './fixtures.test-support'
import { Hono } from 'hono'
test('mock preserves 4053 canonical identities and resolves grouped publisher districts to geographic codes', async () => {
  const rows = streetMockRows()
  expect(rows).toHaveLength(4053)
  expect(new Set(rows.map(r => r.id)).size).toBe(4053)
  expect(
    rows.every(r => r.names['zh-Hans'] === null && r.divisionCodes.length > 0),
  ).toBe(true)
  expect(rows.some(r => r.divisionCodes.includes('KTS'))).toBe(true)
  const f = exportFixture()
  try {
    const manifest = await prepareStreetMock(f.bucket)
    await prepareStreetMock(f.bucket)
    expect(manifest.mock).toBe(true)
    expect(manifest.apiReleaseSetId).toBeNull()
    const app = new Hono<{ Bindings: { R2_ASSETS: R2Bucket } }>()
    app.get(
      '/:family/:version/exports/:domain/:variant/:projection/:file',
      serveStreetMock,
    )
    const r = await app.request(
      '/streets/v0.1/exports/physical/saanseoi/points/manifest.json',
      {},
      { R2_ASSETS: f.bucket },
    )
    expect(r.status).toBe(501)
  } finally {
    f.meta.close()
    f.history.close()
  }
})
