import fixture from '../../../../../fixtures/meta/patches/overture-kowloon-restoration.json'
import type { RuleDeclaration } from '../../provenance'
import type { ReleaseProcessingAction } from '../db/processingActions'

export const kowloonRestorationFixture = fixture
export const kowloonRestorationDeclaration: RuleDeclaration = {
  kind: 'processing-rule',
  schemaVersion: 1,
  id: fixture.id,
  scope: 'individual',
  basis: 'fixture',
  review: { kind: 'patch' },
  summary: fixture.reason,
  inputs: ['source-divisions'],
  outputs: ['divisions'],
  parameters: {},
  implementation: {
    path: 'libs/core/src/pipeline/services/overtureHongKongAreas.ts',
    symbol: 'missingOvertureHongKongAreaRows',
  },
}

export function kowloonRestorationActions(
  sourceRows: readonly Record<string, unknown>[],
  supplementalRows: readonly Record<string, unknown>[],
): ReleaseProcessingAction[] {
  const restored = supplementalRows.find(row => row.id === fixture.divisionId)
  if (!restored) return []
  const originals = sourceRows.filter(row => row.id === fixture.divisionId)
  return [
    {
      action: fixture.id,
      affectedRecordCount: 1,
      mode: 'automatic',
      summary: fixture.reason,
      evidence: {
        divisionId: fixture.divisionId,
        decision: originals.length
          ? 'replace-non-polygonal-source-row'
          : 'restore-missing-source-row',
        sourceRows: originals.map(row => ({
          id: row.id,
          subtype: row.subtype ?? null,
          class: row.class ?? null,
          geometryType:
            row.geometry && typeof row.geometry === 'object'
              ? ((row.geometry as Record<string, unknown>).type ?? null)
              : null,
        })),
        replacement: restored,
      },
    },
  ]
}
