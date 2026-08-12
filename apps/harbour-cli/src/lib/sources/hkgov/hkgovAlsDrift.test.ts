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
  sourceVersion: '2025-01-23.0',
  summary: { buildingName: 'OLD BUILDING', routeName: 'EXAMPLE ROAD' },
}

const renamed: HkgovAlsIdentityRecord = {
  continuityKey: 'same-premise-anchor',
  id: 'ss-new',
  identityKey: 'new-building-name',
  sourceVersion: '2025-02-25.0',
  summary: { buildingName: 'NEW BUILDING', routeName: 'EXAMPLE ROAD' },
}

const withdrawnBuildingName: HkgovAlsIdentityRecord = {
  ...previous,
  id: 'ss-new',
  identityKey: 'building-name-removed',
  sourceVersion: '2025-02-25.0',
  summary: { buildingName: null, routeName: 'EXAMPLE ROAD' },
}

const withdrawnEstateName: HkgovAlsIdentityRecord = {
  ...previous,
  id: 'ss-new',
  identityKey: 'estate-name-removed',
  sourceVersion: '2025-02-25.0',
  summary: {
    buildingName: 'OLD BUILDING',
    estateName: null,
    routeName: 'EXAMPLE ROAD',
  },
}

const withdrawnPhaseName: HkgovAlsIdentityRecord = {
  ...previous,
  id: 'ss-new',
  identityKey: 'phase-name-removed',
  sourceVersion: '2025-02-25.0',
  summary: {
    buildingName: 'OLD BUILDING',
    phaseName: null,
    routeName: 'EXAMPLE ROAD',
  },
}

const movedToEstateName: HkgovAlsIdentityRecord = {
  ...previous,
  id: 'ss-new',
  identityKey: 'building-name-moved-to-estate',
  sourceVersion: '2025-02-25.0',
  summary: {
    buildingName: null,
    estateName: 'OLD BUILDING',
    routeName: 'EXAMPLE ROAD',
  },
}

const qualifiedBlock: HkgovAlsIdentityRecord = {
  ...previous,
  id: 'ss-qualified-block',
  identityKey: 'qualified-block',
  summary: {
    blockDescriptor: 'BLK',
    blockNumber: '7',
    buildingName: null,
    estateName: 'KELLETT VIEW TOWN HOUSES',
    routeName: 'EXAMPLE ROAD',
  },
}

const unqualifiedPremise: HkgovAlsIdentityRecord = {
  ...qualifiedBlock,
  id: 'ss-unqualified',
  identityKey: 'unqualified-premise',
  sourceVersion: '2025-02-25.0',
  summary: {
    blockDescriptor: null,
    blockNumber: null,
    buildingName: 'KELLETT VIEW TOWN HOUSE',
    estateName: null,
    routeName: 'EXAMPLE ROAD',
  },
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

  test('automatically keeps the ID when ALS only withdraws a building name', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [withdrawnBuildingName],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(withdrawnBuildingName.identityKey)).toBe(previous.id)
    expect(result.resolvedMatchMethods.get(withdrawnBuildingName.identityKey)).toBe(
      'als-address-component-withdrawal',
    )
  })

  test.each([
    [
      'estate name',
      { ...previous.summary, estateName: 'OLD ESTATE' },
      withdrawnEstateName,
    ],
    ['phase name', { ...previous.summary, phaseName: 'PHASE 1' }, withdrawnPhaseName],
  ])(
    'automatically keeps the ID when ALS only withdraws an $0',
    (_, summary, current) => {
      const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
        { ...previous, summary },
      ])
      const result = resolveHkgovAlsIdentityDrift(
        [current],
        history,
        emptyHkgovAlsIdentityDecisions(),
      )

      expect(result.candidates).toEqual([])
      expect(result.resolvedIds.get(current.identityKey)).toBe(previous.id)
      expect(result.resolvedMatchMethods.get(current.identityKey)).toBe(
        'als-address-component-withdrawal',
      )
    },
  )

  test('automatically keeps the ID when ALS moves a name from building to estate', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [movedToEstateName],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(movedToEstateName.identityKey)).toBe(previous.id)
    expect(result.resolvedMatchMethods.get(movedToEstateName.identityKey)).toBe(
      'als-building-estate-reassignment',
    )
  })

  test('automatically creates a new ID when a structured block is gained or lost', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      qualifiedBlock,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [unqualifiedPremise],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.has(unqualifiedPremise.identityKey)).toBe(false)
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
