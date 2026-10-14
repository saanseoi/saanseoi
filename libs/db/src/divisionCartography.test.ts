import { expect, test } from 'bun:test'
import { divisionCartography } from './divisionTaxonomy'
import { materialiseDivisionCartography } from './divisionCartography'
import { currentFieldRule } from './fieldLineageCurrentRules'
import { humanDivisionField } from './fieldLineageHuman'
import { compileFieldLineage } from './fieldLineageCompiler'
import { computeVersionHash } from './versioning'
import { normaliseDivisionRow } from '../../core/src/pipeline/services/divisions/division'
import { normalisePreparedDivision } from '../../../apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation'

const landsd = 'ds-hk-hkgov-landsd-division'
const hma =
  'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
const point = { type: 'Point', coordinates: [114.1, 22.3] }
const nativeCases = [
  ['planning-newtown', 10, 15, 80],
  ['planning-ppu', 10, 15, 75],
  ['planning-spu', 12, 16, 65],
  ['planning-tpu', 14, 18, 55],
  ['planning-subunit', 16, 19, 40],
  ['housing-market-area', 13, 18, 60],
] as const

test('native policies give broader units earlier display and all policies have bounded zooms', () => {
  for (const [klass, minZoom, maxZoom, prominence] of nativeCases) {
    expect(materialiseDivisionCartography(klass)).toEqual({
      minZoom,
      maxZoom,
      prominence,
    })
    expect(maxZoom).toBeGreaterThan(minZoom)
  }
  expect(() => materialiseDivisionCartography('unknown')).toThrow(
    'Missing cartography policy',
  )
  expect(() => materialiseDivisionCartography('Hill', 'hkgov-landsd')).toThrow(
    'Missing cartography policy',
  )
})

test('Overture materialises geographic class policies independently of optional publisher cartography', () => {
  for (const [klass, [minZoom, prominence, maxZoom]] of Object.entries(
    divisionCartography,
  )) {
    if (
      [
        'area',
        'rural_area',
        'major_island',
        'minor_island',
        'islet',
        'island_group',
      ].includes(klass)
    )
      continue
    for (const cartography of [null, { prominence: 9, min_zoom: null, max_zoom: 24 }]) {
      const input = {
        id: 'example',
        class: klass,
        subtype:
          klass === 'sar' ? 'dependency' : klass === 'district' ? 'region' : klass,
        names: {},
        geometry: point,
        cartography,
      }
      const original = structuredClone(input)
      const { base } = normaliseDivisionRow(input)
      expect(base.cartography).toEqual({ minZoom, maxZoom, prominence })
      expect(input).toEqual(original)
    }
  }
})

test('LandsD cartography uses native PLACE_TYPE while preserving the settlement output class and level', () => {
  for (const [nativeType, minZoom, maxZoom, prominence] of [
    ['Town', 10, 15, 80],
    ['Area', 12, 16, 70],
    ['Village', 13, 18, 55],
  ] as const) {
    const { base } = normaliseDivisionRow({
      id: 'landsd-example',
      source: 'hkgov-landsd',
      class: nativeType,
      geo_name_id: '101',
      names: {},
      geometry: point,
    })
    expect(base).toMatchObject({
      class: 'settlement',
      level: 5,
      cartography: { minZoom, maxZoom, prominence },
    })
  }
})

test('C&SD HMA materialisation supplies display policy without assigning a hierarchy level', () => {
  const { base } = normaliseDivisionRow(
    {
      id: 'hma-example',
      source: 'hkgov-censtatd',
      canonical_type: 'housing-market-area',
      geometry: point,
      names: {},
      sources: [],
    },
    { source: { source: 'hkgov-censtatd', datasetCode: hma, sourceVersion: '2021' } },
  )
  expect(base).toMatchObject({
    class: 'housing-market-area',
    level: null,
    cartography: { minZoom: 13, maxZoom: 18, prominence: 60 },
  })
})

test('Planning materialises cartography for every native level before computing its version hash', async () => {
  for (const [klass, minZoom, maxZoom, prominence] of nativeCases.filter(row =>
    row[0].startsWith('planning-'),
  )) {
    const level = klass.replace('planning-', '')
    const record = await normalisePreparedDivision(
      {
        id: `example-${level}`,
        planning_level: level,
        geometry: point,
        source_cell_ids: ['cell'],
        identifiers: {},
        i18n: [
          { locale: 'en', name: 'Example' },
          { locale: 'zh-hant', name: '示例' },
        ],
        source_properties: {
          sourceFeatures: [],
          source_geometry: point,
          sourceFeature: { properties: { NewTown_en: 'Example' } },
        },
      },
      new Map(),
    )
    expect(record.base.cartography).toEqual({ minZoom, maxZoom, prominence })
    expect(record.versionHash).toBe(
      computeVersionHash(record.base).replace(/^sha256:/, ''),
    )
  }
})

