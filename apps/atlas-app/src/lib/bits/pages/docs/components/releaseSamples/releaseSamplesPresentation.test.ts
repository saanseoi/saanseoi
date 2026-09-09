import { describe, expect, test } from 'bun:test'

import {
  getUniqueAddressSamples,
  getSampleApiPath,
  getSamplePageOffsets,
  groupAddressSamples,
  sampleValueTones,
  supportsReleaseSamples,
  toCompleteAddressSample,
} from './releaseSamplesPresentation'

const address = (id: string, english = '1 Example Road') => ({
  type: 'addresses',
  id,
  attributes: {
    i18n: {
      en: { formattedAddress: english, buildingName: null },
      'zh-hant': { formattedAddress: '示例道1號' },
    },
  },
  relationships: {
    district: { data: { type: 'divisions', id: 'district-example' } },
    town: { data: null },
  },
  links: { self: `https://api.example.test/addresses/${id}` },
})

function completeAddressSample(id: string) {
  const sample = toCompleteAddressSample(address(id))
  if (!sample) throw new Error(`Expected ${id} to produce a complete address sample.`)
  return sample
}

describe('address release samples', () => {
  test('caps random pages at the available offsets for small releases', () => {
    for (const maximumOffset of [0, 1, 2, 3]) {
      expect(getSamplePageOffsets(maximumOffset, 4).sort((a, b) => a - b)).toEqual(
        Array.from({ length: maximumOffset + 1 }, (_, index) => index),
      )
    }
  })

  test('returns unique in-range pages for large releases', () => {
    const offsets = getSamplePageOffsets(100_000, 4)
    expect(new Set(offsets).size).toBe(4)
    expect(
      offsets.every(
        offset => Number.isInteger(offset) && offset >= 0 && offset <= 100_000,
      ),
    ).toBe(true)
    expect(getSamplePageOffsets(10, 0)).toEqual([])
  })

  test('presents every populated branch of a full record below its single id', () => {
    expect(toCompleteAddressSample(address('address-1'))).toEqual({
      id: 'address-1',
      fields: [
        { key: 'type', value: 'addresses' },
        {
          key: 'attributes',
          children: [
            {
              key: 'i18n',
              children: [
                {
                  key: 'en',
                  children: [{ key: 'formattedAddress', value: '1 Example Road' }],
                },
                {
                  key: 'zh-hant',
                  children: [{ key: 'formattedAddress', value: '示例道1號' }],
                },
              ],
            },
          ],
        },
        {
          key: 'relationships',
          children: [
            {
              key: 'district',
              children: [
                {
                  key: 'data',
                  children: [
                    { key: 'type', value: 'divisions' },
                    { key: 'id', value: 'district-example' },
                  ],
                },
              ],
            },
          ],
        },
        {
          key: 'links',
          children: [
            { key: 'self', value: 'https://api.example.test/addresses/address-1' },
          ],
        },
      ],
    })
  })

  test('removes matching records and recognises only the implemented API version', () => {
    const first = completeAddressSample('address-1')
    expect(
      getUniqueAddressSamples(
        [address('address-2'), address('address-3', '3 Example Road')],
        [first],
      ),
    ).toHaveLength(1)
    expect(supportsReleaseSamples('api-addresses-v0.1')).toBe(true)
    expect(supportsReleaseSamples('api-divisions-v0.1')).toBe(true)
    expect(getSampleApiPath('api-divisions-v0.1')).toBe('/divisions/v0')
    expect(getSampleApiPath('api-stats-v0.1')).toBeNull()
  })

  test('puts compactable sample ids first and collapses matching values', () => {
    const first = completeAddressSample('address-1')
    const second = completeAddressSample('address-2')
    const grouped = groupAddressSamples([first, second])

    expect(grouped[0]).toEqual({
      key: 'id',
      values: [
        { value: 'address-1', sampleIds: ['address-1'] },
        { value: 'address-2', sampleIds: ['address-2'] },
      ],
      children: [],
    })
    expect(grouped[1]).toEqual({
      key: 'type',
      values: [{ value: 'addresses', sampleIds: ['address-1', 'address-2'] }],
      children: [],
    })
  })

  test('provides ten distinct sample accents before repeating', () => {
    expect(sampleValueTones).toHaveLength(10)
    expect(new Set(sampleValueTones.map(tone => tone.marker)).size).toBe(10)
  })
})
