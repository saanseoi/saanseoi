import { expect, test } from 'bun:test'
import program from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-review-program.json'
import october from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json'
import { alsAuditFixtures } from './hkgovAlsAuditFixtures'
import {
  parseAlsReviewProgram,
  applyReviewedAlsParents,
  validateReviewedAlsSources,
} from './hkgovAlsReviewProgram'
import type { PreparedHkgovAlsRow, HkgovAlsSourceFeature } from './hkgovAlsTypes'

const fixture = 'hkgov-dpo-address-october-deletion-retentions'

test('all registered editor operations are validated and retained in audit evidence', () => {
  const operations = parseAlsReviewProgram(program, alsAuditFixtures)
  expect(operations.filter(o => o.code === 'guard-source-group')).toHaveLength(8)
  expect(operations.filter(o => o.code === 'reconcile-identity')).toHaveLength(5)
  expect(operations.filter(o => o.code === 'assign-parent')).toHaveLength(7)
  expect(
    alsAuditFixtures.find(f => f.type === 'hkgov-dpo-address-review-program')?.document,
  ).toBe(program)
})

test('unsupported codes, versions, duplicate operations and missing evidence collections fail closed', () => {
  for (const change of [
    (p: any) => {
      p.schemaVersion = 2
    },
    (p: any) => {
      p.operations[0].code = 'approve-everything'
    },
    (p: any) => {
      p.operations.push(p.operations[0])
    },
    (p: any) => {
      p.operations[0].fixture = 'missing'
    },
    (p: any) => {
      p.operations[0].collection = 'missing'
    },
    (p: any) => {
      p.operations[0].sourceVersionFrom = 'next month'
    },
  ]) {
    const input = structuredClone(program)
    change(input)
    expect(() => parseAlsReviewProgram(input, alsAuditFixtures)).toThrow()
  }
})

test('coalescence requires a unique evidence guard for every returned alias', () => {
  const operation = program.operations.find(
    o => o.code === 'reconcile-identity' && o.returnedAliases === 'coalesce-guarded',
  )!
  const document = structuredClone(
    alsAuditFixtures.find(d => d.type === operation.fixture)!.document,
  ) as any
  document.identityReconciliations[0].previousGuards = []
  expect(() =>
    parseAlsReviewProgram({ schemaVersion: 1, operations: [operation] }, [
      { type: operation.fixture, document },
    ]),
  ).toThrow('returned-alias guard')
})

test('source guards distinguish absent district inputs from changed or unreviewed evidence', () => {
  const guard = october.sourceGuards[0]!
  expect(() => validateReviewedAlsSources([], '2099-01-01.0', fixture)).not.toThrow()
  const features = [
    { sourceFile: guard.sourceFile, feature: { properties: {}, geometry: null } },
  ] as unknown as HkgovAlsSourceFeature[]
  expect(() => validateReviewedAlsSources(features, '2099-01-01.0', fixture)).toThrow(
    'unreviewed source release',
  )
  const assertion = guard.assertions.find(
    a => a.version >= '2024-10-18.0' && a.hashes.length,
  )!
  expect(() =>
    validateReviewedAlsSources(features, assertion.version, fixture),
  ).toThrow('source evidence changed')
  expect(() =>
    validateReviewedAlsSources(features, '2024-07-25.0', fixture),
  ).not.toThrow()
})

test('parent assignment respects activation, aliases, district scope and distinct identities', () => {
  const group = october.groups[0]!
  const child = {
    id: 'resolved-child',
    identityAlias: group.childIds[0],
    sources: '{}',
  } as PreparedHkgovAlsRow
  const parent = { id: group.parentId, sources: '{}' } as PreparedHkgovAlsRow
  const rows = [child, parent]
  applyReviewedAlsParents(rows, '2024-07-25.0', 'hierarchy', fixture)
  expect(child.parentAddressId).toBeUndefined()
  applyReviewedAlsParents(rows, '2024-10-18.0', 'hierarchy', fixture)
  expect(child.parentAddressId).toBe(parent.id)
  expect(child.curatedGranularity).toBe('building')
  expect(JSON.parse(child.hierarchyCuration!)).toEqual({
    id: group.id,
    curationFile: `${fixture}.json`,
    authority: 'User decisions, 2026-10-04',
  })
  expect(() =>
    applyReviewedAlsParents([], '2024-10-18.0', 'hierarchy', fixture),
  ).not.toThrow()
  expect(() =>
    applyReviewedAlsParents([child], '2024-10-18.0', 'hierarchy', fixture),
  ).toThrow('parent is missing')
  expect(() =>
    applyReviewedAlsParents(
      [child, parent, { ...parent }],
      '2024-10-18.0',
      'hierarchy',
      fixture,
    ),
  ).not.toThrow()
  expect(child.parentAddressId).toBe(parent.id)
})

test('the program includes every retained-premise cohort in editorial order', () => {
  const operations = parseAlsReviewProgram(program, alsAuditFixtures)
  const retained = operations.filter(o => o.code === 'retain-premise')
  expect(retained).toHaveLength(24)
  expect(retained[0]!.fixture).toBe('hkgov-dpo-address-2026-reviewed-continuity')
  expect(retained.at(-1)!.fixture).toBe(
    'hkgov-dpo-address-september-2025-reviewed-retentions',
  )
  for (const operation of retained) {
    const document = alsAuditFixtures.find(d => d.type === operation.fixture)!
      .document as { rules: unknown[] }
    expect(operation.decisions as unknown[]).toEqual(document.rules)
  }
})

test('new operation contracts reject invalid parents, reconstruction and inventory evidence', () => {
  const cases = [
    [
      'classify-premise',
      (d: any) => {
        d.parentId = d.id
      },
    ],
    [
      'derive-parent',
      (d: any) => {
        d.childGranularity = 'invented'
      },
    ],
    [
      'reconcile-block-frontages',
      (d: any) => {
        d.blocks.push(d.blocks[0])
      },
    ],
    [
      'reconstruct-frontages',
      (d: any) => {
        d.subpremise.parentId = 'unreviewed-parent'
      },
    ],
    [
      'retain-premise',
      (d: any) => {
        d.assertions[0].hashes = ['invented']
      },
    ],
  ] as const
  for (const [code, change] of cases) {
    const operation = program.operations.find(o => o.code === code)!
    const document = structuredClone(
      alsAuditFixtures.find(d => d.type === operation.fixture)!.document,
    ) as any
    change(document[operation.collection][0])
    expect(() =>
      parseAlsReviewProgram({ schemaVersion: 1, operations: [operation] }, [
        { type: operation.fixture, document },
      ]),
    ).toThrow()
  }
})

test('editor schema and runtime operation vocabulary agree and unsupported scope fields are rejected', async () => {
  const { reviewOperationFields } = await import('./hkgovAlsReviewOperationSchema')
  const schema = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-review-program.schema.json'
    )
  ).default
  const alternatives = schema.properties.operations.items.oneOf
  expect(alternatives.map(entry => entry.properties.code.const).sort()).toEqual(
    Object.keys(reviewOperationFields).sort(),
  )
  for (const entry of alternatives) {
    expect(entry.required.slice().sort()).toEqual(
      [...reviewOperationFields[entry.properties.code.const]!].sort(),
    )
    expect(entry.additionalProperties).toBe(false)
  }
  const input = structuredClone(program)
  Object.assign(input.operations[0]!, { sourceVersionTo: '2026-08-19.0' })
  expect(() => parseAlsReviewProgram(input, alsAuditFixtures)).toThrow(
    'unsupported operation fields',
  )
})
