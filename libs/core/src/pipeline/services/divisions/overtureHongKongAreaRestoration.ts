import fixture from '../../../../../../fixtures/meta/patches/overture-hong-kong-area-restoration.json'
import type { ReleaseProcessingAction } from '../../db/processingActions'
import type { RuleDeclaration } from '../../../provenance'
import {
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
} from './overtureHongKongAreas'

export const overtureHongKongAreaRestorationFixture = fixture
export const overtureHongKongAreaRestorationDeclaration: RuleDeclaration = {
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
    path: 'libs/core/src/pipeline/services/divisions/overtureHongKongAreaRestoration.ts',
    symbol: 'overtureHongKongAreaRestorationActions',
  },
}

function hasPolygonGeometry(row: Record<string, unknown>): boolean {
  const geometry = row.geometry
  return Boolean(
    geometry &&
      typeof geometry === 'object' &&
      !Array.isArray(geometry) &&
      ((geometry as Record<string, unknown>).type === 'Polygon' ||
        (geometry as Record<string, unknown>).type === 'MultiPolygon'),
  )
}

export function overtureHongKongAreaRestorationActions(
  sourceRows: readonly Record<string, unknown>[],
  supplementalRows: readonly Record<string, unknown>[],
): ReleaseProcessingAction[] {
  return overtureHongKongAreas.flatMap(area => {
    const divisionId = overtureHongKongAreaDivisionId(area.code)
    const replacement = supplementalRows.find(row => row.id === divisionId)
    if (!divisionId || !replacement) return []
    const originals = sourceRows.filter(row => row.id === divisionId)
    if (originals.length > 0 && originals.every(hasPolygonGeometry)) return []
    return [
      {
        action: fixture.id,
        affectedRecordCount: 1,
        mode: 'automatic' as const,
        summary: `Restore the ${area.names.en} area identity when it is missing from Overture.`,
        evidence: {
          decision: originals.length
            ? 'replace-non-polygonal-source-row'
            : 'restore-missing-source-row',
          divisionId,
          names: Object.values(area.names),
          reason: fixture.reason,
          sourceRows: originals.map(row => ({
            id: row.id,
            geometryType:
              row.geometry && typeof row.geometry === 'object'
                ? ((row.geometry as Record<string, unknown>).type ?? null)
                : null,
          })),
          replacement,
        },
      },
    ]
  })
}
