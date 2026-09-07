import { readFile, writeFile } from 'node:fs/promises'
import { buildEstateChronology, type SourceReport } from './lib/als-estate-timeline'
import {
  mergerEventKey,
  reviewAlsUnitMergers,
} from './review/lib/als-unit-merger-review'
import { reviewAlsBlockIdentities } from './review/lib/als-block-identities'
import { reviewAlsStructuredBlocks } from './review/lib/als-structured-block-review'
import { reviewEstateGapEvents } from './review/lib/als-estate-gap-review'
import {
  coordinateBackfillPolicyId,
  reviewAlsCoordinateBackfills,
} from './review/lib/als-coordinate-backfill-review'
import estateComponentGaps from '../fixtures/meta/curations/hkgov-dpo-address-estate-component-gaps.json'
import namedPremiseRetentions from '../fixtures/meta/curations/hkgov-dpo-address-named-premise-retentions.json'
import coordinateBackfills from '../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'

const audit = JSON.parse(
  await readFile('.local/hkgov-dpo/address3d-audit.json', 'utf8'),
)
audit.reports.sort((a: SourceReport, b: SourceReport) =>
  a.release.localeCompare(b.release),
)
const blockIdentities = await reviewAlsBlockIdentities(audit.reports)
const structuredBlocks = await reviewAlsStructuredBlocks(audit.reports)
const chronology = buildEstateChronology(audit.reports)
const estateGapReviews = await reviewEstateGapEvents(audit.reports, chronology.estates)
const historyDecisions = JSON.parse(
  await readFile(
    'fixtures/meta/curations/hkgov-dpo-address-history-decisions.json',
    'utf8',
  ),
)
for (const decision of historyDecisions.decisions) {
  const event = chronology.estates
    .find(estate => estate.name === decision.estate)
    ?.timeline.find(event => event.release === decision.release)
  if (!event || event.fingerprint !== decision.expectedFingerprint)
    throw new Error(
      `ALS history decision ${decision.id}: evidence changed; review required`,
    )
}
const reviewedEventSeries = historyDecisions.reviewedEventSeries ?? []
const reviewedEventSeriesKeys = new Set<string>()
for (const series of reviewedEventSeries) {
  for (const expected of series.events) {
    const event = chronology.estates
      .find(estate => estate.name === series.estate)
      ?.timeline.find(event => event.release === expected.release)
    if (!event || event.fingerprint !== expected.expectedFingerprint)
      throw new Error(
        `ALS reviewed event series ${series.id}: evidence changed; review required`,
      )
    reviewedEventSeriesKeys.add(JSON.stringify([series.estate, expected.release]))
  }
}
const mergerPolicy = historyDecisions.automaticPolicies?.find(
  (policy: { id: string; enabled: boolean }) =>
    policy.id === 'same-floor-ab-or-abc-unit-merger' && policy.enabled,
)
const mergerReviews = mergerPolicy
  ? await reviewAlsUnitMergers(audit.reports, chronology.estates)
  : new Map()
const coordinateBackfillPolicy = historyDecisions.automaticPolicies?.find(
  (policy: { id: string; enabled: boolean }) =>
    policy.id === coordinateBackfillPolicyId && policy.enabled,
)
const coordinateBackfillCandidates = coordinateBackfillPolicy
  ? reviewAlsCoordinateBackfills(audit.reports, chronology.estates)
  : new Map()
