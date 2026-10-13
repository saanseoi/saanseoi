import { expect, test } from 'bun:test'
import { geometryHumanField, geometryHumanProducer } from './fieldLineageGeometryHuman'
import { validateHumanOperation } from './fieldLineageHuman'
import {
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
} from '../../core/src/pipeline/services/divisions/divisionGeometry'

test('every area and boundary field has a schematic contract', () => {
  for (const dataset of [
    'ds-hk-saanseoi-division',
    'ds-hk-overture-division',
    'ds-hk-hkgov-had-division-area-district',
    'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
  ])
    for (const resource of ['divisionArea', 'divisionBoundary'])
      for (const field of [
        'bbox',
        'geometry',
        'type',
        'isLand',
        'isTerritorial',
        'id',
        'sources',
        ...(resource === 'divisionArea'
          ? ['divisionId', 'variant']
          : ['leftDivisionId', 'rightDivisionId']),
      ]) {
        const human = geometryHumanField(resource, field, dataset)!
        validateHumanOperation(human)
        expect(human.rule).toBeDefined()
      }
})
test('geometry explanations correspond to normaliser outputs', () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [115, 22],
        [115, 23],
        [114, 22],
      ],
    ],
  }
  for (const [is_land, is_territorial, klass, type] of [
    [true, true, 'land', 'mixed'],
    [true, false, 'land', 'land'],
    [false, true, 'maritime', 'maritime'],
  ] as const) {
    const result = normaliseDivisionAreaGeometryRow(
      {
        id: 'area',
        division_id: 'owner',
        geometry,
        is_land,
        is_territorial,
        class: klass,
      },
      'saanseoi',
    )!
    expect(result.canonical.type).toBe(type)
    expect(result.canonical.bbox).toEqual([114, 22, 115, 23])
    expect(result.canonical.id).toBe('area')
  }
  const boundary = normaliseDivisionBoundaryGeometryRow({
    id: 'boundary',
    division_ids: ['first', 'second'],
    geometry: {
      type: 'LineString',
      coordinates: [
        [115, 23],
        [114, 22],
      ],
    },
    class: 'land',
  })!
  expect(boundary.canonical.leftDivisionId).toBe('first')
  expect(boundary.canonical.rightDivisionId).toBe('second')
})
test('preprocessing explains geometry choices and exact contributing resources', () => {
  for (const outputPath of [
    'geometry',
    'bbox',
    'class',
    'is_land',
    'is_territorial',
    'division_id',
    'id',
    'sources',
    'identifiers',
  ])
    validateHumanOperation(
      geometryHumanProducer('curated-area-prepared-field', { outputPath }),
    )
  const prepared = geometryHumanProducer('curated-area-prepared-field', {
    outputPath: 'geometry',
  })!
  expect(prepared.sources?.map(s => s.resourceType)).toEqual([
    'divisionArea',
    'divisionArea',
  ])
  expect(JSON.stringify(prepared)).not.toMatch(/names|selectedSource|input0/)
  expect(
    JSON.stringify(
      geometryHumanProducer('simplified-area-display', { toleranceMetres: 10 }),
    ),
  ).toContain('10 m')
})
