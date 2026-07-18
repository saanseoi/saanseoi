import { describe, expect, test } from 'bun:test'

import {
  emptyHkgovAlsIdentityDecisions,
  emptyHkgovAlsIdentityHistory,
  mergeHkgovAlsIdentityHistory,
  resolveHkgovAlsIdentityDrift,
  type HkgovAlsIdentityRecord,
} from './hkgovAlsDrift.ts'

const previous: HkgovAlsIdentityRecord = {
  continuityKey: 'same-premise-anchor',
  id: 'ss-previous',
  identityKey: 'old-building-name',
  sourceVersion: '2025-01-23.1031',
  summary: { buildingName: 'OLD BUILDING', routeName: 'EXAMPLE ROAD' },
}

const renamed: HkgovAlsIdentityRecord = {
  continuityKey: 'same-premise-anchor',
  id: 'ss-new',
  identityKey: 'new-building-name',
  sourceVersion: '2025-02-25.1050',
  summary: { buildingName: 'NEW BUILDING', routeName: 'EXAMPLE ROAD' },
}

describe('HKGov ALS identity drift', () => {
  test('requires a decision when a premise name changes on one continuity anchor', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [renamed],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([{ current: renamed, previous }])
    expect(result.resolvedIds.size).toBe(0)
  })

  test('keeps the reviewed prior ID only for an explicit keep decision', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift([renamed], history, {
      authority: 'hkgov-dpo',
      decisions: [
        {
          currentIdentityKey: renamed.identityKey,
          previousIdentityKey: previous.identityKey,
          resolution: 'keep-existing-id',
        },
      ],
      version: 1,
    })

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(renamed.identityKey)).toBe(previous.id)
  })

  test('does not infer continuity when several historic premises share an anchor', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
      { ...previous, id: 'ss-other', identityKey: 'other-premise' },
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [renamed],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.size).toBe(0)
  })
})
