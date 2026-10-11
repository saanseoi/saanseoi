import { expect, test } from 'bun:test'
import {
  exportReviewCuration,
  restoreEditorProject,
  editorProjectPurpose,
} from './editorCuration'
import type { SaanseoiEstimatedAreas } from './geographicReview'
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
} as const
const feature = {
  type: 'Feature',
  geometry,
  properties: {
    divisionId: 'local',
    variant: 'saanseoi',
    corePoint: [0.5, 0.25],
    geometryOriginalDrawing: geometry,
    geometryPencilLinework: [[1, 2]],
    geometryWorkingBaseline: geometry,
    name: 'Display copy',
  },
}
test('editor export retains authored drawings and excludes independent geometry decisions', () => {
  const input = {
    type: 'FeatureCollection',
    schemaVersion: 1,
    region: 'hk',
    domain: 'geographic',
    cohort: 'current',
    variant: 'saanseoi',
    features: [feature],
    withheld: [
      {
        feature: {
          ...feature,
          properties: { ...feature.properties, divisionId: 'withheld' },
        },
        reason: 'Review pending',
      },
    ],
  } as unknown as SaanseoiEstimatedAreas
  const before = structuredClone(input)
  const baseline = {
    purpose: 'Authored geometry',
    points: [{ divisionId: 'point', point: [1, 2] }],
    islandSelections: [{ divisionId: 'island', sourceRecordId: 'OSM:1' }],
  }
  const output = exportReviewCuration(input, baseline, {
    schemaVersion: 1,
    purpose: editorProjectPurpose,
    entries: [{ divisionId: 'older', geometryWorkingBaseline: geometry }],
  })
  expect(input).toEqual(before)
  expect(output.geometry.cohort).toBeUndefined()
  expect(output.geometry.points).toBeUndefined()
  expect(output.geometry.islandSelections).toBeUndefined()
  const rows = (output.geometry as any).features
  expect(rows[0].geometry).toEqual(geometry)
  expect(rows[0].properties.geometryOriginalDrawing).toBeUndefined()
  expect(rows[0].properties.name).toBeUndefined()
  expect(rows[0].properties.geometryPencilLinework).toEqual([[1, 2]])
  expect(rows[0].properties.geometryWorkingBaseline).toBeUndefined()
  expect(
    output.project.entries.find(row => row.divisionId === 'local'),
  ).not.toHaveProperty('geometryPencilLinework')
  const fresh = restoreEditorProject(output.geometry as any)
  expect(fresh.features[0].properties.geometryOriginalDrawing).toEqual(geometry)
  expect(fresh.features[0].properties.geometryPencilLinework).toEqual([[1, 2]])
  expect(output.project.entries.map(row => row.divisionId)).toEqual([
    'local',
    'older',
    'withheld',
  ])
  const restored = restoreEditorProject(output.geometry as any, output.project)
  expect(restored.features[0].properties.geometryOriginalDrawing).toEqual(geometry)
  expect(restored.withheld[0].feature.properties.geometryPencilLinework).toEqual([
    [1, 2],
  ])
})

test('distinct original drawings survive export without any local recovery cache', () => {
  const original = {
    ...geometry,
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [0, 2],
        [0, 0],
      ],
    ],
  }
  const current = {
    features: [
      {
        ...feature,
        properties: { ...feature.properties, geometryOriginalDrawing: original },
      },
    ],
  } as unknown as SaanseoiEstimatedAreas
  const output = exportReviewCuration(
    current,
    { purpose: 'Authored geometry' },
    { schemaVersion: 1, purpose: editorProjectPurpose, entries: [] },
  )
  const fresh = restoreEditorProject(output.geometry as any)
  expect(fresh.features[0].properties.geometryOriginalDrawing).toEqual(original)
  expect(output.project.entries[0]).not.toHaveProperty('geometryOriginalDrawing')
})
