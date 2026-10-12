import { expect, test } from 'bun:test'
import { normaliseCuratedDivision } from './curatedDivision'
import { buildDivisionBaseHashInput } from './division'
import { divisionSourceResolutions } from './divisionContainmentEvidence'
import {
  nativeSourcePayloadHashInput,
  saanseoiSourcePayload,
} from '../sources/sourcePayload'
import { createHash } from '../../utils'

const row = (ancestor: string, fullContainment = true, parentId = 'parent') => ({
  id: 'child',
  record: {
    id: 'child',
    class: 'village',
    names: { en: { name: 'Child' } },
    hierarchies: {
      full: [
        [
          {
            id: parentId,
            class: 'district',
            name: 'Parent',
            fullContainment,
            containmentGeometry: { division: 'sha256:child', ancestor },
          },
        ],
      ],
    },
  },
})

test('evidence-only updates change snapshot interpretation, not stored content or version hashes', async () => {
  const before = row('sha256:old'),
    after = row('sha256:new')
  const canonical = (raw: ReturnType<typeof row>) => normaliseCuratedDivision(raw).base
  const sourceHash = (raw: ReturnType<typeof row>) =>
    createHash(nativeSourcePayloadHashInput(saanseoiSourcePayload(raw)))
  const canonicalHash = (raw: ReturnType<typeof row>) =>
    createHash(buildDivisionBaseHashInput(canonical(raw)))
  expect(await sourceHash(before)).toBe(await sourceHash(after))
  expect(await canonicalHash(before)).toBe(await canonicalHash(after))
  expect(JSON.stringify(canonical(after).hierarchies)).not.toContain(
    'containmentGeometry',
  )
  expect(JSON.stringify(canonical(after).hierarchies)).not.toContain(
    'containment_geometry',
  )
  expect(saanseoiSourcePayload(before)).toEqual(saanseoiSourcePayload(after))
  expect(divisionSourceResolutions('child', before)).not.toEqual(
    divisionSourceResolutions('child', after),
  )
  expect(before.record.hierarchies.full[0]![0]!.containmentGeometry.ancestor).toBe(
    'sha256:old',
  )
  for (const changed of [row('sha256:new', false), row('sha256:new', true, 'other')]) {
    expect(await canonicalHash(changed)).not.toBe(await canonicalHash(after))
    expect(await sourceHash(changed)).not.toBe(await sourceHash(after))
  }
})

test('conflicting proofs across hierarchy paths block evidence publication', () => {
  const raw = row('sha256:old')
  raw.record.hierarchies.full.push(row('sha256:new').record.hierarchies.full[0]!)
  expect(() => divisionSourceResolutions('child', raw)).toThrow(
    'Conflicting containment evidence',
  )
})
