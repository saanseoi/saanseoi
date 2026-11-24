import { expect, test } from 'bun:test'
import { GeocodingQuerySchema } from '../schema/geocoding'
import { presentGeocoding } from './geocodingPresentation'

test('every geocoding profile retains the address scope and localised display', () => {
  for (const profile of ['compact', 'default', 'map', 'full']) {
    const result = presentGeocoding(
      {
        data: [
          {
            type: 'addresses',
            id: 'premises',
            attributes: {
              scope: 'premises',
              i18n: {
                en: {
                  formattedAddress: 'Example',
                },
                'zh-hant': {
                  formattedAddress: '示例',
                },
              },
            },
          },
        ],
        meta: { release: { apiReleaseSet: 'test-release' } },
      },
      GeocodingQuerySchema.parse({ address: 'Example premises', profile }),
    )
    expect(result).toMatchObject({
      included: [
        {
          type: 'addresses',
          id: 'premises',
          attributes: {
            scope: 'premises',
            i18n: {
              en: {
                formattedAddress: 'Example',
              },
              'zh-hant': {
                formattedAddress: '示例',
              },
            },
          },
        },
      ],
    })
  }
})