test('each source audit exposes its exact native policy and compiles a complete cartography derivation', () => {
  for (const dataset of [
    'ds-hk-overture-division',
    landsd,
    hma,
    'ds-hk-hkgov-pland-division-pu',
    'ds-hk-hkgov-pland-division-new-town',
  ]) {
    const rule = currentFieldRule('division', 'attributes.cartography', dataset)!
    expect(rule.expression).toContain('materialiseDivisionCartography')
    expect(rule.expression).not.toBe('null')
    const human = humanDivisionField('division', 'attributes.cartography', dataset)!
    expect(human.rule?.kind).toBe('mapping')
    if (human.rule?.kind !== 'mapping') throw new Error('Missing audit table')
    for (const [klass, minZoom, prominence, maxZoom] of human.rule.rows) {
      expect(
        materialiseDivisionCartography(
          klass!,
          dataset === landsd ? 'hkgov-landsd' : undefined,
        ),
      ).toEqual({
        minZoom: Number(minZoom),
        maxZoom: Number(maxZoom),
        prominence: Number(prominence),
      })
    }
    const response = {}
    const { definition } = compileFieldLineage(
      [
        {
          resourceType: 'division',
          apiField: 'attributes.cartography',
          variant: null,
          sourceDatasetId: 'dataset',
          inputs: [],
          canonicalInputs: ['division.cartography'],
          resolverCode: 'normalise',
          contributionType: 'primary',
          priority: 0,
          confidence: 1,
          resolverRules: [],
        },
      ],
      new Map(),
      {
        api: {
          version: 'api-divisions-v0.1',
          responseSchemaVersion: 'test',
          responseSchemaHash: computeVersionHash(response),
        },
        apiReleaseSetId: 'release',
        apiVersionReleaseSetId: 'version-release',
        responseDefinition: response,
        sources: [
          {
            sourceDatasetId: 'dataset',
            datasetCode: dataset,
            sourceSchemaVersion: '2026-09-23.0',
            resourceReleaseId: 'source-release',
            processingRules: null,
          },
        ],
        snapshots: [{ resourceType: 'division', snapshotId: 'snapshot' }],
      },
    )
    expect(definition.fields[0]?.completeness).toBe('complete')
    const captured = Object.values(definition.definitions) as Array<{ human?: unknown }>
    expect(
      captured.some(value => JSON.stringify(value.human) === JSON.stringify(human)),
    ).toBe(true)
  }
})

test('bulk normalisation retains cartography choices and executed counts for the release audit', async () => {
  const { divisionNormalisationRule, createDivisionBranchCounts } = await import(
    '../../core/src/pipeline/services/divisions/division'
  )
  const { planningDivisionRule } = await import(
    '../../../apps/harbour-cli/src/lib/pipeline/divisions/processLocalHkgovPlandDivisionSqlUploadPreparation'
  )
  const counts = createDivisionBranchCounts()
  normaliseDivisionRow(
    {
      id: 'landsd-example',
      source: 'hkgov-landsd',
      class: 'Area',
      geo_name_id: '101',
      names: {},
      geometry: point,
    },
    { branchCounts: counts },
  )
  expect(counts['cartography.landsd.Area']).toEqual({ matched: 1, changed: 1 })
  expect(divisionNormalisationRule.declaration.branches).toContainEqual({
    id: 'cartography.landsd.Area',
    group: 'Cartography: LandsD PLACE_TYPE',
    precedence: 2,
    condition: { field: 'PLACE_TYPE', equals: 'Area' },
    result: 'minZoom: 12, maxZoom: 16, prominence: 70',
  })
  expect(planningDivisionRule.declaration.branches).toHaveLength(5)
  const { createBranchCounts } = await import('../../core/src/provenance')
  const planningCounts = createBranchCounts(planningDivisionRule.declaration.branches!)
  await normalisePreparedDivision(
    {
      id: 'ppu',
      planning_level: 'ppu',
      geometry: point,
      source_cell_ids: ['cell'],
      source_properties: {},
      i18n: [],
    },
    new Map(),
    undefined,
    planningCounts,
  )
  expect(planningCounts['cartography.class.planning-ppu']).toEqual({
    matched: 1,
    changed: 1,
  })
})
