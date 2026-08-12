import { expect, test } from 'bun:test'
import { publicReleaseManifest } from './index'

test('exposes structured release provenance without the operator command line', () => {
  expect(
    publicReleaseManifest({
      schemaVersion: 1,
      createdAt: '2026-07-31T04:06:16.553Z',
      region: { code: 'hk' },
      release: { version: '2026-07-31' },
      provenance: { command: ['--area=hong-kong'] },
      command: ['tiles:backfill', '--file', '/private/archive.pmtiles'],
    }),
  ).toEqual({
    schemaVersion: 1,
    createdAt: '2026-07-31T04:06:16.553Z',
    region: { code: 'hk' },
    release: { version: '2026-07-31' },
    provenance: { command: ['--area=hong-kong'] },
  })
})
