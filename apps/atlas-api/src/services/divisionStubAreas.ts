import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../fixtures/divisions/hk/stub-areas.json'
import type { StubAreas } from '@repo/core/pipeline/services/divisions/geographicReview.ts'
import { reviewAreaBounds } from '@repo/core/pipeline/services/divisions/geographicReview.ts'
import type { DivisionAreaRecord } from '../db/divisions'

export function hasDivisionStubVariant(domain: string, cohort: string | null) {
  return domain === 'geographic' && cohort === fixture.cohort
}

/** Opt-in review geometry only. It has no public dataset or catalogue registration. */
export function listDivisionStubAreas(
  ids: string[],
  data = fixture as StubAreas,
): DivisionAreaRecord[] {
  const selected = new Set(ids)
  return data.features
    .filter(feature => selected.has(feature.properties.divisionId))
    .map(feature => ({
      id: buildDeterministicUuidV5(
        '68cfb529-cbcb-58c9-bdf1-ff9c8e5b9c7c',
        `division-area:stub:${data.cohort}:${feature.properties.divisionId}`,
      ),
      divisionId: feature.properties.divisionId,
      variant: 'stub',
      geometry: feature.geometry,
      bbox: reviewAreaBounds(feature.geometry),
      identifiers: null,
      sources: null,
      type: 'mixed',
      isLand: null,
      isTerritorial: null,
    }))
}
