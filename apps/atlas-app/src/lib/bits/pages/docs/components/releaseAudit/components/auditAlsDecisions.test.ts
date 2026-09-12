import { expect, test } from 'bun:test'
import {
  alsAuditDecisions,
  alsDecisionInRelease,
  alsHandlingFields,
} from './auditAlsDecisions'

test('release bounds, lifecycle and explicit zero matches determine visible decisions', () => {
  expect(
    alsDecisionInRelease(
      { sourceVersions: ['2025-01-01.0'] },
      'dr-hk-hkgov-dpo-address-2025-01-01.0',
    ),
  ).toBe(true)
  expect(
    alsDecisionInRelease({ sourceVersions: ['2025-01-01.0'] }, '2025-02-01.0'),
  ).toBe(false)
  expect(
    alsDecisionInRelease(
      { releases: [{ version: '2025-01-01.0', count: 0 }] },
      '2025-01-01.0',
    ),
  ).toBe(false)
  expect(
    alsDecisionInRelease(
      { sourceVersionFrom: '2025-01-01.0', sourceVersionTo: '2025-01-31.0' },
      '2025-02-01.0',
    ),
  ).toBe(false)
  expect(
    alsDecisionInRelease(
      {
        application: {
          state: 'active',
          mode: 'until-revoked',
          sourceVersionFrom: '2025-01-01.0',
        },
      },
      '2025-02-01.0',
    ),
  ).toBe(true)
  expect(
    alsDecisionInRelease(
      {
        application: {
          state: 'revoked',
          mode: 'until-revoked',
          sourceVersionFrom: '2025-01-01.0',
        },
      },
      '2025-02-01.0',
    ),
  ).toBe(false)
})

test('counts decisions across mixed arrays and hides empty and unrelated fixtures', () => {
  const decisions = alsAuditDecisions(
    {
      'address-granularity': { version: 1, overrides: [] },
      'hkgov-dpo-address-approved-estate-batch': {
        sourceVersionFrom: '2025-01-01.0',
        sourceVersionTo: '2025-02-01.0',
        corrections: [{ id: 'a', name: 'PRIVATE ESTATE NAME', to: 'reviewed-id' }],
        duplicates: [{ id: 'b', csu: 'duplicate' }],
      },
      'hkgov-dpo-address-coordinate-backfills': {
        backfills: [
          {
            id: 'c',
            sourceVersionFrom: '2024-01-01.0',
            sourceVersionTo: '2024-02-01.0',
          },
        ],
      },
    },
    '2025-01-01.0',
  )
  expect(decisions).toHaveLength(2)
  expect(decisions.map(d => d.kind)).toEqual(['identity', 'suppress'])
  expect(decisions[0]?.context).toContain('PRIVATE ESTATE NAME')
  expect(
    decisions.some(d => /PRIVATE ESTATE NAME/.test(`${d.title} ${d.description}`)),
  ).toBe(false)
})

test('distinguishes forward fill from backfill and retains structured point changes', () => {
  const decisions = alsAuditDecisions(
    {
      'hkgov-dpo-address-2d-backfills': {
        backfills: [
          {
            id: 'forward',
            sourceVersions: ['2025-01-01.0'],
            evidenceSourceVersion: '2024-01-01.0',
          },
          {
            id: 'back',
            sourceVersions: ['2025-01-01.0'],
            evidenceSourceVersion: '2026-01-01.0',
          },
        ],
      },
      'hkgov-dpo-address-coordinate-backfills': {
        backfills: [
          {
            id: 'point',
            sourceVersionFrom: '2025-01-01.0',
            sourceVersionTo: null,
            previousCoordinates: [114, 22],
            currentCoordinates: [114.1, 22.1],
          },
        ],
      },
    },
    '2025-01-01.0',
  )
  expect(decisions.map(d => d.kind)).toEqual(['forward', 'backfill', 'coordinate'])
  expect(decisions[2]?.input.previousCoordinates).toEqual([114, 22])
  expect(decisions[2]?.output.currentCoordinates).toEqual([114.1, 22.1])
  expect(alsHandlingFields({ point: [114, 22] })).toEqual([
    { label: 'Point', value: '114, 22' },
  ])
})

test('coordinate selection only appears in its own release window', () => {
  const fixture = {
    'hkgov-dpo-address-aliased-premise-coalescences': {
      coalescences: [
        {
          id: 'pair',
          sourceVersionFrom: '2024-01-01.0',
          sourceVersionTo: null,
          coordinateSelection: {
            sourceVersionFrom: '2025-01-01.0',
            sourceVersionTo: null,
            selected: 'alias',
            aliasCoordinates: [114, 22],
            ownerCoordinates: [115, 23],
          },
        },
      ],
    },
  }
  expect(
    alsAuditDecisions(fixture, '2024-01-01.0')[0]?.output.coordinates,
  ).toBeUndefined()
  expect(alsAuditDecisions(fixture, '2025-01-01.0')[0]?.output.coordinates).toEqual([
    114, 22,
  ])
})
