import { expect, test } from 'bun:test'
import { finalisePublishedSearch } from './finalise'

test('a pending historical draft does not suppress published Division inventory indexes', async () => {
  const families: string[] = []
  await finalisePublishedSearch(
    {} as never,
    {} as never,
    {
      pendingReleaseSetCodes: ['data-hk-divisions-2022'],
      publishedFamilies: ['divisions'],
    },
    {
      async synchroniseSearchIndexes(_meta, _current, definitions) {
        families.push(...definitions.map(definition => definition.resourceType))
      },
    },
  )
  expect(families).toEqual(['division'])
})

test('deferred publication and unrelated families perform no index work', async () => {
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
    { publishedFamilies: ['streets'] },
  ]) {
    await expect(
      finalisePublishedSearch(forbidden as never, forbidden as never, options),
    ).resolves.toBeUndefined()
  }
})

test('Address and Places finalisation prepare substring postings after the shared indexes', async () => {
  for (const family of ['addresses', 'places']) {
    const events: string[] = []
    await finalisePublishedSearch(
      {} as never,
      {} as never,
      { publishedFamilies: [family] },
      {
        synchroniseSearchIndexes: async () => {
          events.push('shared')
        },
        synchroniseAddressSubstringSearch: async () => {
          events.push('substring')
          return 0
        },
      },
    )
    expect(events).toEqual(['shared', 'substring'])
  }
})
