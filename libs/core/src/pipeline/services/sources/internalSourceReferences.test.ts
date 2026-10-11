import { expect, test } from 'bun:test'
import {
  assertInternalSourcePins,
  assertInternalSourceReferences,
} from './internalSourceReferences'
import {
  nativeSourcePayloadHashInput,
  saanseoiSourcePayload,
  overtureSourcePayload,
} from './sourcePayload'
import { createHash } from '../../utils'

test('internal references resolve against one version per dataset, across resource types', () => {
  const pins = ['division', 'divisionArea'].map(resourceType => ({
    datasetCode: 'ds-hk-overture-division',
    sourceVersion: '2026-09-23.0',
    resourceType,
  }))
  expect(() => assertInternalSourcePins(pins)).not.toThrow()
  expect(() =>
    assertInternalSourcePins([
      ...pins,
      { ...pins[0]!, resourceType: 'divisionBoundary', sourceVersion: '2026-08-19.0' },
    ]),
  ).toThrow('Mixed')
  expect(() => assertInternalSourcePins([pins[0]!, pins[0]!])).toThrow('Duplicate')
  expect(() =>
    assertInternalSourceReferences(
      {
        sources: { overture: [{ dataset: 'ds-hk-overture-division', recordId: 'id' }] },
      },
      { datasetCode: 'ds-hk-saanseoi-division', sourceReleases: [] },
    ),
  ).toThrow('Unpinned')
})

test('versions are rejected in internal sources and memberships, preserving native attribution', () => {
  for (const field of ['sources', 'memberships']) {
    expect(() =>
      assertInternalSourceReferences({
        [field]: [{ dataset: 'ds-hk-overture-division', release: 'old' }],
      }),
    ).toThrow('must not contain release')
  }
  expect(
    overtureSourcePayload({
      id: 'id',
      sources: [{ dataset: 'publisher', release: 'native' }],
    }).properties.sources,
  ).toEqual([{ dataset: 'publisher', release: 'native' }])
})

test('advancing release pins leaves the retained content fingerprint unchanged', async () => {
  const record = {
    id: 'id',
    sources: {
      overture: [{ dataset: 'ds-hk-overture-division', recordId: 'upstream' }],
    },
  }
  const hashes = []
  for (const sourceVersion of ['2026-08-19.0', '2026-09-23.0']) {
    assertInternalSourceReferences(record, {
      datasetCode: 'ds-hk-saanseoi-division',
      sourceReleases: [
        {
          datasetCode: 'ds-hk-overture-division',
          sourceVersion,
          resourceType: 'division',
        },
      ],
    })
    hashes.push(
      await createHash(
        nativeSourcePayloadHashInput(saanseoiSourcePayload({ id: 'id', record })),
      ),
    )
  }
  expect(hashes[0]).toBe(hashes[1])
})
