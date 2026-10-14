import { expect, test } from 'bun:test'
import {
  createNativeAdministrativeHierarchy,
  type AdministrativeReference,
} from './nativeAdministrativeHierarchy'
import { validatePreparedDivisions } from './processLocalHkgovPlandDivisionSqlUploadPreparation'
import {
  nativeAdministrativeHierarchyFieldRule,
  inferredAdministrativeDatasets,
} from '../../../../../../libs/db/src/fieldLineageNativeAdministrativeHierarchy'
import { humanDivisionField } from '../../../../../../libs/db/src/fieldLineageHuman'
import { retainDivisionProvenance } from './divisionProvenance'
import { readAuditPage, type ProvenanceStore } from '@repo/core/provenance'

const square = (left: number, right: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [left, 22],
      [right, 22],
      [right, 22.01],
      [left, 22.01],
      [left, 22],
    ],
  ],
})
const entry = (id: string, klass: string) => ({ id, class: klass, name: id })
const rootPath = [entry('hk', 'sar'), entry('area', 'area')]
const references = (): AdministrativeReference[] => [
  { ...entry('hk', 'sar'), hierarchies: { full: [] }, areas: [square(114, 114.1)] },
  {
    ...entry('area', 'area'),
    hierarchies: { full: [[entry('hk', 'sar')]] },
    areas: [square(114, 114.1)],
  },
  ...[
    ['tiny', 114, 114.004],
    ['small', 114.004, 114.01],
    ['large', 114.01, 114.1],
  ].map(([id, left, right]) => ({
    ...entry(String(id), 'district'),
    hierarchies: { full: [rootPath] },
    areas: [square(Number(left), Number(right))],
  })),
]

test('covered-area selection preserves multiple paths, rejects small overlaps and records uncovered territory', () => {
  const input = references()
  const before = JSON.stringify(input)
  const result = createNativeAdministrativeHierarchy(input)('hma', square(114, 114.2))
  expect(result.hierarchies.full.map(path => path.at(-1)!.id)).toEqual([
    'large',
    'small',
  ])
  expect(
    result.hierarchies.full.every(
      path => path.map(row => row.class).join(',') === 'sar,area,district',
    ),
  ).toBe(true)
  expect(
    result.hierarchies.full.flat().every(row => row.full_containment === false),
  ).toBe(true)
  const evidence = result.action.evidence
  expect(evidence.decisions).toHaveLength(3)
  expect(
    evidence.decisions.find(row => row.districtId === 'small')!.sourceFraction!,
  ).toBeLessThan(0.05)
  expect(
    evidence.decisions.find(row => row.districtId === 'small')!.coveredFraction!,
  ).toBeGreaterThan(0.05)
  expect(evidence.decisions.find(row => row.districtId === 'tiny')!.selected).toBe(
    false,
  )
  expect(evidence.uncoveredSquareMetres!).toBeGreaterThan(0)
  expect(evidence.sourceGeometryHash).toStartWith('sha256:')
  expect(JSON.stringify(input)).toBe(before)
})

test('points select covering districts, including both sides of a shared boundary, without polygon containment', () => {
  const infer = createNativeAdministrativeHierarchy(references())
  const result = infer('settlement', { type: 'Point', coordinates: [114.01, 22] })
  expect(result.hierarchies.full.map(path => path.at(-1)!.id)).toEqual([
    'large',
    'small',
  ])
  expect(
    result.hierarchies.full.flat().every(row => row.full_containment === null),
  ).toBe(true)
  const outside = infer('outside', { type: 'Point', coordinates: [115, 22] })
  expect(outside.hierarchies.full).toEqual([])
  expect(outside.action.evidence.outcome).toBe('unmatched')
})

test('complete polygon containment is measured separately for each ancestor', () => {
  const result = createNativeAdministrativeHierarchy(references())(
    'newtown',
    square(114.02, 114.03),
  )
  expect(result.hierarchies.full).toHaveLength(1)
  expect(result.hierarchies.full[0]!.every(row => row.full_containment === true)).toBe(
    true,
  )
})

test('invalid geometry and incomplete canonical paths block inference', () => {
  const invalid = references()
  invalid.at(-1)!.hierarchies.full = [[entry('area', 'area')]]
  expect(() => createNativeAdministrativeHierarchy(invalid)).toThrow(
    'Incomplete administrative reference',
  )
  const infer = createNativeAdministrativeHierarchy(references())
  expect(() => infer('bad', { type: 'LineString', coordinates: [] })).toThrow(
    'No usable source geometry',
  )
})

test('New Town validation accepts only administrative external paths and Planning Units still require local parents', () => {
  const base = {
    id: 'newtown',
    class: 'planning-newtown',
    hierarchies: { full: [[...rootPath, entry('district', 'district')]] },
  }
  expect(() => validatePreparedDivisions([{ base }] as never, 1)).not.toThrow()
  expect(() =>
    validatePreparedDivisions(
      [{ base: { ...base, class: 'planning-tpu' } }] as never,
      1,
    ),
  ).toThrow('unavailable parent')
  expect(() =>
    validatePreparedDivisions(
      [
        {
          base: { ...base, hierarchies: { full: [[entry('hood', 'neighbourhood')]] } },
        },
      ] as never,
      1,
    ),
  ).toThrow('Invalid inferred New Town')
})

test('all three apiField provenance explanations describe their actual spatial fill', () => {
  for (const dataset of inferredAdministrativeDatasets) {
    const field = nativeAdministrativeHierarchyFieldRule(dataset)
    const human = humanDivisionField('division', 'attributes.hierarchies', dataset)!
    expect(human.kind).toBe('calculate')
    expect(human.description).toContain('publisher')
    expect(field.implementation.symbol).toBe('createNativeAdministrativeHierarchy')
    expect(field.steps!.join(' ')).toContain('SHA-256')
    expect(field.steps!.join(' ')).toContain('unmatched')
    expect(field.expression).toContain(dataset.includes('landsd') ? 'Point' : '>= 0.05')
  }
})

test('assembly retains the exact reference policy and per-record inference decisions', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const result = createNativeAdministrativeHierarchy(references())(
    'hma',
    square(114, 114.2),
  )
  const audit = await retainDivisionProvenance(store, {
    scope: { stage: 'assembly', ownerId: 'snapshot' },
    resourceReleaseId: 'release',
    datasetCode:
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
    inputCount: 1,
    outputCount: 1,
    actions: [result.action],
  })
  const page = await readAuditPage(store, audit.manifest, '', 0, 10, {
    category: 'patches',
  })
  expect(page.rows).toHaveLength(1)
  expect(page.rows[0]).toMatchObject({
    operation: result.action.action,
    record: { id: 'hma' },
    context: {
      decisions: result.action.evidence.decisions,
      paths: result.hierarchies.full,
    },
  })
  expect(page.rows[0]!.fixture).toBeDefined()
})
