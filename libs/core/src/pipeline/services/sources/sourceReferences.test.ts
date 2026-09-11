import { expect, test } from 'bun:test'
import { normaliseSourceReferences } from '../addresses/sourceStage'
import { normaliseOvertureSourceReferences } from '../divisions/division'

for (const [name, normalise] of [
  ['ALS', normaliseSourceReferences],
  ['Overture divisions', normaliseOvertureSourceReferences],
] as const) {
  test(`${name} leaves absent provenance null`, () => {
    for (const value of [undefined, null, [], {}, [{ unrelated: 'value' }]]) {
      expect(normalise(value)).toBeNull()
    }
  })

  test(`${name} preserves supplied publisher evidence`, () => {
    const references = [{ dataset: 'publisher', recordId: 'upstream-42' }]
    expect(normalise(references)).toEqual(references)
  })
}

test('ALS preserves wrapped evidence and leaves empty wrappers null', () => {
  const references = [{ dataset: 'hkgov-dpo', sourceFile: 'addresses.geojson' }]
  expect(normaliseSourceReferences({ hkgovAls: references })).toEqual(references)
  expect(normaliseSourceReferences({ hkgovAls: [] })).toBeNull()
})
