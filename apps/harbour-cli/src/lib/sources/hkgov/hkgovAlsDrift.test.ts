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

const renamedAgain: HkgovAlsIdentityRecord = {
  continuityKey: 'same-premise-anchor',
  id: 'ss-newer',
  identityKey: 'newer-building-name',
  sourceVersion: '2025-03-26.0',
  summary: { buildingName: 'NEWER BUILDING', routeName: 'EXAMPLE ROAD' },
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

function renamedBuilding(buildingName: string): HkgovAlsIdentityRecord {
  return {
    ...previous,
    id: 'ss-new',
    identityKey: `new-${buildingName}`,
    sourceVersion: '2025-02-25.0',
    summary: { ...previous.summary, buildingName },
  }
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

  test('uses the latest canonical predecessor for a sequential identity chain', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
      { ...renamed, id: previous.id },
    ])
    const result = resolveHkgovAlsIdentityDrift([renamedAgain], history, {
      authority: 'hkgov-dpo',
      decisions: [
        {
          currentIdentityKey: renamedAgain.identityKey,
          previousIdentityKey: renamed.identityKey,
          resolution: 'keep-existing-id',
        },
      ],
      version: 1,
    })

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(renamedAgain.identityKey)).toBe(previous.id)
    expect(result.resolvedPreviousRecords.get(renamedAgain.identityKey)).toEqual({
      ...renamed,
      id: previous.id,
    })
  })

  test('reuses a canonical ID when a later release repeats the latest identity', () => {
    const repeatedIdentity = {
      ...renamed,
      id: 'ss-generated-from-renamed-identity',
      sourceVersion: '2025-03-26.0',
    }
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
      { ...renamed, id: previous.id },
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [repeatedIdentity],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(repeatedIdentity.identityKey)).toBe(previous.id)
    expect(result.resolvedMatchMethods.get(repeatedIdentity.identityKey)).toBe(
      'als-identity-history',
    )
  })

  test('does not choose a predecessor from a later release', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      { ...renamed, sourceVersion: '2025-03-26.0' },
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [renamedAgain],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.size).toBe(0)
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

  test.each([
    'OLD BUILDING (BLOCK 12)',
    'OLD BUILDING (BLK A)',
    'OLD BUILDING (TWR A1)',
    'OLD BUILDING (TWR 1A)',
    'OLD BUILDING (VILLA II)',
    'OLD BUILDING (HOUSE B)',
    'OLD BUILDING (HSE C1)',
    'OLD BUILDING (BLKS C1 & C2)',
    'OLD BUILDING (EAST TOWER)',
    'OLD BUILDING (NORTH-WEST TWR)',
    'OLD BUILDING (SOUTHEAST TOWER)',
    'OLD BUILDING (HIGH BLK)',
    'OLD BUILDING (CENTRE TOWER)',
  ])(
    'automatically creates a new ID for a newly qualified site part: %s',
    buildingName => {
      const current = renamedBuilding(buildingName)
      const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
        previous,
      ])
      const result = resolveHkgovAlsIdentityDrift(
        [current],
        history,
        emptyHkgovAlsIdentityDecisions(),
      )

      expect(result.candidates).toEqual([])
      expect(result.resolvedIds.has(current.identityKey)).toBe(false)
    },
  )

  test('does not let an earlier keep decision collapse a newly qualified site part', () => {
    const current = renamedBuilding('OLD BUILDING (TOWER 3)')
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift([current], history, {
      authority: 'hkgov-dpo',
      decisions: [
        {
          currentIdentityKey: current.identityKey,
          previousIdentityKey: previous.identityKey,
          resolution: 'keep-existing-id',
        },
      ],
      version: 1,
    })

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.has(current.identityKey)).toBe(false)
  })

  test('automatically retains the ID for a CENTRAL building-name addition', () => {
    const current = renamedBuilding('OLD BUILDING (CENTRAL)')
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [current],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.get(current.identityKey)).toBe(previous.id)
  })

  test.each(['OLD BUILDING (NO. 7) INDUSTRIAL BUILDING'])(
    'still requires review for a non-site-part building rename: %s',
    buildingName => {
      const current = renamedBuilding(buildingName)
      const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
        previous,
      ])
      const result = resolveHkgovAlsIdentityDrift(
        [current],
        history,
        emptyHkgovAlsIdentityDecisions(),
      )

      expect(result.candidates).toEqual([{ current, previous }])
    },
  )

  test.each([
    ['OLD BUILDING (STAGE I/II)', true],
    ['OLD BUILDING (PHASE 1)', true],
    ['OLD BUILDING (PHASE II/III)', false],
    ['OLD BUILDING (STAGE B/C)', false],
    ['OLD BUILDING (3A/3B)', true],
    ['OLD BUILDING (3A)', false],
    ['OLD BUILDING (3B)', false],
    ['OLD BUILDING (NEW WING)', false],
    ['OLD BUILDING (PRIMARY SECTION)', false],
    ['OLD BUILDING (HALL 16)', false],
    ['OLD BUILDING (KOWLOON)', true],
    ['OLD BUILDING (SECOND CAMPUS)', true],
    ['OLD BUILDING (HK) LIMITED', true],
  ] as const)(
    'applies the confirmed building-name rule: %s',
    (buildingName, retains) => {
      const current = renamedBuilding(buildingName)
      const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
        previous,
      ])
      const result = resolveHkgovAlsIdentityDrift(
        [current],
        history,
        emptyHkgovAlsIdentityDecisions(),
      )

      expect(result.candidates).toEqual([])
      expect(result.resolvedIds.has(current.identityKey)).toBe(retains)
    },
  )

  test('leaves a first-phase facility addition for manual review', () => {
    const current = renamedBuilding('OLD BUILDING (PHASE 1) LATRINE')
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      previous,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [current],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([{ current, previous }])
    expect(result.resolvedIds.has(current.identityKey)).toBe(false)
  })

  test('creates a new ID for a material site part added to an unnamed premise', () => {
    const current = renamedBuilding('NEW BUILDING (HALL BLOCK)')
    const unnamedPrevious = {
      ...previous,
      summary: { ...previous.summary, buildingName: null },
    }
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      unnamedPrevious,
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [current],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.has(current.identityKey)).toBe(false)
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

  test('does not choose between a same-release historical split', () => {
    const history = mergeHkgovAlsIdentityHistory(emptyHkgovAlsIdentityHistory(), [
      { ...previous, identityKey: 'split-a', sourceVersion: '2025-02-25.0' },
      { ...previous, identityKey: 'split-b', sourceVersion: '2025-02-25.0' },
    ])
    const result = resolveHkgovAlsIdentityDrift(
      [renamedAgain],
      history,
      emptyHkgovAlsIdentityDecisions(),
    )

    expect(result.candidates).toEqual([])
    expect(result.resolvedIds.size).toBe(0)
  })
})
