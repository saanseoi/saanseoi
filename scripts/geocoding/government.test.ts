import { expect, test } from 'bun:test'
import { alsUrl, requestGovernment, reverseUrl } from './government'

test('ALS preserves complete address and baseline parameters', () => {
  const address = "Room 1104, 11/F, 70 Queen's Road Central"
  const url = alsUrl(address)
  expect(url.searchParams.get('q')).toBe(address)
  expect(url.searchParams.get('n')).toBe('1')
  expect(url.searchParams.get('3d')).toBe('0')
})

test('reverse uses Web Mercator and 500 metre radius', () => {
  const url = reverseUrl(114.1555936, 22.2826315, 'test-key')
  const point = JSON.parse(url.searchParams.get('location')!)
  expect(point.x).toBeCloseTo(12707742.548986945, 1)
  expect(point.y).toBeCloseTo(2545492.517712747, 1)
  expect(url.searchParams.get('distance')).toBe('500')
  expect(() => reverseUrl(114, 90, 'key')).toThrow()
})

function mock(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), { status })
}

test('records direct reverse result without enrichment and redacts credentials', async () => {
  const result = await requestGovernment(
    reverseUrl(114, 22, 'secret-key'),
    'hk-map-service',
    mock({ address: { Street: '70 QUEENS ROAD CENTRAL' }, echoed: 'secret-key' }),
  )
  expect(result.outcome).toBe('results')
  expect(JSON.stringify(result)).not.toContain('secret-key')
  expect(result.body?.address).toEqual({ Street: '70 QUEENS ROAD CENTRAL' })
})

test('separates empty matches, HTTP failures and provider errors', async () => {
  const url = alsUrl('test')
  expect(
    (await requestGovernment(url, 'als', mock({ SuggestedAddress: [] }))).outcome,
  ).toBe('no_match')
  expect(
    (await requestGovernment(url, 'als', mock({ error: { code: 403 } }))).outcome,
  ).toBe('error')
  expect((await requestGovernment(url, 'als', mock({}, 503))).outcome).toBe('error')
  expect((await requestGovernment(url, 'als', mock(null))).outcome).toBe('error')
})
