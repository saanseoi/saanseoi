import { expect, test } from 'bun:test'
import { boundaryPatchEvidence } from './boundaryPatchEvidence'
const geometry = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
}
const definitions = {
  exclusions: { islandDecisions: [{ id: 'island', decision: 'rejected' }] },
  geometry: { features: [{ properties: { divisionId: 'island' } }] },
  selections: {
    corrections: [
      {
        id: 'island',
        action: 'geometry-correction',
        operation: 'use-named-basemap-geometry',
      },
    ],
  },
}
test('resolves emitted drawing and source patches across source and division IDs', () => {
  for (const [curation, kind] of [
    ['division-geometry', 'drawing'],
    ['island-areas', 'source'],
  ] as const) {
    const areas = [
      {
        divisionId: 'output',
        geometry,
        sources: {
          saanseoi: [{ recordId: 'island', curation }],
          protomaps: [{ record_id: 'OSM:123' }],
        },
      },
    ]
    expect(boundaryPatchEvidence(definitions, areas)).toEqual([
      {
        id: 'island',
        divisionId: 'output',
        geometry,
        kind,
        sourceRecordIds: ['OSM:123'],
      },
    ])
    expect(
      boundaryPatchEvidence(
        definitions,
        areas.map(row => ({
          ...row,
          geometry: JSON.stringify(geometry),
          sources: JSON.stringify({
            saanseoi: [{ recordId: 'island', dataset: curation }],
            protomaps: [{ recordId: 'OSM:123' }],
          }),
        })),
      ),
    ).toEqual(boundaryPatchEvidence(definitions, areas))
  }
})
test('does not count an unpatched source, a pending correction or a missing output', () => {
  const areas = [
    {
      divisionId: 'output',
      geometry,
      sources: { saanseoi: [{ recordId: 'island', curation: 'island-areas' }] },
    },
  ]
  expect(
    boundaryPatchEvidence(
      { ...definitions, selections: { entries: [{ divisionId: 'island' }] } },
      areas,
    ),
  ).toEqual([])
  expect(
    boundaryPatchEvidence(
      {
        ...definitions,
        selections: {
          corrections: [
            { ...definitions.selections.corrections[0], reviewRequired: true },
          ],
        },
      },
      areas,
    ),
  ).toEqual([])
  expect(boundaryPatchEvidence(definitions, [])).toEqual([])
})

test('a canonical division drawing can replace a rejected source island geometry', () => {
  const result = boundaryPatchEvidence(
    {
      ...definitions,
      geometry: { features: [{ properties: { divisionId: 'canonical' } }] },
    },
    [
      {
        divisionId: 'canonical',
        geometry,
        sources: {
          saanseoi: [{ recordId: 'canonical', curation: 'division-geometry' }],
        },
      },
    ],
    { island: 'canonical' },
  )
  expect(result).toMatchObject([
    { id: 'island', divisionId: 'canonical', kind: 'drawing' },
  ])
})
