import { open, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { NormalisedPlace } from '@repo/core/pipeline/services/places/place'
import {
  matchPlaceIdentities,
  placeIdentityEvidence,
  type PlaceIdentityCandidate,
  type PlaceIdentityDecision,
} from '@repo/core/pipeline/services/places/placeIdentity'
import { writePlaceIdentityLedger } from './placeIdentityLedger'
import { readStagedJsonLines } from './processLocalPlaceSqlUploadPreparation'
import type { PlaceHistoryState } from './processLocalPlaceSqlUploadTypes'
import type { StagedAddressResolution } from './supplementaryPlaceAddress'

export function previousPlaceIdentity(
  state: PlaceHistoryState,
): PlaceIdentityCandidate {
  const row = state.row
  const sources = row.sources as Record<string, unknown> | null
  const retained =
    state.identity ?? (sources?.placeIdentity as PlaceIdentityDecision | undefined)
  if (retained) {
    if (
      retained.id !== row.id ||
      !retained.evidence ||
      retained.sourceId !== retained.evidence.sourceId
    )
      throw new Error(`Invalid retained Place identity ${row.id}.`)
    return { id: row.id, evidence: retained.evidence, release: row.resourceReleaseId }
  }
  return {
    id: row.id,
    release: row.resourceReleaseId,
    evidence: placeIdentityEvidence(
      {
        id: row.id,
        names: {
          primary: state.locales?.[0]?.row.name,
          common: Object.fromEntries(
            (state.locales ?? []).map(x => [x.row.locale, x.row.name]),
          ),
        },
        phones: row.phones,
        socials: row.socials,
        websites: row.websites,
        emails: row.emails,
        sources: Array.isArray(row.sources) ? row.sources : sources?.overture,
        categories: { primary: row.taxonomyPrimary },
        addresses: (Array.isArray(row.addresses) ? row.addresses : []).map(
          freeform => ({ freeform }),
        ),
      },
      Number(row.lng),
      Number(row.lat),
    ),
  }
}

/** Separate publisher staging (including address curation keys) from canonical identity. */
export async function stagePlaceIdentities(input: {
  sourcePath: string
  historyRows: PlaceHistoryState[]
  scope: string
  sourceVersion: string
  releaseRoot: string
  stagingRoot?: string
  predecessorSnapshotId?: string | null
}) {
  const evidence = []
  for await (const place of readStagedJsonLines<NormalisedPlace>(input.sourcePath))
    evidence.push(placeIdentityEvidence(place.raw, place.lng, place.lat))
  const decisions = matchPlaceIdentities(
    evidence,
    input.historyRows.map(previousPlaceIdentity),
    input.scope,
    input.sourceVersion,
  )
  const retainedById = new Map(
    input.historyRows.map(state => [
      state.row.id,
      state.identity ??
        (state.row.sources as { placeIdentity?: PlaceIdentityDecision } | null)
          ?.placeIdentity,
    ]),
  )
  const bySourceId = new Map(
    decisions.map(d => {
      const retained = retainedById.get(d.id)
      // Reuse the recorded assignment when its complete observed evidence is identical.
      // This keeps same-release recovery and unchanged observations idempotent.
      return [
        d.sourceId,
        retained?.model === d.model && isDeepStrictEqual(retained.evidence, d.evidence)
          ? retained
          : d,
      ]
    }),
  )
  const ledger = await writePlaceIdentityLedger({
    ...input,
    stagingRoot: input.stagingRoot ?? resolve(input.releaseRoot, 'identity-ledgers'),
    decisions: [...bySourceId.values()],
  })
  const path = resolve(input.releaseRoot, 'identity-places.jsonl')
  const output = await open(`${path}.tmp`, 'w')
  try {
    for await (const place of readStagedJsonLines<NormalisedPlace>(input.sourcePath)) {
      const decision = bySourceId.get(place.id)
      if (!decision) throw new Error(`Missing prepared Place identity ${place.id}.`)
      await output.writeFile(
        `${JSON.stringify({ ...place, id: decision.id, sources: { ...place.sources, placeIdentity: decision } })}\n`,
      )
    }
    await output.sync()
  } finally {
    await output.close()
  }
  await rename(`${path}.tmp`, path)
  return { path, bySourceId, ledger }
}

export async function* canonicalAddressResolutions(
  path: string,
  decisions: Map<string, PlaceIdentityDecision>,
) {
  for await (const row of readStagedJsonLines<StagedAddressResolution>(path)) {
    const decision = decisions.get(row.placeId)
    if (!decision)
      throw new Error(`Missing Place identity for Address resolution ${row.placeId}.`)
    yield { ...row, placeId: decision.id }
  }
}
