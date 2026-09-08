import { expect, test } from 'bun:test'
import { reportAlsReviewIssue } from './hkgovAlsReviewIssue'

test('manual review records are single-line JSON with exact source and candidates', () => {
  const lines: string[] = []
  reportAlsReviewIssue(
    {
      sourceVersion: '2024-07-25.0',
      sourceFile: 'source.geojson',
      featureIndexOneBased: 17,
      code: 'shared-building-owners',
      estate: 'Estate\nname',
      building: 'House',
      csu: 'source-csu',
      candidateAddressIds: ['a', 'b'],
    },
    line => lines.push(line),
  )
  expect(lines).toHaveLength(1)
  expect(lines[0]!.split('\n')).toHaveLength(1)
  expect(JSON.parse(lines[0]!.replace('ALS_MANUAL_REVIEW ', ''))).toMatchObject({
    status: 'unresolved',
    featureIndexOneBased: 17,
    candidateAddressIds: ['a', 'b'],
    estate: 'Estate\nname',
  })
})

test('skipped curation guards retain the exact decision and assertion failure', () => {
  const lines: string[] = []
  reportAlsReviewIssue(
    {
      code: 'curation-guard-mismatch',
      sourceVersion: '2024-07-25.0',
      curationFile: 'curation.json',
      decisionId: 'reviewed-point',
      message: 'source point changed\nactual differs from expected',
    },
    line => lines.push(line),
  )
  expect(lines).toHaveLength(1)
  expect(lines[0]!.split('\n')).toHaveLength(1)
  expect(JSON.parse(lines[0]!.replace('ALS_MANUAL_REVIEW ', ''))).toMatchObject({
    status: 'unresolved',
    decisionId: 'reviewed-point',
    curationFile: 'curation.json',
  })
})
