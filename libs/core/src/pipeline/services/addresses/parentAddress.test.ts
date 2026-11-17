import { expect, test } from 'bun:test'
import {
  normaliseAddressRowForPipeline,
  buildAddressBaseHashInput,
} from './normalisation'
import { createHash } from '../../utils'

test('curated parentage remains source evidence without entering address content or hashes', async () => {
  const input = {
    id: 'source',
    canonicalId: 'child',
    divisionSnapshotId: 'division',
    enFormattedAddress: 'Block A, Example Estate',
    parentAddressId: 'estate',
    curatedPremisesType: 'complex',
  }
  const row = normaliseAddressRowForPipeline(input)
  for (const field of ['parentAddressId', 'premisesType', 'premisesKind'])
    expect(row.base).not.toHaveProperty(field)
  const base = { ...row.base, id: 'child' }
  expect(await createHash(buildAddressBaseHashInput(base))).toBe(
    await createHash(
      buildAddressBaseHashInput(
        Object.assign({}, base, {
          parentAddressId: 'other',
          premisesType: 'site',
          premisesKind: 'estate',
        }),
      ),
    ),
  )
  expect(input.parentAddressId).toBe('estate')
})
