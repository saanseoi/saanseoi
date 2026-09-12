import {
  retainFixturePartitions,
  type AuditGuard,
  type IndividualAudit,
  type ProvenanceStore,
  type JsonRecord,
} from '@repo/core/provenance'
import { placeNormalisationRule } from '@repo/core/pipeline/services/places/place'
import apiFields from '../../../../../../fixtures/meta/apiFields/api-places-v0.1@overture-v1.json'
import { retainProducerAudit } from '../../api/producerAudit'
import { retainRegisteredRule } from '../../api/retainedRule'
import {
  placeCountryRule,
  readStagedJsonLines,
} from './processLocalPlaceSqlUploadPreparation'
import {
  placeAddressAnalysisRule,
  type SupplementaryCuration,
  type StagedAddressResolution,
} from './supplementaryPlaceAddress'
import type { StagedPlaces } from './processLocalPlaceSqlUploadTypes'

export type PlaceAddressAuditInput = {
  materialisationHash?: string
  fixture: SupplementaryCuration
  resolutionPath: string
  sourceVersion: string
  supplementaryCount: number
}

export async function retainPlaceProvenance(
  store: ProvenanceStore,
  input: {
    releaseId: string
    datasetCode: string
    addresses: PlaceAddressAuditInput
    staged?: StagedPlaces
  },
) {
  const counts: Record<string, number> = {
    direct: 0,
    supplementary: 0,
    review: 0,
    delayed: 0,
  }
  const selectedDecisions = new Set<number>()
  const observedPlaces = new Set<string>()
  let duplicatePlaces = 0
  let linked = 0
  const unreviewed: StagedAddressResolution[] = []
  for await (const resolution of readStagedJsonLines<StagedAddressResolution>(
    input.addresses.resolutionPath,
  )) {
    if (observedPlaces.has(resolution.placeId)) duplicatePlaces++
    observedPlaces.add(resolution.placeId)
    counts[resolution.tier] = (counts[resolution.tier] ?? 0) + 1
    if (resolution.addressId) linked++
    if (resolution.reviewDeferral) unreviewed.push(resolution)
    const index = input.addresses.fixture.decisions.findIndex(
      d =>
        d.placeId === resolution.placeId &&
        d.sourceRelease === input.addresses.sourceVersion &&
        d.fingerprint === resolution.fingerprint,
    )
    if (index >= 0 && resolution.tier !== 'review' && !resolution.reviewDeferral)
      selectedDecisions.add(index)
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const decisions = input.addresses.fixture.decisions.filter((_, index) =>
    selectedDecisions.has(index),
  )
  const fixture = {
    ...input.addresses.fixture,
    decisions: [],
    entries: input.addresses.fixture.entries.filter(entry =>
      observedPlaces.has(entry.placeId),
    ),
  }
  const definition = await retainRegisteredRule(
    store,
    placeAddressAnalysisRule.declaration,
  )
  const parts = await retainFixturePartitions(
    store,
    {
      kind: 'place-address-decisions',
      schemaVersion: 1,
      sourceVersion: input.addresses.sourceVersion,
      decisions,
    },
    'decisions',
  )
  const individuals: IndividualAudit[] = decisions.map((decision, index) => {
    const part = requireDefined(
      parts.find(p => index >= p.firstOrdinal && index < p.firstOrdinal + p.count),
    )
    return {
      id: `place-address:${decision.placeId}:${index}`,
      operation: placeAddressAnalysisRule.declaration.id,
      basis: 'fixture',
      outcome: 'applied',
      summary: `Reviewed Place Address: ${decision.resolution}.`,
      reason: decision.reason,
      definition,
      fixture: {
        object: part.object,
        pointer: `/decisions/${index - part.firstOrdinal}`,
      },
      record: {
        id: decision.placeId,
        names: decision.address?.values.map(v => v.formattedAddress) ?? [],
        parents: [],
      },
      context: JSON.parse(JSON.stringify(decision)) as JsonRecord,
    }
  })
  const reviewCount = counts.review ?? 0
  const guards: AuditGuard[] = [
    {
      id: 'place-address-review',
      summary: 'Every Place Address identity must have a resolved disposition.',
      consequence: 'block-ingestion',
      status: reviewCount ? 'failed' : 'passed',
      checked: total,
      failed: reviewCount,
      reason: reviewCount
        ? `${reviewCount} Place Address identities require explicit review.`
        : 'All analysed Place Address identities have a resolved disposition.',
    },
    {
      id: 'unique-place-address-identities',
      summary: 'Each Place identity has one Address disposition.',
      consequence: 'block-ingestion',
      status: duplicatePlaces ? 'failed' : 'passed',
      checked: total,
      failed: duplicatePlaces,
      reason: duplicatePlaces
        ? 'Duplicate Place identities in Address analysis.'
        : 'Every analysed Place identity is unique.',
    },
  ]
  const rules: Parameters<typeof retainProducerAudit>[1]['rules'] = [
    {
      declaration: placeAddressAnalysisRule.declaration,
      inputs: { places: total },
      outputs: {
        'place-address-links': linked,
        'supplementary-addresses': input.addresses.supplementaryCount,
      },
      recordsAffected: total,
      decisions: counts,
      fixtures: [
        { type: 'place-address-curations', document: fixture, arrayKey: 'entries' },
        ...(unreviewed.length
          ? [
              {
                type: 'place-address-unreviewed-cases',
                document: {
                  sourceVersion: input.addresses.sourceVersion,
                  entries: unreviewed,
                },
                arrayKey: 'entries',
              },
            ]
          : []),
      ],
    },
  ]
  if (input.staged) {
    const staged = input.staged
    const excluded = staged.actions
      .filter(
        a =>
          a.action === 'overture_place_country_review_required' &&
          (a.evidence as { disposition?: string })?.disposition === 'excluded',
      )
      .reduce((n, a) => n + a.affectedRecordCount, 0)
    rules.unshift(
      {
        declaration: placeNormalisationRule.declaration,
        inputs: { 'publisher-places': staged.processedRows },
        outputs: { 'normalised-places': staged.includedRows + excluded },
        recordsAffected: staged.processedRows,
        decisions: {
          normalised: staged.includedRows + excluded,
          omitted: staged.processedRows - staged.includedRows - excluded,
          localeConflicts: staged.actions.filter(
            a => a.action === 'overture_place_locale_conflict',
          ).length,
        },
      },
      {
        declaration: placeCountryRule.declaration,
        inputs: { 'normalised-places': staged.includedRows + excluded },
        outputs: { 'included-places': staged.includedRows },
        recordsAffected: excluded,
        decisions: { excluded, included: staged.includedRows },
      },
    )
    const difference = Math.abs(staged.includedRows - total)
    guards.push({
      id: 'place-address-coverage',
      summary: 'Analyse every included Place Address.',
      consequence: 'block-ingestion',
      status: difference ? 'failed' : 'passed',
      checked: staged.includedRows,
      failed: difference,
      reason: difference
        ? 'Place and Address analysis counts differ.'
        : 'Every included Place was analysed.',
    })
  }
  return retainProducerAudit(store, {
    ...input,
    rules,
    individuals,
    guards,
    ...(input.staged ? { apiFields } : {}),
  })
}
import { requireDefined } from '@repo/core/requireDefined'
