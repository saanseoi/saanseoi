import { expect, test } from 'bun:test'
import { recordContent } from './recordContent'
import { publisherSourceHashInput } from './sourcePayload'
import { createHash } from '../../utils'
import { hashDivisionGeometrySourceRow } from '../divisions/divisionGeometry'

const payload = {
  name: 'Original',
  version: 1,
  updatedAt: '2026-01-01',
  sources: [{ dataset: 'publisher', version: '1', updateTime: '2026-01-01' }],
}

test('record content excludes nested bookkeeping metadata and preserves semantic dates and binary geometry', () => {
  const geometry = new Uint8Array([1, 2, 3])
  const input = {
    ...payload,
    geometry,
    effectiveDate: '2026-01-01',
    deletedAt: '2026-02-01',
    year: 2026,
    versionHash: 'dependency-content',
  }
  const before = structuredClone(input)
  expect<Record<string, unknown>>(recordContent(input)).toEqual({
    name: 'Original',
    sources: [{ dataset: 'publisher' }],
    geometry,
    effectiveDate: '2026-01-01',
    deletedAt: '2026-02-01',
    year: 2026,
    versionHash: 'dependency-content',
  })
  expect(recordContent(input).geometry).toBe(geometry)
  expect(input).toEqual(before)
})

test('shared source and Division geometry hashes ignore timestamps and versions but retain content changes', async () => {
  for (const hash of [
    (properties: Record<string, unknown>) =>
      createHash(publisherSourceHashInput({ properties })),
    (properties: Record<string, unknown>) =>
      hashDivisionGeometrySourceRow({ properties }),
  ]) {
    const baseline = await hash(payload)
    expect(
      await hash({
        ...payload,
        version: 2,
        updatedAt: 'later',
        sources: [{ dataset: 'publisher', version: '2', updateTime: 'later' }],
      }),
    ).toBe(baseline)
    expect(await hash({ ...payload, name: 'Changed' })).not.toBe(baseline)
    expect(await hash({ ...payload, sources: [{ dataset: 'other' }] })).not.toBe(
      baseline,
    )
  }
})
