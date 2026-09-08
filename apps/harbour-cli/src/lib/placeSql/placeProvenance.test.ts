import { afterEach, expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { verifyAuditResult, readObject } from '@repo/core/provenance'
import { LocalPipelineBucket } from '../localPipeline/localBucket'
import { retainPlaceProvenance } from './placeProvenance'
import {
  parseSupplementaryCuration,
  type SupplementaryCuration,
} from './supplementaryPlaceAddress'
import policy from './testFixtures/supplementaryAddressPolicy.json'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

test('Places retains applied reviewed decisions and publication-blocking unresolved counts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-provenance-'))
  directories.push(directory)
  const resolutionPath = join(directory, 'resolutions.jsonl')
  const fixture: SupplementaryCuration = {
    ...parseSupplementaryCuration(structuredClone(policy)),
    entries: [],
    decisions: [
      {
        placeId: 'reviewed',
        sourceRelease: '2026-09',
        fingerprint: 'fingerprint',
        previousAddressId: null,
        resolution: 'leave_unlinked',
        addressId: null,
        reason: 'No matching official premise.',
      },
    ],
  }
  await writeFile(
    resolutionPath,
    [
      {
        placeId: 'reviewed',
        fingerprint: 'fingerprint',
        tier: 'delayed',
        addressId: null,
      },
      { placeId: 'pending', fingerprint: 'pending', tier: 'review', addressId: null },
    ]
      .map(row => JSON.stringify(row))
      .join('\n'),
  )
  const store = new LocalPipelineBucket(directory)
  const result = await retainPlaceProvenance(store, {
    releaseId: 'place-release',
    datasetCode: 'places',
    addresses: {
      fixture,
      resolutionPath,
      sourceVersion: '2026-09',
      supplementaryCount: 0,
    },
    staged: {
      path: 'unused',
      processedRows: 3,
      includedRows: 2,
      actions: [
        {
          action: 'overture_place_country_review_required',
          mode: 'automatic',
          affectedRecordCount: 1,
          summary: 'Excluded country.',
          evidence: { disposition: 'excluded', publisher: 'TRANSIENT_VALUE' },
        },
      ],
    },
  })
  await verifyAuditResult(store, result.manifest)
  expect(result.manifest.attempt.status).toBe('failed')
  expect(result.manifest.guards[0]).toMatchObject({
    failed: 1,
    checked: 2,
    status: 'failed',
  })
  expect(result.manifest.bulk[1]?.counts.decisions).toEqual({
    excluded: 1,
    included: 2,
  })
  expect(result.manifest.applicationCount).toBe(1)
  expect(
    await readObject(store, requireDefined(result.manifest.chunks[0])),
  ).toMatchObject({
    actions: [
      {
        reason: 'No matching official premise.',
        record: { id: 'reviewed' },
        fixture: { pointer: '/decisions/0' },
      },
    ],
  })
})
