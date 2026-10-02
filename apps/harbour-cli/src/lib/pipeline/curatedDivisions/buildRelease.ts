import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { normaliseDivisionRow } from '@repo/core/pipeline/services/divisions/division'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { divisionCuration } from './curationInputs'
import islandGroups from '../../../../../../fixtures/meta/curations/saanseoi-division/island-groups.json'
import reviewPins from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-review.json'
import releaseInputs from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-release-policy.json'
import type { UploadTarget } from '../../cli/options'
import { applyCuratedBounds, applyRvdMembership } from './listMembership'
import { applyCuratedAreaContract, applyCuratedRecordContract } from './recordContract'
import { buildAdministrativeAreas } from './administrativeAreas'
import { attachProtomapsGeometryRows } from './nativeIngredients'
import { attachIngredientMembership } from './ingredientMembership'
import { monthlyCutoff } from './monthlyInputs'
import { assembleCuratedDivisions } from './assemble'
import { readCuratedDivisionRelease } from './releaseMetadata'
import { curatedContentRows, prepareCuratedReleaseAsset } from './releaseAsset'
import { loadDivisionReviewInputs } from './reviewInputs'
import { readReviewSource, type ReviewArchiveOptions } from './reviewSourceArchives'
import type { CuratedSourceRelease } from './archiveInput'
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** Assembly needs retained archives and editorial files, never a populated serving database. */
export async function buildCuratedDivisionRelease(
  target: UploadTarget,
  options: {
    cohort?: string
    edition?: string
    outputDirectory?: string
    archives?: Omit<ReviewArchiveOptions, 'root'>
  } = {},
) {
  if (target.remote)
    throw Error(
      'Build curated archives locally; upload the resulting ZIPs to any target.',
    )
  const root = resolve(import.meta.dir, '../../../../../..')
  const release = await readCuratedDivisionRelease(root, options.edition)
  const cutoff = monthlyCutoff(release.releaseVersion)
  const sourceReleases: CuratedSourceRelease[] = reviewPins.sourceReleases
  for (const source of sourceReleases)
    if (source.sourceVersion.slice(0, 10) > cutoff)
      throw Error(`Ingredient ${source.releaseCode} is not on or before ${cutoff}.`)
  const archives: ReviewArchiveOptions = {
    root,
    apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
    archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
    ...options.archives,
  }
  const inputs = await loadDivisionReviewInputs({
    ...archives,
    sourceReleases,
    includeAreas: true,
  })
  const { inventory, hierarchy, islands, islandReview } = inputs
  if (options.cohort && options.cohort !== inventory.cohort) return null
  const pin = (dataset: string) => {
    const value = sourceReleases.find(row => row.datasetCode === dataset)
    if (!value) throw Error(`Missing pinned input ${dataset}`)
    return value
  }
  const nativePin = pin('ds-hk-overture-division')
  const territorialPin = pin('ds-hk-overture-division-area')
  const protomapsPin = pin('ds-hk-protomaps-island')
  const landsdPin = pin('ds-hk-hkgov-landsd-division')
  const baseline = new Map(inputs.overture.map(row => [row.id, row]))
  const divisions: any[] = [],
    names: any[] = []
  for (const division of inventory.divisions) {
    const raw = baseline.get(division.id)
    const normalised = raw
      ? normaliseDivisionRow(
          { ...raw, hierarchies: [] },
          { deferHierarchyGuard: true, nativeSourceEvidence: true },
        )
      : null
    const identifiers =
      divisionCuration.matches.entries.find(row => row.divisionId === division.id)
        ?.identifiers ?? {}
    divisions.push({
      ...normalised?.base,
      id: division.id,
      class: division.class,
      category: division.category,
      level: division.level,
      geometry: division.point
        ? JSON.stringify({ type: 'Point', coordinates: division.point })
        : null,
      hierarchies: JSON.stringify(division.hierarchies),
      identifiers: JSON.stringify({
        ...(typeof normalised?.base.identifiers === 'string'
          ? JSON.parse(normalised.base.identifiers)
          : normalised?.base.identifiers),
        ...identifiers,
      }),
    })
    const localised = new Map((normalised?.i18n ?? []).map(row => [row.locale, row]))
    for (const [locale, name] of Object.entries(division.names))
      names.push({
        ...localised.get(locale),
        divisionId: division.id,
        locale,
        name,
        isLocaleInferred: 0,
      })
  }
  const administrativeAreas = buildAdministrativeAreas({
    divisions,
    names,
    overture: inputs.reference.map(row => ({
      sourceRecordId: row.id,
      sourceGeometry: row.geometry,
      properties: {
        divisionId: row.division_id,
        isTerritorial: row.is_territorial,
        isLand: row.is_land,
      },
    })),
    land: inputs.protomaps,
    overtureRelease: territorialPin.releaseCode,
    landRelease: protomapsPin.releaseCode,
  })
  const data = assembleCuratedDivisions({
    divisions,
    names,
    areas: inputs.reference.flatMap(row => {
      const area = normaliseDivisionAreaGeometryRow(row)
      return area ? [area.canonical] : []
    }),
    administrativeAreas,
    hierarchy,
    estimatedAreas: divisionCuration.geometry,
    islands,
    islandReview,
    islandGroups: islandGroups.entries,
    excludedIds: divisionCuration.exclusions.entries.flatMap(entry => [
      entry.divisionId,
      ...('reviewId' in entry && entry.reviewId ? [entry.reviewId] : []),
    ]),
  })
  const landsdNames: any[] = []
  const landsd = inputs.landsd.map(row => {
    for (const locale of ['en', 'zh-hant']) {
      const key = locale === 'en' ? 'nameEn' : 'nameZhHant'
      const official = row.placeNames.find((name: any) => name.status === 'Official')?.[
        key
      ]
      if (official)
        landsdNames.push({
          divisionId: `LANDSD:PLACE_NAME:${row.id}`,
          locale,
          name: official,
          nameAlts: row.placeNames
            .map((name: any) => name[key])
            .filter((name: string) => name && name !== official)
            .join('|'),
        })
    }
    return {
      id: `LANDSD:PLACE_NAME:${row.id}`,
      identifiers: { 'LANDSD:GEO_NAME_ID': String(row.id) },
      geometry: row.geometry,
    }
  })
  const membership = attachIngredientMembership({
    divisions: data.divisions as any[],
    names: data.names as any[],
    landsd,
    landsdNames,
    landsdRelease: landsdPin.releaseCode,
    overtureIds: new Set(inputs.overture.map(row => row.id)),
    overtureRelease: nativePin.releaseCode,
    excludedSourceIds: new Set(
      (divisionCuration.exclusions.landsd as Array<{ sourceRecordId: string }>).map(
        row => row.sourceRecordId,
      ),
    ),
  })
  data.divisions = membership.divisions
  const geometryEvidence = attachProtomapsGeometryRows(
    inputs.protomaps,
    protomapsPin.releaseCode,
    data.areas,
  )
  applyCuratedRecordContract(data.divisions, data.areas)
  applyCuratedAreaContract(data.areas, territorialPin.releaseCode)
  applyCuratedBounds(data.divisions)
  const rvdPin = pin('ds-hk-hkgov-rvd-division')
  const rvd = await readReviewSource(rvdPin, archives)
  applyRvdMembership(
    data.divisions,
    rvd.map(row => ({ sourceRecordId: row.sourceRecordId, properties: row })),
    rvdPin.releaseCode,
  )
  const curationHashes = Object.fromEntries(
    Object.entries(divisionCuration).map(([key, value]) => [key, digest(value)]),
  )
  curationHashes.islandGroups = digest(islandGroups)
  const hash = digest({
    release,
    sourceReleases,
    curationHashes,
    divisions: curatedContentRows(data.divisions),
    names: curatedContentRows(data.names),
    areas: curatedContentRows(data.areas),
  })
  const reportDirectory = options.outputDirectory
    ? resolve(options.outputDirectory)
    : resolve(root, '.local/curated-divisions', hash)
  await mkdir(reportDirectory, { recursive: true })
  await writeFile(
    resolve(reportDirectory, 'inputs.json'),
    JSON.stringify({ release, sourceReleases, curationHashes }, null, 2),
  )
  await writeFile(resolve(reportDirectory, 'assembled.json'), JSON.stringify(data))
  const output = []
  for (const resourceType of ['division', 'divisionArea'] as const) {
    const datasetCode = `ds-hk-saanseoi-${resourceType === 'division' ? 'division' : 'division-area'}`
    output.push(
      await prepareCuratedReleaseAsset({
        directory: reportDirectory,
        datasetCode,
        releaseCode: `${datasetCode.replace(/^ds-/, 'dr-')}-${release.releaseVersion}`,
        resourceType,
        sourceVersion: release.releaseVersion,
        sourceReleases,
        rows: resourceType === 'division' ? data.divisions : data.areas,
        ...(resourceType === 'division' ? { names: data.names } : {}),
        provenance: {
          release,
          releaseInputs,
          curationHashes,
          islandGroups: data.islandGroups,
        },
      }),
    )
  }
  return {
    hash,
    reportDirectory,
    archives: output,
    islands: data.islandCount,
    divisions: data.divisions.length,
    areas: data.areas.length,
    islandGroups: data.islandGroups,
    geometryEvidence,
    membership: {
      landsdMatched: membership.matched,
      landsdUnresolved: membership.unresolved,
    },
  }
}
