import { expect, test } from 'bun:test'
import { finalisePublishedSearch } from './finalise'

test('deferred publication, pending sequence and unrelated families perform no index work', async () => {
  const forbidden = new Proxy(
    {},
    {
      get() {
        throw new Error('unexpected database access')
      },
    },
  )
  for (const options of [
    { deferred: true, publishedFamilies: ['places'] },
    { pendingReleaseSetCodes: ['pending'], publishedFamilies: ['places'] },
    { publishedFamilies: ['divisions'] },
  ]) {
    await expect(
      finalisePublishedSearch(forbidden as never, forbidden as never, options),
    ).resolves.toBeUndefined()
  }
})
