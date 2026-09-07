import { expect, test } from 'bun:test'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseCachedStatistics } from './cachedStatisticNormalisation.ts'
import { normaliseHkgovCenstatdStatistics } from './normaliseHkgovCenstatdStatistics.ts'

test('small canonical cohorts normalise directly without creating disk artefacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'small-statistic-cohort-'))
  try {
    const input = Array.from({ length: 18 }, (_, id) => ({
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
      properties: { AREA: '12' },
      sourceFeatureRef: `example:${id}`,
      sourceReleaseId: 'release',
      sourceVersion: '2026',
    }))
    const expected = normaliseHkgovCenstatdStatistics(input)
    expect(await normaliseCachedStatistics(directory, input)).toEqual(expected)
    expect(await normaliseCachedStatistics(directory, input)).toEqual(expected)
    expect(await readdir(directory)).toEqual([])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('cached canonical preparation matches the normaliser and refreshes changed reviews and bridges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'canonical-statistic-cache-'))
  try {
    const input = Array.from({ length: 19 }, (_, index) => ({
      datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-example',
      divisionId: 'division-1',
      properties: { AREA: '12' },
      sourceFeatureRef: `example:${index}`,
      sourceReleaseId: 'release-example',
      sourceVersion: '2026',
    }))
    const metadata = {
      localisations: [],
      aggregation: 'total' as const,
      statisticKind: 'quantity' as const,
      fieldName: 'landArea',
      measureCode: 'landArea',
      dimensions: {},
      unitCode: 'km2',
    }
    const options = {
      fieldMetadata: new Map([[`${input[0]?.datasetCode}\0AREA`, metadata]]),
    }
    let calls = 0
    const normalise: typeof normaliseHkgovCenstatdStatistics = (rows, settings) => {
      calls++
      return normaliseHkgovCenstatdStatistics(rows, settings)
    }
    const first = await normaliseCachedStatistics(directory, input, options, normalise)
    expect(first).toEqual(normaliseHkgovCenstatdStatistics(input, options))
    expect(
      await normaliseCachedStatistics(directory, input, options, normalise),
    ).toEqual(first)
    expect(calls).toBe(1)
    const changedReview = {
      fieldMetadata: new Map([
        [
          `${input[0]?.datasetCode}\0AREA`,
          { ...metadata, fieldName: 'reviewedLandArea' },
        ],
      ]),
    }
    const reviewed = await normaliseCachedStatistics(
      directory,
      input,
      changedReview,
      normalise,
    )
    expect(reviewed).toEqual(normaliseHkgovCenstatdStatistics(input, changedReview))
    expect(reviewed).not.toEqual(first)
    expect(calls).toBe(2)
    const changedBridge = input.map(row => ({ ...row, divisionId: 'division-2' }))
    const remapped = await normaliseCachedStatistics(
      directory,
      changedBridge,
      changedReview,
      normalise,
    )
    expect(remapped).toEqual(
      normaliseHkgovCenstatdStatistics(changedBridge, changedReview),
    )
    expect(remapped).not.toEqual(reviewed)
    expect(calls).toBe(3)
    // The unreviewed field-discovery pass has its own identity and is reusable too.
    await normaliseCachedStatistics(directory, input, {}, normalise)
    await normaliseCachedStatistics(directory, input, {}, normalise)
    expect(calls).toBe(4)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
