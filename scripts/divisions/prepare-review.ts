import { governmentDistrictCandidates } from './government-review'
import {
  restoreEditorProject,
  editorProjectPurpose,
  type EditorProject,
} from '../../libs/core/src/pipeline/services/divisions/editorCuration'
import { resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadDivisionReviewInputs } from '../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/reviewInputs'
import { buildAdministrativeAreas } from '../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/administrativeAreas'
import { deriveIslandGroupGeometry } from '../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/islandGroupGeometry'
import {
  curateIslands,
  assertIslandCurationReady,
} from '../../apps/harbour-cli/src/lib/pipeline/islands/islandCuration'
import { divisionCuration } from '../../apps/harbour-cli/src/lib/pipeline/curatedDivisions/curationInputs'
import { classifyIslandArea } from '../../libs/db/src/divisionTaxonomy'
import groups from '../../fixtures/meta/curations/saanseoi-division/island-groups.json'

const root = resolve(import.meta.dir, '../..')
const projectPath = resolve(root, '.local/division-review/division-editor-project.json')
let project: EditorProject = {
  schemaVersion: 1,
  purpose: editorProjectPurpose,
  entries: [],
}
try {
  project = JSON.parse(await readFile(projectPath, 'utf8'))
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
const optionsPath = process.env.SAANSEOI_REVIEW_OPTIONS
const options = optionsPath ? JSON.parse(await readFile(optionsPath, 'utf8')) : {}
const inputs = await loadDivisionReviewInputs({
  root,
  includeAreas: true,
  apiBaseUrl: process.env.SAANSEOI_REVIEW_API_URL,
  archiveBaseUrl: process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
  ...options,
})
const nativePin = inputs.sourceReleases.find(
  row => row.datasetCode === 'ds-hk-overture-division-area',
)!
const landPin = inputs.sourceReleases.find(
  row => row.datasetCode === 'ds-hk-protomaps-island',
)!
const names = inputs.inventory.divisions.flatMap(row =>
  Object.entries(row.names).map(([locale, name]) => ({
    divisionId: row.id,
    locale,
    name,
  })),
)
const administrative = buildAdministrativeAreas({
  divisions: inputs.inventory.divisions,
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
  overtureRelease: nativePin.releaseCode,
  landRelease: landPin.releaseCode,
})
const adminIds = new Set(administrative.map(row => row.divisionId))
const reference = {
  type: 'FeatureCollection',
  features: [
    ...inputs.reference
      .filter(row => !adminIds.has(row.division_id))
      .map(row => ({
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          divisionId: row.division_id,
          variant: 'overture',
          sourceAreaId: row.id,
          sourceCohort: nativePin.sourceVersion,
        },
      })),
    ...administrative
      .filter(row => row.isLand && !row.isTerritorial)
      .map(row => ({
        type: 'Feature',
        geometry:
          typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
        properties: {
          divisionId: row.divisionId,
          variant: 'saanseoi',
          sourceAreaId: row.id,
          sourceCohort: nativePin.sourceVersion,
        },
      })),
  ],
}
const curated = curateIslands(inputs.islands, inputs.islandReview)
assertIslandCurationReady(curated)
const islandGeometry = curated.islands.map(row => ({
  id: row.id,
  class:
    divisionCuration.classifications.entries.find(entry => entry.divisionId === row.id)
      ?.class ?? classifyIslandArea(row.areaKm2),
  geometry:
    divisionCuration.geometry.features.find(
      feature => feature.properties.divisionId === row.id,
    )?.geometry ?? row.geometry,
}))
const groupGeometry = deriveIslandGroupGeometry(groups.entries, islandGeometry as never)
reference.features.push(
  ...groupGeometry.map(row => ({
    type: 'Feature',
    geometry: row.geometry,
    properties: {
      divisionId: row.divisionId,
      variant: 'saanseoi',
      sourceAreaId: `island-group:${row.divisionId}`,
      sourceCohort: landPin.sourceVersion,
    },
  })),
)
const drawings = restoreEditorProject(
  {
    ...structuredClone(divisionCuration.geometry),
    cohort: inputs.inventory.cohort,
  } as any,
  project,
)
const output = {
  schemaVersion: 1,
  purpose:
    'Generated editor reference data. Rebuild from pinned archives and purpose-specific curation; do not edit this cache.',
  inventory: inputs.inventory,
  hierarchy: inputs.hierarchy,
  islands: inputs.islands,
  islandReview: inputs.islandReview,
  reference,
  governmentCandidates: await governmentDistrictCandidates(root),
  drawings,
  editorProject: project,
  islandGroups: groupGeometry.map(({ geometry: _, ...row }) => row),
  sourceReleases: inputs.sourceReleases,
}
const path = resolve(root, '.local/division-review/editor.json')
await mkdir(resolve(root, '.local/division-review'), { recursive: true })
await writeFile(path, JSON.stringify(output))
console.log(path)
