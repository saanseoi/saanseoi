import { expect, test } from 'bun:test'
import { AddressContentSchema, createAddressContent } from './src/content'

test('addresses retain names but reject entity classifications and parent pointers', () => {
  const base = createAddressContent({ en: 'Example Estate' })
  expect(
    AddressContentSchema.parse({
      ...base,
      i18n: {
        en: { formattedAddress: 'Example Estate', premisesName: 'Example Estate' },
      },
    }).i18n.en.premisesName,
  ).toBe('Example Estate')
  for (const field of ['parentAddressId', 'premisesType', 'premisesKind']) {
    expect(AddressContentSchema.safeParse({ ...base, [field]: 'estate' }).success).toBe(
      false,
    )
    expect(
      AddressContentSchema.safeParse({
        ...base,
        i18n: { en: { formattedAddress: '', [field]: 'estate' } },
      }).success,
    ).toBe(false)
  }
})
