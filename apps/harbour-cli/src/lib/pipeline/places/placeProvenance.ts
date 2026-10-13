import { createHash } from 'node:crypto'
import { placeAddressReviewReference } from './placeAddressReviewReferences.ts'
import { readFile } from 'node:fs/promises'
import type { writePlaceIdentityLedger } from './placeIdentityLedger'
import { placeIdentityDeclaration } from '@repo/core/pipeline/services/places/placeIdentity'
import type { NormalisedPlace } from '@repo/core/pipeline/services/places/place'
import {
  retainCurationReference,
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
  snapshotId: string
  addressSnapshotId: string
  placeReleaseId: string
  materialisationHash?: string
  fixture: SupplementaryCuration
  resolutionPath: string
  sourceVersion: string
  supplementaryCount: number
}

export async function retainPlaceProvenance(
  store: ProvenanceStore,
  input: {
    snapshotId: string
    resourceReleaseId: string
    datasetCode: string
    addresses: PlaceAddressAuditInput
    staged?: StagedPlaces
    identityLedger?: Awaited<ReturnType<typeof writePlaceIdentityLedger>>
    identityPath?: string
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
  const unreviewed: ReturnType<typeof placeAddressReviewReference>[] = []
  for await (const resolution of readStagedJsonLines<StagedAddressResolution>(
    input.addresses.resolutionPath,
  )) {
    if (observedPlaces.has(resolution.placeId)) duplicatePlaces++
    observedPlaces.add(resolution.placeId)
    counts[resolution.tier] = (counts[resolution.tier] ?? 0) + 1
    if (resolution.addressId) linked++
    if (resolution.tier === 'review' || resolution.tier === 'investigation')
      unreviewed.push(placeAddressReviewReference(resolution))
    const index = input.addresses.fixture.decisions.findIndex(
      d =>
        d.placeId === resolution.placeId &&
        d.sourceRelease === input.addresses.sourceVersion &&
        d.fingerprint === resolution.fingerprint,
    )
    if (
      index >= 0 &&
      resolution.tier !== 'review' &&
      resolution.tier !== 'investigation'
    )
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
  const individuals: IndividualAudit[] = await Promise.all(
    decisions.map(async (decision, index) => {
      return {
        id: `place-address:${decision.placeId}:${index}`,
        operation: placeAddressAnalysisRule.declaration.id,
        basis: 'fixture',
        outcome: 'applied',
        summary: `Reviewed Place Address: ${decision.resolution}.`,
        reason: decision.reason,
        definition,
        fixture: await retainCurationReference(store, decision),
        record: {
          id: decision.placeId,
          names: decision.address?.values.map(v => v.formattedAddress) ?? [],
          parents: [],
        },
        context: JSON.parse(JSON.stringify(decision)) as JsonRecord,
      }
    }),
  )
  const reviewCount = counts.review ?? 0
  const guards: AuditGuard[] = [
    {
      id: 'place-address-review',
      summary:
        'Every Place Address identity must be resolved or explicitly deferred without a link.',
      consequence: 'block-ingestion',
      status: reviewCount ? 'failed' : 'passed',
      checked: total,
      failed: reviewCount,
      reason: reviewCount
        ? `${reviewCount} Place Address identities require explicit review.`
        : 'All analysed Place Address identities are resolved or retained as non-blocking investigations without links.',
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
        {
          type: 'place-address-decisions',
          document: {
            decisions: input.addresses.fixture.decisions.filter(
              decision =>
                observedPlaces.has(decision.placeId) &&
                decision.sourceRelease <= input.addresses.sourceVersion,
            ),
          },
          arrayKey: 'decisions',
        },
        ...(unreviewed.length
          ? [
              {
                type: 'place-address-unreviewed-cases',
                document: {
                  placeReleaseId: input.addresses.placeReleaseId,
                  addressSnapshotId: input.addresses.addressSnapshotId,
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
  if (input.identityPath) {
    const counts: Record<string, number> = {}
    let total = 0
    const entries = []
    for await (const place of readStagedJsonLines<NormalisedPlace>(
      input.identityPath,
    )) {
      const identity = place.sources.placeIdentity
      if (!identity || identity.id !== place.id || identity.sourceId !== place.raw.id)
        throw new Error(`Missing Place identity evidence ${place.id}.`)
      entries.push(identity)
      counts[identity.reason] = (counts[identity.reason] ?? 0) + 1
      total++
    }
    if (!input.identityLedger)
      throw new Error('Place identity audit requires staged identity evidence.')
    const ledgerText = await readFile(input.identityLedger.path, 'utf8')
    if (
      createHash('sha256').update(ledgerText).digest('hex') !==
      input.identityLedger.hash
    )
      throw new Error('Place identity ledger hash mismatch.')
    const ledgerRows = ledgerText
      .trim()
      .split('\n')
      .slice(1)
      .map(line => JSON.parse(line))
    if (
      JSON.stringify(ledgerRows) !==
      JSON.stringify([...entries].sort((a, b) => a.sourceId.localeCompare(b.sourceId)))
    )
      throw new Error('Place identity audit differs from staged identity evidence.')
    const { path: _path, ...ledgerReference } = input.identityLedger
    rules.push({
      declaration: placeIdentityDeclaration,
      inputs: { 'publisher-places': total },
      outputs: { 'canonical-places': total },
      recordsAffected: total,
      decisions: counts,
      fixtures: [
        {
          type: 'place-identity-decisions',
          document: { basis: 'automatic', ledger: ledgerReference, entries },
          arrayKey: 'entries',
        },
      ],
    })
  }
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
    scope: { stage: 'assembly', ownerId: input.snapshotId },
    ...input,
    rules,
    individuals,
    guards,
    ...(input.staged ? { apiFields } : {}),
  })
}
