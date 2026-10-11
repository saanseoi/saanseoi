import { expect, test } from 'bun:test'
import { applyEditorialOwnership } from './editorialOwnership'

test('kept deletions transfer identity and geometry to SaanSeoi once', () => {
  const divisions: any[] = [
    {
      id: 'kept',
      sources: { overture: [{ dataset: 'ds-hk-overture-division', recordId: 'old' }] },
    },
  ]
  const areas: any[] = [
    {
      id: 'area',
      divisionId: 'kept',
      sources: JSON.stringify({ overture: [{ recordId: 'old-area' }] }),
    },
  ]
  const events = [{ divisionId: 'kept', field: '$record', status: 'keep' }]
  applyEditorialOwnership(divisions, areas, events)
  expect(divisions[0].sources.overture).toBeUndefined()
  expect(areas[0].sources.overture).toBeUndefined()
  expect(areas[0].sources.saanseoi[0]).toMatchObject({
    dataset: 'ds-hk-saanseoi-division',
    recordId: 'area',
    curation: 'division-additions',
    contributions: ['geometry'],
  })
  const before = JSON.stringify([divisions, areas])
  applyEditorialOwnership(divisions, areas, events)
  expect(JSON.stringify([divisions, areas])).toBe(before)
})

test('protected names become field-specific SaanSeoi contributions', () => {
  const rows: any[] = [
    { id: 'present', sources: { overture: [{ contributions: ['identity'] }] } },
  ]
  applyEditorialOwnership(
    rows,
    [],
    [{ divisionId: 'present', field: 'names.zh-hant.name', status: 'restored' }],
  )
  expect(rows[0].sources.overture).toEqual([{ contributions: ['identity'] }])
  expect(rows[0].sources.saanseoi[0].contributions).toEqual(['names.zh-hant.name'])
})
