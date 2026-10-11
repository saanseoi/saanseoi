import { expect, test } from 'bun:test'
import {
  monthlyCutoff,
  selectMonthlyIngredient,
  selectMonthlyIngredients,
} from './monthlyInputs'
const source = (version: string) => ({
  datasetCode: 'landsd',
  sourceVersion: version,
  releaseCode: `landsd-${version}`,
  resourceType: 'division',
  rawObjectKey: 'by-source/test',
  contentHash: 'a'.repeat(64),
  releaseNotesUrl: null,
})
test('first-of-month selection includes the edition date and carries slow sources forward', () => {
  expect(
    selectMonthlyIngredient('2026-09-01.0', 'landsd', [
      source('2026-09-01.0'),
      source('2026-09-02.0'),
      source('2026-06-10.0'),
    ]).sourceVersion,
  ).toBe('2026-09-01.0')
  expect(
    selectMonthlyIngredient('2026-10-01.0', 'landsd', [
      source('2026-08-19.0'),
      source('2026-09-23.0'),
    ]).sourceVersion,
  ).toBe('2026-09-23.0')
  expect(() => monthlyCutoff('2026-09-23.0')).toThrow()
  expect(() =>
    selectMonthlyIngredient('2026-09-01.0', 'landsd', [source('2026-09-02.0')]),
  ).toThrow()
})

test('September and October editions select August and September Overture with the same slower ingredients', () => {
  const overture = (version: string) => ({
    ...source(version),
    datasetCode: 'overture',
  })
  const review = [overture('2026-08-19.0'), source('2026-06-10.0')]
  const publication = [overture('2026-09-23.0')]
  expect(
    selectMonthlyIngredients('2026-09-01.0', review, publication).map(
      pin => pin.sourceVersion,
    ),
  ).toEqual(['2026-08-19.0', '2026-06-10.0'])
  expect(
    selectMonthlyIngredients('2026-10-01.0', review, publication).map(
      pin => pin.sourceVersion,
    ),
  ).toEqual(['2026-09-23.0', '2026-06-10.0'])
  expect(review[0]!.sourceVersion).toBe('2026-08-19.0')
})

const island = (version: string) => ({
  ...source(version),
  datasetCode: 'ds-hk-protomaps-island',
  releaseCode: `dr-hk-protomaps-island-${version}::divisionArea`,
  resourceType: 'divisionArea',
})

test('Protomaps cannot carry forward and a future extract cannot satisfy the edition', () => {
  for (const candidates of [
    [],
    [island('2026-09-01.3')],
    [island('2026-11-01.0')],
    [island('2026-10-02.0')],
  ]) {
    expect(() =>
      selectMonthlyIngredient('2026-10-01.0', 'ds-hk-protomaps-island', candidates),
    ).toThrow('Missing ds-hk-protomaps-island extract for edition month 2026-10')
  }
  expect(() =>
    selectMonthlyIngredients('2026-10-01.0', [island('2026-09-01.3')], []),
  ).toThrow('Carry-forward is not allowed')
})

test('selects the newest same-month extraction revision without advancing the review pins', () => {
  const review = [island('2026-09-01.3'), source('2026-06-10.0')]
  const publication = [
    island('2026-10-01.0'),
    island('2026-10-01.1'),
    island('2026-11-01.0'),
  ]
  expect(
    selectMonthlyIngredients('2026-09-01.0', review, publication).map(
      pin => pin.sourceVersion,
    ),
  ).toEqual(['2026-09-01.3', '2026-06-10.0'])
  expect(
    selectMonthlyIngredients('2026-10-01.0', review, publication).map(
      pin => pin.sourceVersion,
    ),
  ).toEqual(['2026-10-01.1', '2026-06-10.0'])
  expect(review[0]!.sourceVersion).toBe('2026-09-01.3')
  expect(() =>
    selectMonthlyIngredient('2026-10-01.0', 'ds-hk-protomaps-island', [
      island('2026-10-01.1'),
      { ...island('2026-10-01.1'), contentHash: 'b'.repeat(64) },
    ]),
  ).toThrow('Ambiguous ingredient')
})
