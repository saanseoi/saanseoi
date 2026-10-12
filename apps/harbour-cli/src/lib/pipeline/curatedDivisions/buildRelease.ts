import { boundaryPatchEvidence } from './boundaryPatchEvidence'
import { scopedExclusions } from '@repo/core/pipeline/services/divisions/curationApplicability'
import { preprocessingContext } from './preprocessingContext'
import { preparationCurationNames } from './curationNames'
import { normaliseAuditedIngredient, finishPreparationRules } from './preparationRules'
import { ProcessingGuardError, type BranchCounts } from '@repo/core/provenance'
import { applyEditorialOwnership } from './editorialOwnership'
import { landsdPlaceNameLocales } from '@repo/core/pipeline/services/sources/landsdPlaceNames'
import {
  releaseCurationDecisions,
  type ReleaseCurationFixtures,
} from './releaseCurations'
import updatePolicy from '../../../../../../fixtures/meta/curations/saanseoi-division/division-update-policy.json'
import { reviewDivisionUpdates, publisherSimplifiedNames } from './updateReview'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { prepareCuratedDivisionRow } from '@repo/core/pipeline/services/divisions/division'
import { normaliseDivisionAreaGeometryRow } from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { divisionCuration, editionGeometry } from './curationInputs'
import islandGroups from '../../../../../../fixtures/meta/curations/saanseoi-division/island-groups.json'
import reviewPins from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-review.json'
import releaseInputs from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-release-policy.json'
import publicationInputs from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-release-inputs.json'
import type { UploadTarget } from '../../cli/options'
import { applyRvdMembership } from './listMembership'
import { applyCuratedAreaContract, applyCuratedRecordContract } from './recordContract'
import { buildAdministrativeAreas } from './administrativeAreas'
import { attachIngredientMembership } from './ingredientMembership'
import { selectMonthlyIngredients } from './monthlyInputs'
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
  const sourceReleases: CuratedSourceRelease[] = selectMonthlyIngredients(
    release.releaseVersion,
    reviewPins.sourceReleases,
    publicationInputs.sourceReleases,
  )
  const archives: ReviewArchiveOptions = {
    root,
    apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
    archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
    ...options.archives,
  }
  const inputs = await loadDivisionReviewInputs({
    ...archives,
    sourceReleases,
    releaseVersion: release.releaseVersion,
    includeAreas: true,
  })
  const { inventory, islands, islandReview } = inputs
  const accepted = await loadDivisionReviewInputs({
    ...archives,
    releaseVersion: release.releaseVersion,
    includeAreas: true,
  })
  // Only explicit publisher Simplified Chinese names qualify for this locale.
  const publisherHans = new Map<string, Set<string>>()
  const applyPublisherHans = (input: typeof inputs) => {
    const names = publisherSimplifiedNames(input.overture)
    for (const division of input.inventory.divisions) {
      delete division.names['zh-hans']
      const name = names.get(division.id)
      if (name) division.names['zh-hans'] = name
    }
    for (const [id, name] of names)
      publisherHans.set(id, new Set([...(publisherHans.get(id) ?? []), name]))
  }
  applyPublisherHans(accepted)
  applyPublisherHans(inputs)
  const review = reviewDivisionUpdates(
    accepted.inventory.divisions,
    inventory.divisions,
    updatePolicy,
    releaseCurationDecisions(
      divisionCuration as unknown as ReleaseCurationFixtures,
      release.releaseVersion,
    ),
  )
  const reviewDirectory = options.outputDirectory
    ? resolve(options.outputDirectory)
    : resolve(root, '.local/curated-divisions/review', release.releaseVersion)
  await mkdir(reviewDirectory, { recursive: true })
  await writeFile(
    resolve(reviewDirectory, 'update-review.json'),
    JSON.stringify(
      {
        edition: release.releaseVersion,
        acceptedPins: accepted.sourceReleases,
        proposedPins: sourceReleases,
        policy: updatePolicy,
        events: review.events,
      },
      null,
      2,
    ),
  )
  if (review.pending.length)
    throw Error(
      `Division updates require ${review.pending.length} individual decisions; see ${resolve(reviewDirectory, 'update-review.json')}. No release archives were produced.`,
    )
  inventory.divisions = review.divisions
  const inventoryIds = new Set(inventory.divisions.map(row => row.id))
  const hierarchy = {
    ...inputs.hierarchy,
    entries: inputs.hierarchy.entries.filter(
      entry =>
        inventoryIds.has(entry.divisionId) ||
        islands.some(island => island.id === entry.divisionId),
    ),
  }
  for (const entry of accepted.hierarchy.entries)
    if (
      inventoryIds.has(entry.divisionId) &&
      !hierarchy.entries.some(current => current.divisionId === entry.divisionId)
    )
      hierarchy.entries.push(entry)
  // Kept identities retain their reviewed geometry even when absent upstream.
  const kept = new Set(
    review.events
      .filter(event => event.field === '$record' && event.status === 'keep')
      .map(event => event.divisionId),
  )
  inputs.reference.push(
    ...accepted.reference.filter((row: any) => kept.has(row.division_id)),
  )
  if (options.cohort && options.cohort !== inventory.cohort) return null
  const pin = (dataset: string, resourceType = 'division') => {
    const value = sourceReleases.find(
      row => row.datasetCode === dataset && row.resourceType === resourceType,
    )
    if (!value) throw Error(`Missing pinned input ${dataset}`)
    return value
  }
  const nativePin = pin('ds-hk-overture-division')
  const territorialPin = pin('ds-hk-overture-division', 'divisionArea')
  const protomapsPin = pin('ds-hk-protomaps-island', 'divisionArea')
  const landsdPin = pin('ds-hk-hkgov-landsd-division')
  const baseline = new Map(
    [...accepted.overture.filter(row => kept.has(row.id)), ...inputs.overture].map(
      row => [row.id, row],
    ),
  )
  const currentOvertureIds = new Set(inputs.overture.map(row => row.id))
  const acceptedOverturePin = accepted.sourceReleases.find(
    pin =>
      pin.datasetCode === 'ds-hk-overture-division' && pin.resourceType === 'division',
  )
  const preparationCounts = new Map<string, BranchCounts>()
  const divisions: any[] = [],
    names: any[] = []
  for (const division of inventory.divisions) {
    const raw = baseline.get(division.id)
    const normalised = raw
      ? prepareCuratedDivisionRow(
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
        ...(raw ? { overture: { divisionId: division.id } } : {}),
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
    land: await readReviewSource(protomapsPin, archives, 'land-mask'),
    overtureRelease: territorialPin.releaseCode,
    landRelease: protomapsPin.releaseCode,
  })
  const data = assembleCuratedDivisions({
    divisions,
    names,
    areas: inputs.reference.flatMap(row => {
      const area = normaliseDivisionAreaGeometryRow(row)
      return area
        ? [
            {
              ...area.canonical,
              sources: {
                overture: [{ dataset: 'ds-hk-overture-division', recordId: row.id }],
              },
            },
          ]
        : []
    }),
    administrativeAreas,
    hierarchy,
    estimatedAreas: editionGeometry(
      new Set([...inventoryIds, ...islands.map(island => island.id)]),
    ),
    islands,
    islandReview,
    islandGroups: islandGroups.entries,
    excludedIds: scopedExclusions(
      divisionCuration.exclusions.entries,
      'result',
      release.releaseVersion,
    ).flatMap(entry => [
      entry.divisionId,
      ...('reviewId' in entry && entry.reviewId ? [entry.reviewId] : []),
    ]),
  })
  const landsdNames: any[] = []
  const landsd = inputs.landsd.map(row => {
    for (const locale of ['en', 'zh-hant'] as const) {
      const labels = landsdPlaceNameLocales(row.placeNames)[locale]!
      if (labels.official)
        landsdNames.push({
          divisionId: `LANDSD:PLACE_NAME:${row.id}`,
          locale,
          name: labels.official,
          nameAlts: labels.alias
            .filter((name: string) => name !== labels.official)
            .join('|'),
        })
    }
    return {
      id: `LANDSD:PLACE_NAME:${row.id}`,
      identifiers: { 'hkgov-landsd': { geoNameId: String(row.id) } },
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
      scopedExclusions(
        divisionCuration.exclusions.entries,
        'landsd',
        release.releaseVersion,
      ).map(row =>
        'sourceRecordId' in row ? String(row.sourceRecordId) : row.divisionId,
      ),
    ),
  })
  data.divisions = membership.divisions
  const geometryEvidence = {
    sourceFeatures: inputs.protomaps.length,
    areasWithSelectedSourceGeometry: data.areas.filter(area => {
      const sources =
        typeof area.sources === 'string' ? JSON.parse(area.sources) : area.sources
      return sources?.protomaps?.some((source: any) =>
        source.contributions?.includes('geometry'),
      )
    }).length,
  }
  applyCuratedRecordContract(data.divisions)
  applyCuratedAreaContract(data.areas)
  const rvdPin = pin('ds-hk-hkgov-rvd-division')
  const rvd = await readReviewSource(rvdPin, archives)
  applyRvdMembership(
    data.divisions,
    rvd.map(row => ({ sourceRecordId: row.sourceRecordId, properties: row })),
    rvdPin.releaseCode,
  )
  data.names = data.names.filter(
    row => row.locale !== 'zh-hans' || publisherHans.get(row.divisionId)?.has(row.name),
  )
  applyEditorialOwnership(data.divisions, data.areas, review.events)
  const curationHashes = Object.fromEntries(
    Object.entries(divisionCuration).map(([key, value]) => [key, digest(value)]),
  )
  curationHashes.islandGroups = digest(islandGroups)
  curationHashes.updatePolicy = digest(updatePolicy)
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
  const preparation = {
    boundaryPatches: boundaryPatchEvidence(divisionCuration, data.areas, data.aliases),
    islandGroups: data.islandGroups,
    recordNames: preparationCurationNames({
      ...inputs,
      definitions: divisionCuration,
      names: data.names,
      aliases: data.aliases,
    }),
    definitions: { ...divisionCuration, islandGroups, updatePolicy },
    inputs: {
      overture: inputs.overture.length,
      landsd: inputs.landsd.length,
      areas: inputs.reference.length,
      islands: inputs.protomaps.length,
    },
    outputs: {
      divisions: data.divisions.length,
      areas: data.areas.length,
      names: data.names.length,
    },
    records: curatedContentRows(data.divisions).map(({ geometry, ...row }) => ({
      ...row,
      geometryHash: digest(geometry),
    })),
    names: curatedContentRows(data.names),
    changes: data.divisions.map(row => {
      const raw = baseline.get(row.id)
      const original = raw ? normaliseAuditedIngredient(raw, preparationCounts) : null
      const fields = [
        'class',
        'category',
        'level',
        'hierarchies',
        'identifiers',
      ] as const
      return {
        ...preprocessingContext(
          row,
          raw,
          currentOvertureIds.has(row.id) ? nativePin : acceptedOverturePin,
        ),
        operation: original ? 'prepare' : 'include',
        fields: Object.fromEntries(
          fields
            .filter(
              field =>
                JSON.stringify(
                  field === 'hierarchies'
                    ? (raw?.hierarchies ?? null)
                    : (original?.base[field] ?? null),
                ) !== JSON.stringify(row[field] ?? null),
            )
            .map(field => [
              field,
              {
                before:
                  field === 'hierarchies'
                    ? (raw?.hierarchies ?? null)
                    : (original?.base[field] ?? null),
                after: row[field] ?? null,
              },
            ]),
        ),
        names: {
          before: original?.i18n ?? [],
          after: data.names.filter(name => name.divisionId === row.id),
        },
      }
    }),
    geometryEvidence,
    updateDecisions: review.events,
    nameAliasAudit: data.nameAliasAudit,
  }
  const rules = finishPreparationRules(preparation, preparationCounts, baseline)
  rules.guards.push(...data.pointGuards)
  if (rules.guards.some(guard => guard.status === 'failed'))
    throw new ProcessingGuardError(
      `Invalid prepared divisions: ${rules.guards
        .filter(guard => guard.status === 'failed')
        .map(guard => `${guard.id}: ${guard.reason}`)
        .join('; ')}`,
      rules.guards,
    )
  const output = []
  for (const resourceType of ['division', 'divisionArea'] as const) {
    const datasetCode = 'ds-hk-saanseoi-division'
    output.push(
      await prepareCuratedReleaseAsset({
        directory: reportDirectory,
        datasetCode,
        releaseCode: `dr-hk-saanseoi-${resourceType === 'division' ? 'division' : 'division-area'}-${release.releaseVersion}`,
        resourceType,
        sourceVersion: release.releaseVersion,
        sourceReleases,
        rows: resourceType === 'division' ? data.divisions : data.areas,
        ...(resourceType === 'division' ? { names: data.names } : {}),
        provenance: {
          release,
          releaseInputs,
          acceptedReviewInputs: accepted.sourceReleases,
          updateDecisions: review.events,
          curationHashes,
          preparation:
            resourceType === 'division' ? { ...preparation, rules } : preparation,
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
