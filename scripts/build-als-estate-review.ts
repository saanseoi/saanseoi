import { readFile, writeFile } from 'node:fs/promises'
import { buildEstateChronology, type SourceReport } from './lib/als-estate-timeline'

const audit = JSON.parse(
  await readFile('.local/hkgov-dpo/address3d-audit.json', 'utf8'),
)
audit.reports.sort((a: SourceReport, b: SourceReport) =>
  a.release.localeCompare(b.release),
)
const chronology = buildEstateChronology(audit.reports)
const hierarchy = JSON.parse(
  await readFile('fixtures/meta/curations/hkgov-dpo-address-hierarchies.json', 'utf8'),
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
    (x: any) => normalise(x.profile.name.en) === normalise(name),
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
    const matched = group.building && officialBlocks.includes(normalise(group.building))
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
    reviewedHierarchyDecisions: hierarchy.relationships
      .filter((r: any) => r.complex.enName === name && !r.generatedBy)
      .map((r: any) => ({
        id: r.id,
        from: r.sourceVersionFrom,
        to: r.sourceVersionTo,
        buildings: r.buildings.map((b: any) => b.expected.enBuildingName),
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
const output = {
  version: 2,
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
        hierarchy.additional2dReview?.includes(estate.name) ||
        estate.timeline?.some(
          event => event.requiresChangeReview || event.reviewReasons.length,
        ),
    )
    .map(estate => ({
      name: estate.name,
      first3dSourceRelease: estate.first3dSourceRelease,
      firstReviewRelease:
        estate.timeline?.find(
          event => event.requiresChangeReview || event.reviewReasons.length,
        )?.release ?? estate.first3dSourceRelease,
      status: 'pending',
      reasons: [
        ...new Set([
          ...estate.reviewReasons,
          ...(hierarchy.additional2dReview?.includes(estate.name)
            ? ['2d_hierarchy_requires_review']
            : []),
          ...(estate.timeline?.some(event => event.requiresChangeReview)
            ? ['historical_changes_require_review']
            : []),
          ...(estate.timeline?.some(event => event.reviewReasons.length)
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