const generatedCoordinateBackfills = [...coordinateBackfillCandidates.values()].flat()
const manualCoordinateBackfills = coordinateBackfills.backfills.filter(
  backfill => backfill.automaticPolicy !== coordinateBackfillPolicyId,
)
const manualCoordinateBackfillKeys = new Set(
  manualCoordinateBackfills.map(backfill =>
    JSON.stringify([
      backfill.estate,
      backfill.csu,
      backfill.enBuildingName,
      backfill.evidenceSourceVersion,
    ]),
  ),
)
const curatedCoordinateBackfills = [
  ...manualCoordinateBackfills,
  ...generatedCoordinateBackfills.filter(
    backfill =>
      !manualCoordinateBackfillKeys.has(
        JSON.stringify([
          backfill.estate,
          backfill.csu,
          backfill.enBuildingName,
          backfill.evidenceSourceVersion,
        ]),
      ),
  ),
].sort((a, b) => a.id.localeCompare(b.id))
const coordinateBackfillReviews = new Map<string, unknown>()
for (const [key, candidates] of coordinateBackfillCandidates) {
  const supplied = curatedCoordinateBackfills.filter(
    backfill =>
      backfill.automaticPolicy === coordinateBackfillPolicyId &&
      candidates.some(candidate => candidate.id === backfill.id),
  )
  if (
    supplied.length === candidates.length &&
    candidates.every(candidate =>
      supplied.some(backfill => JSON.stringify(backfill) === JSON.stringify(candidate)),
    )
  )
    coordinateBackfillReviews.set(key, {
      policyId: coordinateBackfillPolicy.id,
      policyRevision: coordinateBackfillPolicy.revision,
      fullyReviewed: true,
      decisions: candidates.map(candidate => candidate.id),
    })
}
const hierarchy = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-hierarchies.json', 'utf8'),
)
const inventoryCorrections = JSON.parse(
  await readFile(
    'fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json',
    'utf8',
  ),
)
const inventoryBackfills = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json', 'utf8'),
)
const addressBackfills = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-2d-backfills.json', 'utf8'),
)
const premiseReconstructions = JSON.parse(
  await readFile(
    'fixtures/meta/curations/hkgov-dpo-address-premise-reconstructions.json',
    'utf8',
  ),
)
const evidence = JSON.parse(
  await readFile('.local/hkgov-dpo/ha-estate-evidence.json', 'utf8'),
)
const normalise = (text: string) =>
  text
    .toUpperCase()
    .replace(/\bHSE\b/g, 'HOUSE')
    .replace(/&AMP;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * HA lists some high/low blocks separately while ALS supplies their shared
 * parent. This corroborates the building family only; it never combines their
 * inventories or establishes section ownership.
 */
function matchesCurrentHaBlock(
  building: string | null | undefined,
  officialBlocksText: string,
) {
  if (!building) return false
  const normalisedBuilding = normalise(building)
  if (officialBlocksText.includes(normalisedBuilding)) return true
  const paired = normalisedBuilding.match(
    /^(?<base>.+?) HOUSE HIGH (?:BLK|BLOCK) & LOW (?:BLK|BLOCK)$/,
  )
  if (!paired?.groups?.base) return false
  const officialBlocks = new Set(officialBlocksText.split('<BR>'))
  return (
    officialBlocks.has(`${paired.groups.base} HIGH BLOCK`) &&
    officialBlocks.has(`${paired.groups.base} LOW BLOCK`)
  )
}
const estateNames = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-estate-names.json', 'utf8'),
)
const profiles = evidence.records.flatMap(
  (record: { url: string; retrievedAt: string; profiles: any[] }) =>
    record.profiles.map(profile => ({
      profile,
      url: record.url,
      retrievedAt: record.retrievedAt,
    })),
)
const latest = audit.reports.at(-1)
const estates = chronology.estates.map(history => {
  const { name } = history
  const releases = audit.reports.filter((r: any) =>
    r.estates2d.some((e: any) => e.name === name),
  )
  const official = profiles.filter(
    (x: any) =>
      normalise(x.profile.name.en) ===
      normalise(
        estateNames.decisions.find((d: any) => d.sourceEnName === name)
          ?.preferredEnName ?? name,
      ),
  )
  const allGroups = latest.groups.filter((g: any) => g.estate === name)
  const groups = allGroups.filter((g: any) => g.unitCount > 0)
  const reasons = new Set<string>(groups.flatMap((g: any) => g.reviewReasons))
  const physical = new Map<string, Set<string>>()
  for (const group of groups) {
    if (!group.building) continue
    const key = normalise(group.building)
    const csus = physical.get(key) ?? new Set<string>()
    csus.add(group.csu)
    physical.set(key, csus)
  }
  if ([...physical.values()].some(csus => csus.size > 1))
    reasons.add('building_name_has_multiple_csu_ids')
  if (groups.length && !official.length)
    reasons.add('estate_not_matched_to_current_ha_directory')
  const officialBlocks = normalise(
    official.map((x: any) => x.profile.blockName?.en ?? '').join('<br>'),
  )
  const buildingReviews = groups.map((group: any) => {
    const matched = matchesCurrentHaBlock(group.building, officialBlocks)
    if (!matched && group.building)
      reasons.add('building_not_matched_to_current_ha_profile')
    return {
      building: group.building || null,
      csu: group.csu,
      occurrenceCount: group.occurrences.length,
      inventoryCount: group.inventoryCount,
      unitCount: group.unitCount,
      currentHaNameCorroborated: Boolean(matched),
      reviewReasons: group.reviewReasons,
      sourceOccurrences: group.occurrences,
    }
  })
  return {
    ...history,
    reviewedEstateComponentGaps: estateComponentGaps.restorations.filter(
      d => d.enEstate.EstateName === name,
    ),
    reviewedBlockIdentities: blockIdentities.decisions.filter(d => d.estate === name),
    automaticStructuredBlockIdentities: structuredBlocks.filter(d => d.estate === name),
    reviewedPremiseReconstructions: premiseReconstructions.reconstructions
      .filter((d: any) => d.estate === name)
      .map(({ releases, evidence, ...decision }: any) => ({
        ...decision,
        sourceVersions: releases.map((r: any) => r.version),
        evidenceSourceVersion: evidence.sourceVersion,
      })),
    reviewedNamedPremiseRetentions: namedPremiseRetentions.retentions.filter(
      d => d.enEstate === name,
    ),
    reviewedEstateNames: estateNames.decisions.filter(
      (d: any) => d.sourceEnName === name,
    ),
    automatic3dParentBlockEnrichment:
      'Exact bilingual block-free 2D parents receive matching BLK/座 components from their unique ALS 3D parent.',
    timeline: history.timeline.map(event => ({
      ...event,
      automaticEstateComponentGapReview: estateGapReviews.get(
        JSON.stringify([name, event.release]),
      ),
      automaticMergerReview: mergerReviews.has(mergerEventKey(name, event.release))
        ? {
            policyId: mergerPolicy.id,
            policyRevision: mergerPolicy.revision,
            ...mergerReviews.get(mergerEventKey(name, event.release)),
          }
        : undefined,
      automaticCoordinateBackfillReview: coordinateBackfillReviews.get(
        JSON.stringify([name, event.release]),
      ),
      reviewStatus:
        historyDecisions.decisions.some(
          (decision: { estate: string; release: string }) =>
            decision.estate === name && decision.release === event.release,
        ) ||
        reviewedEventSeriesKeys.has(JSON.stringify([name, event.release])) ||
        mergerReviews.get(mergerEventKey(name, event.release))?.fullyReviewed ||
        coordinateBackfillReviews.get(JSON.stringify([name, event.release])) ||
        estateGapReviews.has(JSON.stringify([name, event.release]))
          ? 'reviewed'
          : event.reviewStatus,
    })),
    reviewedHistoryDecisions: historyDecisions.decisions.filter(
      (decision: { estate: string }) => decision.estate === name,
    ),
    reviewedHistoricalEventSeries: reviewedEventSeries
      .filter((series: { estate: string }) => series.estate === name)
      .map(({ events, ...series }: any) => ({
        ...series,
        releases: events.map((event: { release: string }) => event.release),
      })),
    reviewedInventoryCorrections: inventoryCorrections.corrections.filter(
      (correction: { estate: string }) => correction.estate === name,
    ),
    reviewedInventoryBackfills: inventoryBackfills.backfills
      .filter((b: { estate: string }) => b.estate === name)
      .map(({ feature, ...decision }: any) => decision),
    reviewedAddressBackfills: addressBackfills.backfills
      .filter(
        (b: any) =>
          b.feature.properties.Address.PremisesAddress.EngPremisesAddress.EngEstate
            .EstateName === name,
      )
      .map(({ feature, ...decision }: any) => decision),
    reviewedHierarchyDecisions: hierarchy.relationships
      .filter((r: any) => r.complex.enName === name && !r.generatedBy)
      .map((r: any) => ({
        id: r.id,
        from: r.sourceVersionFrom,
        to: r.sourceVersionTo,
        buildings: r.buildings.map((b: any) => b.expected.enBuildingName),
        identifiedSourceSections: r.buildings.flatMap((b: any) =>
          (b.derivedSections ?? []).filter((section: any) => section.sourcePremise),
        ),
        reason: r.reason,
      })),
    firstSourceRelease: releases[0]?.release ?? null,
    lastSourceRelease: releases.at(-1)?.release ?? null,
    releaseCount: releases.length,
    latest2dRecords: latest.estates2d.find((e: any) => e.name === name)?.records ?? 0,
    hasPublished3dInventory: groups.length > 0,
    empty3dSourceOccurrences: allGroups
      .filter((g: any) => !g.unitCount)
      .reduce((sum: number, g: any) => sum + g.occurrences.length, 0),
    historical3dSourceReleases: audit.reports
      .filter((r: any) =>
        r.groups.some((g: any) => g.estate === name && g.unitCount > 0),
      )
      .map((r: any) => r.release),
    status: groups.length
      ? reasons.size
        ? 'requires_review'
        : 'source_unique_with_current_ha_name_corroboration'
      : 'no_3d_inventory',
    // A current directory corroborates names, not historical unit ownership.
    externalEvidence: official.map((x: any) => ({
      url: x.url,
      retrievedAt: x.retrievedAt,
      profileId: x.profile.id,
      estateName: x.profile.name,
      blockNames: x.profile.blockName,
      furtherInformation: x.profile.furtherInfo,
    })),
    reviewReasons: [...reasons].sort(),
    buildingReviews,
  }
})
const automaticallyResolved2dHierarchyEstates = new Set(
  historyDecisions.decisions
    .filter(
      (decision: { action?: string }) =>
        decision.action === 'automatic_3d_parent_block_enrichment',
    )
    .map((decision: { estate: string }) => decision.estate),
)
const requiresAdditional2dReview = (estate: { name: string }) =>
  hierarchy.additional2dReview?.includes(estate.name) &&
  !automaticallyResolved2dHierarchyEstates.has(estate.name)
