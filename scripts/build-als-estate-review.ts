import { readFile, writeFile } from 'node:fs/promises'

const audit = JSON.parse(
  await readFile('.local/hkgov-dpo/address3d-audit.json', 'utf8'),
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
const names = [
  ...new Set<string>(
    audit.reports.flatMap((r: any) => r.estates2d.map((e: any) => e.name)),
  ),
].sort()
const latest = audit.reports.at(-1)
const estates = names.map(name => {
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
    name,
    firstSourceRelease: releases[0].release,
    lastSourceRelease: releases.at(-1).release,
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
  version: 1,
  latestSourceRelease: latest.release,
  sourceReleaseCount: audit.reports.length,
  note: 'Machine-generated audit inventory. Current Housing Authority names corroborate candidate premises; they do not approve historical ownership, derive parent ranges, or partition units. Only reviewed relationships in hkgov-dpo-address-hierarchies.json authorise consolidation.',
  estates,
  unnamed3dPremises: latest.groups.filter((g: any) => !g.estate),
}
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
