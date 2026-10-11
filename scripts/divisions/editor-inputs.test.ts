import { expect, test } from 'bun:test'
import { selectLatestEditorInputs } from './editor-inputs'

const pin = (
  sourceVersion: string,
  resourceType = 'division',
  datasetCode = 'overture',
) => ({
  datasetCode,
  sourceVersion,
  resourceType,
  releaseCode: `${datasetCode}-${resourceType}-${sourceVersion}`,
  contentHash: 'a'.repeat(64),
  rawObjectKey: 'by-source/test',
  releaseNotesUrl: null,
})

test('editor advances all datasets as newer pins arrive without changing baseline pins', () => {
  const baseline = [
    pin('2026-08-19.0'),
    pin('2026-08-19.0', 'divisionArea'),
    pin('2026-09-01.3', 'divisionArea', 'protomaps'),
  ]
  const before = structuredClone(baseline)
  const september = [pin('2026-09-23.0'), pin('2026-09-23.0', 'divisionArea')]
  expect(
    selectLatestEditorInputs(baseline, september).map(p => p.sourceVersion),
  ).toEqual(['2026-09-23.0', '2026-09-23.0', '2026-09-01.3'])
  const newer = [
    pin('2026-10-21.0'),
    pin('2026-10-21.0', 'divisionArea'),
    pin('2026-10-01.2', 'divisionArea', 'protomaps'),
    pin('2026-10-01.10', 'divisionArea', 'protomaps'),
  ]
  expect(
    selectLatestEditorInputs(baseline, [...newer, ...september]).map(
      p => p.sourceVersion,
    ),
  ).toEqual(['2026-10-21.0', '2026-10-21.0', '2026-10-01.10'])
  expect(baseline).toEqual(before)
})

test('missing latest companions and conflicting hashes fail instead of using stale resources', () => {
  const baseline = [pin('2026-08-19.0'), pin('2026-08-19.0', 'divisionArea')]
  expect(() => selectLatestEditorInputs(baseline, [pin('2026-09-23.0')])).toThrow(
    'missing divisionArea',
  )
  expect(() =>
    selectLatestEditorInputs(
      [pin('2026-09-23.0')],
      [{ ...pin('2026-09-23.0'), contentHash: 'b'.repeat(64) }],
    ),
  ).toThrow('Ambiguous editor input')
  expect(selectLatestEditorInputs(baseline, baseline)).toEqual(baseline)
})