const output = {
  version: 2,
  automaticReviewPolicies: historyDecisions.automaticPolicies ?? [],
  chronologicalDirection: 'earliest_to_latest',
  earliestSourceRelease: audit.reports[0].release,
  latestSourceRelease: latest.release,
  sourceReleaseCount: audit.reports.length,
  inclusionCriteria:
    'Named estates appearing in any retained ALS public-rental-housing 3D file, including empty inventories and estates absent from the latest release. This is source-file membership, not a claim about current tenure. 2D-only names are inventoried separately.',
  note: 'Review earliest baseline then chronological deltas. Timeline fingerprints ignore source feature order, retain occurrence multiplicity, and compare 3D publisher inventory hashes, streets, coordinates and 2D aggregate counts. They do not infer renames or provide a full 2D component diff. Current HA corroboration and latest-only curation never approve historical ownership. Pending decisions require human review; only guarded hierarchy rules affect ingestion.',
  estates,
  reviewQueue: estates
    .filter(
      estate =>
        estate.reviewReasons.length ||
        requiresAdditional2dReview(estate) ||
        estate.timeline?.some(
          event =>
            event.reviewStatus !== 'reviewed' &&
            (event.requiresChangeReview || event.reviewReasons.length),
        ),
    )
    .map(estate => ({
      name: estate.name,
      first3dSourceRelease: estate.first3dSourceRelease,
      firstReviewRelease:
        estate.timeline?.find(
          event =>
            event.reviewStatus !== 'reviewed' &&
            (event.requiresChangeReview || event.reviewReasons.length),
        )?.release ?? estate.first3dSourceRelease,
      status: 'pending',
      reasons: [
        ...new Set([
          ...estate.reviewReasons,
          ...(requiresAdditional2dReview(estate)
            ? ['2d_hierarchy_requires_review']
            : []),
          ...(estate.timeline?.some(
            event => event.reviewStatus !== 'reviewed' && event.requiresChangeReview,
          )
            ? ['historical_changes_require_review']
            : []),
          ...(estate.timeline?.some(
            event => event.reviewStatus !== 'reviewed' && event.reviewReasons.length,
          )
            ? ['historical_source_ambiguity']
            : []),
        ]),
      ],
      existingCurationBounds: hierarchy.relationships
        .filter((r: any) => r.complex.enName === estate.name)
        .map((r: any) => ({
          id: r.id,
          from: r.sourceVersionFrom,
          to: r.sourceVersionTo,
        })),
    }))
    .sort(
      (a, b) =>
        a.first3dSourceRelease.localeCompare(b.first3dSourceRelease) ||
        a.name.localeCompare(b.name),
    ),
  unnamed3dPremises: audit.reports
    .map((r: SourceReport) => ({
      release: r.release,
      groups: r.groups.filter(g => !g.estate),
    }))
    .filter((r: { groups: SourceReport['groups'] }) => r.groups.length),
}
await writeFile(
  'fixtures/meta/curations/hkgov-dpo-address-2d-estate-inventory.json',
  `${JSON.stringify({ version: 1, inclusionCriteria: 'ALS 2D estate names never present in any retained ALS 3D file; outside the public-rental-housing unit review cohort.', estates: chronology.excluded2dOnly }, null, 2)}\n`,
)
await writeFile(
  'fixtures/meta/curations/hkgov-dpo-address-estate-audit.json',
  `${JSON.stringify(output, null, 2)}\n`,
)
await writeFile(
  'fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json',
  `${JSON.stringify(
    {
      version: 1,
      automaticPolicy: coordinateBackfillPolicyId,
      backfills: curatedCoordinateBackfills,
    },
    null,
    2,
  )}\n`,
)
const review = estates.filter(e => e.status === 'requires_review')
console.info(
  JSON.stringify(
    {
      estates: estates.length,
      with3d: estates.filter(e => e.hasPublished3dInventory).length,
      review: review.length,
      no3d: estates.filter(e => e.status === 'no_3d_inventory').length,
      reasons: review.map(e => ({ name: e.name, reasons: e.reviewReasons })),
    },
    null,
    2,
  ),
)
