import { afterAll, expect, mock, test } from 'bun:test'

const entries = new Map<string, Response>()
const writes: Promise<unknown>[] = []
mock.module('$app/server', () => ({
  getRequestEvent: () => ({
    get url(): never {
      throw new Error('Cannot access event.url in a query')
    },
  }),
}))
mock.module('cloudflare:workers', () => ({
  env: {},
  waitUntil: (write: Promise<unknown>) => writes.push(write),
}))
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches')
Object.defineProperty(globalThis, 'caches', {
  configurable: true,
  value: {
    async open() {
      return {
        async match(request: Request) {
          return entries.get(request.url)?.clone()
        },
        async put(request: Request, response: Response) {
          entries.set(request.url, response)
        },
      }
    },
  },
})
afterAll(() => {
  if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches)
  else Reflect.deleteProperty(globalThis, 'caches')
  mock.restore()
})
const { cachedAuditData } = await import('./auditCache.server')

test('remote queries populate and reuse the cache without accessing event.url', async () => {
  let builds = 0
  const build = async () => {
    builds++
    return { rows: ['retained evidence'] }
  }
  expect(await cachedAuditData('actions/hash-a', build)).toEqual({
    rows: ['retained evidence'],
  })
  await Promise.all(writes)
  expect(await cachedAuditData('actions/hash-a', build)).toEqual({
    rows: ['retained evidence'],
  })
  expect(builds).toBe(1)
  await cachedAuditData('actions/hash-b', build)
  expect(builds).toBe(2)
})
