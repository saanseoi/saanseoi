import { expect, test } from 'bun:test'
import operations from '../../../../../../fixtures/meta/fieldLineage/operations.json'
import { normaliseDivisionAreaGeometryRow } from './divisionGeometry'
import { normaliseCuratedDivision } from './curatedDivision'
import { geometryReferenceRule } from '../../../../../db/src/fieldLineageGeometryReferences'

const polygon = {
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

test('geometry type decision table agrees with the processor across flags and classes', () => {
  const rule = operations.operations['division-geometry-type']
  for (const isLand of [true, false, null])
    for (const isTerritorial of [true, false, null])
      for (const cls of ['land', 'maritime', 'invalid']) {
        const expected =
          isLand === true && isTerritorial === true
            ? rule.branches[0]!.result
            : rule.branches[1]!.when.in?.includes(cls)
              ? cls
              : null
        const run = () =>
          normaliseDivisionAreaGeometryRow({
            id: 'area',
            division_id: 'division',
            region: 'HK',
            class: cls,
            is_land: isLand,
            is_territorial: isTerritorial,
            geometry: polygon,
          })
        if (expected === null) expect(run).toThrow('unsupported class')
        else expect(run()?.canonical.type).toBe(expected)
      }
})

test('government area flags override missing publisher flags before geometry type resolution', () => {
  for (const source of operations.operations['division-geometry-type']
    .governmentAreaFlags.sources) {
    const result = normaliseDivisionAreaGeometryRow(
      {
        id: 'area',
        division_id: 'division',
        region: 'HK',
        class: 'invalid',
        geometry: polygon,
        ...(source === 'hkgov-censtatd'
          ? { source_record_id: 'CENSTATD:A', source_assertion_geometry: polygon }
          : {}),
        source_geometry: polygon,
        newtown_id: 'town',
        source_cell_ids: ['cell'],
        source_properties: { OBJECTID: 1 },
        sources: [{ sourceRecordId: 'native' }],
      },
      source,
      { datasetCode: 'ds-hk-hkgov-censtatd-division-area-district' },
    )
    expect(result?.canonical).toMatchObject({
      isLand: true,
      isTerritorial: true,
      type: 'mixed',
    })
  }
})

test('SaanSeoi name import preserves the archive value rather than reapplying an ordinary name curation', () => {
  const record = {
    id: '34eee784-7afc-41ec-aced-9f84eb92adec',
    class: 'macrohood',
    names: { en: { name: 'Name sealed in archive' } },
    hierarchies: { full: [] },
  }
  const result = normaliseCuratedDivision({
    id: record.id,
    source: 'saanseoi',
    record: JSON.stringify(record),
  })
  expect(result.i18n.find(row => row.locale === 'en')?.name).toBe(
    'Name sealed in archive',
  )
  expect(operations.operations['saanseoi-division-name'].assembly.input).toBe(
    'prepared.record',
  )
})

test('government geometry references follow native identity inputs independently of publisher sources', () => {
  const cases = [
    {
      dataset: 'ds-hk-hkgov-pland-division-new-town',
      source: 'hkgov-pland-new-town',
      row: { newtown_id: 'town' },
      inputs: ['newtown_id'],
      sources: [
        {
          publisherCode: 'hkgov-pland',
          dataset: 'ds-hk-hkgov-pland-division-new-town',
          recordId: 'town',
        },
      ],
    },
    {
      dataset: 'ds-hk-hkgov-pland-division-pu',
      source: 'hkgov-pland-pu',
      row: {
        source_cell_ids: '["cell-a","cell-b"]',
        identifiers: { 'PLAND:TPU': '123' },
      },
      inputs: ['source_cell_ids'],
      sources: ['cell-a', 'cell-b'].map(recordId => ({
        publisherCode: 'hkgov-pland',
        dataset: 'ds-hk-hkgov-pland-division-pu',
        recordId,
      })),
    },
    {
      dataset: 'ds-hk-hkgov-censtatd-division-area-district',
      source: 'hkgov-censtatd',
      row: {
        sources: [{ sourceRecordId: 'native' }, { sourceRecordId: '' }],
        district_code: 11,
        district_class: 'DC',
      },
      inputs: ['sources', 'id', 'source'],
      sources: [
        {
          publisherCode: 'hkgov-censtatd',
          dataset: 'ds-hk-hkgov-censtatd-division-area-district',
          recordId: 'native',
        },
      ],
    },
  ]
  for (const entry of cases) {
    const result = normaliseDivisionAreaGeometryRow(
      {
        id: 'area',
        division_id: 'division',
        geometry: polygon,
        ...(entry.source === 'hkgov-censtatd'
          ? { source_record_id: 'CENSTATD:A', source_assertion_geometry: polygon }
          : {}),
        source_geometry: polygon,
        source_properties: {},
        ...entry.row,
      },
      entry.source,
      { datasetCode: entry.dataset },
    )!
    expect(result.canonical.sources).toEqual(entry.sources)
    expect(result.canonical).not.toHaveProperty('identifiers')
    expect(geometryReferenceRule('sources', entry.dataset)?.inputs).toEqual(
      entry.inputs,
    )
  }
  expect(
    geometryReferenceRule('identifiers', 'ds-hk-overture-division-area'),
  ).toBeNull()
  expect(
    geometryReferenceRule('sources', 'ds-hk-overture-division-area')?.inputs,
  ).toEqual(['id', 'source', 'sources'])
})

test('HMA fixture constants match the native government geometry output, including mixed type', async () => {
  const { default: fixture } = await import(
    '../../../../../../fixtures/meta/apiFields/api-divisions-v0.1@hkgov-censtatd-hma-v1.json'
  )
  const result = normaliseDivisionAreaGeometryRow(
    {
      id: 'CENSTATD:housing-market-area:HMA001',
      division_id: 'division',
      class: 'land',
      geometry: polygon,
      source_record_id: 'CENSTATD:A',
      source_assertion_geometry: polygon,
      source_geometry: polygon,
      source_properties: { hma: 'HMA001' },
      sources: [{ sourceRecordId: 'HMA_21C:1' }],
    },
    'hkgov-censtatd',
    {
      variant: 'hkgov-censtatd-hma',
      datasetCode: 'ds-hk-hkgov-censtatd-division-area-hma',
    },
  )!
  for (const field of fixture.resources.find(r => r.resourceType === 'divisionArea')!
    .fields) {
    const constant = field.inputs.find(i => i.origin === 'constant')
    if (!constant || !('value' in constant)) continue
    const key = field.apiField.replace('attributes.', '')
    expect(result.canonical[key as keyof typeof result.canonical], field.apiField).toBe(
      constant.value,
    )
  }
  expect(result.canonical.variant).toBe('hkgov-censtatd-hma')
})
