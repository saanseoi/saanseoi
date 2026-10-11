import { renderCoverage } from './coverageSummary'
import { createLayerControls, divisionLayerKey } from './layerControls'
import { reviewedIslandOutlines } from './reviewedIslandOutlines'
import { exportReviewCuration } from '../../../../../libs/core/src/pipeline/services/divisions/editorCuration'
import { upgradeSavedDrawingVariants } from './savedDrawingVariants'
import tseungKwanORestore from './tseungKwanORestore.json'
import {
  reconcileReviewEstimatedAreas,
  mergeReviewEstimatedAreas,
} from '../../../../../libs/core/src/pipeline/services/divisions/reviewEstimatedAreaCuration'
import { classifyIslandArea } from '../../../../../libs/db/src/divisionTaxonomy'
import { cleanIslandGeometries } from './islandCleanup'
import { publishedIslandRows } from './islandPublicationState'
import coverageExclusions from '../../../../../fixtures/meta/curations/saanseoi-division/division-exclusions.json'
import { readGeometryState, writeGeometryState } from './geometryWorkingStorage'
import { alignBoundary, BoundaryAlignmentError } from './boundaryAlignment'
import { removeInteriorRings } from './removeInteriorRings'
import { adoptCurrentGeometryBaseline } from './geometryBaseline'
import { initialiseReviewControls } from './reviewControls'
import { createCleanupTargets } from './cleanupTargets'
import {
  insertBoundaryNodes,
  sameLevelOverlapWarnings,
  calculatePencilRegions,
  commitPencilRegions,
  expandPencilStroke,
  type PencilBoundary,
} from './pencilRegions'
import {
  buildStreetGraph,
  nearestStreetSelection,
  shortestStreetRoute,
  streetDistance,
  STREET_SELECTION_TOLERANCE_METRES,
  type StreetGraph,
  type StreetSnap,
} from './streetRouting'
import { extendPencilPath, pencilPolygon, drawingIntersection } from './pencilGeometry'
import { archiveGeometryBackup, readGeometryBackups } from './geometryBackupStorage'
import {
  createNodeRectangle,
  nodesInRectangle,
  removeSelectedNodes,
} from './nodeSelection'
import { restoreUnsimplifiedCleanupSources } from './cleanupSources'
import { simplifyCleanedGeometries } from './simplificationTools'
import {
  largestPolygonGeometry,
  largestPolygonLabelPoint,
  polygonDisplayLabelData,
} from './polygonDisplayLabels'
import { removeAccidentalDetachedParts } from './detachedPartCleanup'
import {
  cleanEstimatedAreaGeometriesForLevel,
  GeometryCleanupError,
  mergePolygonPart,
  suggestBuiltExtent,
  type CleanupLevel,
  type RoadFeatureCollection,
} from './geometryTools'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { BASEMAP_ATTRIBUTION, createMapStyleFragment } from '@repo/basemap'
import {
  deriveHierarchyPatch,
  containsReviewPoint,
  divisionReviewName,
  reviewAreaBounds,
  validateSaanseoiEstimatedAreas,
  type ReviewInventory,
  type ReviewDivision,
  type ReviewArea,
  type SaanseoiEstimatedAreas,
  type HierarchyPatch,
} from '../../../../../libs/core/src/pipeline/services/divisions/geographicReview'
import type { Point, Position, FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import './style.css'

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id)! as T
const say = (message: string, tone: 'info' | 'error' = 'info') => {
  const status = $('status')
  status.textContent = message
  status.hidden = !message
  status.classList.toggle('status-error', tone === 'error')
  status.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite')
}
const moveButton = document.createElement('button')
moveButton.id = 'move'
moveButton.textContent = 'Move geometry'
moveButton.disabled = true
const removeHolesButton = document.createElement('button')
removeHolesButton.id = 'remove-holes'
removeHolesButton.textContent = 'Fill interior holes'
removeHolesButton.disabled = true
$<HTMLButtonElement>('copy').before(moveButton, removeHolesButton)
const reviewInputs = await fetch('/__division-review/inputs').then(async response => {
  const result = await response.json()
  if (!response.ok) throw new Error(result.error ?? 'Review inputs unavailable')
  return result
})
const inventory: ReviewInventory = reviewInputs.inventory
const islandCurationReview = reviewInputs.islandReview
const excludedIds = new Set(
  coverageExclusions.entries
    .filter(entry => entry.scopes.includes('result'))
    .flatMap(e => [e.divisionId, ...(e.reviewId ? [e.reviewId] : [])]),
)
inventory.divisions = inventory.divisions.filter(d => !excludedIds.has(d.id))
const reference = reviewInputs.reference as FeatureCollection<
  Polygon | MultiPolygon,
  ReviewArea['properties']
>
reference.features = reference.features.filter(
  f => !excludedIds.has(f.properties.divisionId),
)
// Alternatives are opt-in previews, excluded from map coverage and hierarchy.
const governmentCandidates = (reviewInputs.governmentCandidates?.features ??
  []) as typeof reference.features
const geometrySources = () => [...governmentCandidates, ...reference.features]
type IslandReviewRow = {
  id: string
  name: string
  zh?: string
  point: Position
  areaKm2: number
  geometry: Polygon | MultiPolygon | Point
  coverage?: string
  source?: string
  sourceRelease?: string
}
const islandInventoryRows: IslandReviewRow[] = reviewInputs.islands
const islandReviewRows = publishedIslandRows(
  islandInventoryRows,
  islandCurationReview,
).filter(row => !excludedIds.has(row.id))
const drawingHolds = new Map(
  coverageExclusions.entries
    .filter(entry => entry.scopes.includes('result'))
    .flatMap(entry =>
      [
        entry.divisionId,
        ...('reviewId' in entry && entry.reviewId ? [entry.reviewId] : []),
      ].map(id => [id, entry.reason] as const),
    ),
)
const acceptedIslandIds = new Set(islandReviewRows.map(row => row.id))
const islandActions = new Map<string, { id: string; reason?: string }>(
  islandCurationReview.curationPolicy.actions.map(
    (action: { id: string; reason?: string }) => [action.id, action],
  ),
)
const mergedIslandIds = new Set(
  islandCurationReview.curationPolicy.aliasGroups.flatMap(
    (group: { aliasIds: string[] }) => group.aliasIds,
  ),
)
for (const row of islandInventoryRows)
  if (!acceptedIslandIds.has(row.id))
    drawingHolds.set(
      row.id,
      islandActions.get(row.id)?.reason ??
        (mergedIslandIds.has(row.id)
          ? 'Merged island alias; retained for review.'
          : 'Island is not eligible for reviewed coverage.'),
    )
const derivedReferenceIds = new Set(
  inventory.divisions
    .filter(d => d.category === 'administrative' || d.class === 'island_group')
    .map(d => d.id),
)
const prepareEstimatedAreas = (value: SaanseoiEstimatedAreas) => {
  const retainedReferences = new Map<string, ReviewArea>(
    [
      ...((value as any).referenceRecovery ?? []),
      ...value.features.filter(feature =>
        derivedReferenceIds.has(feature.properties.divisionId),
      ),
    ].map((feature: ReviewArea) => [feature.properties.divisionId, feature]),
  )
  return reconcileReviewEstimatedAreas(
    upgradeSavedDrawingVariants({
      ...value,
      cohort: inventory.cohort,
      features: value.features.filter(
        feature => !derivedReferenceIds.has(feature.properties.divisionId),
      ),
      referenceRecovery: [...retainedReferences.values()],
    } as SaanseoiEstimatedAreas),
    inventory,
    drawingHolds,
  )
}
const existingDivisionIds = new Set(
  reference.features.map(f => f.properties.divisionId),
)
const islandReviewDivisions = islandReviewRows.map(
  (row): ReviewDivision => ({
    id: row.id,
    category: 'landform',
    class: classifyIslandArea(row.areaKm2),
    level: null,
    names: { en: row.name, 'zh-hant': row.zh ?? null },
    point: row.point,
    hierarchies: { administrative: [], locality: [], full: [], landform: [] },
  }),
)
inventory.divisions.push(...islandReviewDivisions)
const islandReviewAreas = islandReviewRows.filter(
  (row): row is IslandReviewRow & { geometry: Polygon | MultiPolygon } =>
    row.geometry.type === 'Polygon' || row.geometry.type === 'MultiPolygon',
)
for (const row of islandReviewAreas) existingDivisionIds.add(row.id)
reference.features.push(
  ...islandReviewAreas.map(row => ({
    type: 'Feature' as const,
    id: `island-review:${row.id}`,
    properties: {
      divisionId: row.id,
      variant: 'island-review',
      sourceAreaId: row.id,
      sourceDomain: row.source,
      sourceCohort: row.sourceRelease,
    },
    geometry: row.geometry,
  })),
)
const seed: SaanseoiEstimatedAreas = prepareEstimatedAreas(reviewInputs.drawings)
const publishedIslandReviewAreas = islandReviewAreas
const publishedIslandReference: FeatureCollection<
  Polygon | MultiPolygon,
  ReviewArea['properties']
> = {
  type: 'FeatureCollection',
  features: reference.features.filter(
    feature => feature.properties.variant === 'island-review',
  ),
}
// Keep the persisted namespace stable: drawings, undo, backups and repair markers share it.
const key = `saanseoi-division-stubs:${reviewInputs.storageCohort}`
const retiredIslandDrawingIds = new Set([
  'LANDSD:PLACE_NAME:146',
  'LANDSD:PLACE_NAME:829',
  'LANDSD:PLACE_NAME:1476',
  'ee49a68b-e7f8-4781-9211-38c77e54d64d',
])
const withoutRetiredIslandDrawings = (
  value: SaanseoiEstimatedAreas,
): SaanseoiEstimatedAreas => ({
  ...value,
  features: value.features.filter(
    feature => !retiredIslandDrawingIds.has(feature.properties.divisionId),
  ),
  withheld: value.withheld?.filter(
    item => !retiredIslandDrawingIds.has(item.feature.properties.divisionId),
  ),
})
let estimatedAreas = seed
let startupMessage = ''
let restoredUndo: SaanseoiEstimatedAreas | null = null
try {
  const state = await readGeometryState<SaanseoiEstimatedAreas>(key)
  const saved = state ? JSON.stringify(state.current) : localStorage.getItem(key)
  restoredUndo = state?.undo ?? null
  if (saved) {
    // A browser drawing is authoritative for the same division, while later
    // fixture additions must remain available for review.
    estimatedAreas = prepareEstimatedAreas(
      mergeReviewEstimatedAreas(seed, JSON.parse(saved)),
    )
  }

  // Curated island geometry is published directly. Retire saved editor drawings
  // for those islands and the excluded duplicate Chek Lap Kok macrohood.
  const retiredIslandDrawingsKey = `${key}:retired-island-drawings-2026-09-22`
  if (!localStorage.getItem(retiredIslandDrawingsKey)) {
    const next = withoutRetiredIslandDrawings(estimatedAreas)
    if (
      next.features.length !== estimatedAreas.features.length ||
      next.withheld?.length !== estimatedAreas.withheld?.length
    ) {
      validateSaanseoiEstimatedAreas(next, inventory)
      await writeGeometryState(key, next, null)
      estimatedAreas = next
      restoredUndo = null
      startupMessage =
        'Removed retired island drawing overrides; curated island outlines remain published.'
    }
    localStorage.setItem(retiredIslandDrawingsKey, 'applied')
  }

  // Apply this reviewed drawing once in each browser, retaining all other work.
  const pokFuLamImportKey = `${key}:pok-fu-lam-repaired-2026-09-15`
  if (!localStorage.getItem(pokFuLamImportKey)) {
    const repaired = seed.features.find(
      f => f.properties.divisionId === '96b06474-b337-488e-bb0b-bc166a6a953e',
    )
    if (repaired) {
      const next = {
        ...estimatedAreas,
        features: [
          ...estimatedAreas.features.filter(
            f => f.properties.divisionId !== repaired.properties.divisionId,
          ),
          repaired,
        ],
      }
      validateSaanseoiEstimatedAreas(next, inventory)
      await writeGeometryState(key, next, estimatedAreas)
      localStorage.setItem(pokFuLamImportKey, 'applied')
      estimatedAreas = next
      startupMessage =
        'Imported the repaired Pok Fu Lam estimated area; other saved drawings were retained.'
    }
  }

  // Remove the detached island from the browser-saved Ma Hang drawing once,
  // retaining the largest polygon and every other saved drawing.
  const maHangIslandRemovalKey = `${key}:ma-hang-island-removed-2026-09-16`
  if (!localStorage.getItem(maHangIslandRemovalKey)) {
    const maHangId = 'cc911334-7897-4c13-99a1-89c69677b51a'
    const maHang = estimatedAreas.features.find(
      f => f.properties.divisionId === maHangId,
    )
    if (
      maHang?.geometry.type === 'MultiPolygon' &&
      maHang.geometry.coordinates.length > 1
    ) {
      const repaired = { ...maHang, geometry: largestPolygonGeometry(maHang.geometry) }
      const next = {
        ...estimatedAreas,
        features: estimatedAreas.features.map(feature =>
          feature.properties.divisionId === maHangId ? repaired : feature,
        ),
      }
      validateSaanseoiEstimatedAreas(next, inventory)
      await writeGeometryState(key, next, estimatedAreas)
      localStorage.setItem(maHangIslandRemovalKey, 'applied')
      estimatedAreas = next
      startupMessage = `${startupMessage ? `${startupMessage} ` : ''}Removed the detached island from Ma Hang; other saved drawings were retained.`
    }
  }

  // Remove detached islands from the browser-saved Bluff Head drawing once,
  // retaining the largest polygon and every other saved drawing.
  const bluffHeadIslandRemovalKey = `${key}:bluff-head-islands-removed-2026-09-16`
  if (!localStorage.getItem(bluffHeadIslandRemovalKey)) {
    const bluffHeadId = 'c1a8152b-ebb8-4ac4-92ec-9a1d27bf6421'
    const bluffHead = estimatedAreas.features.find(
      f => f.properties.divisionId === bluffHeadId,
    )
    if (
      bluffHead?.geometry.type === 'MultiPolygon' &&
      bluffHead.geometry.coordinates.length > 1
    ) {
      const repaired = {
        ...bluffHead,
        geometry: largestPolygonGeometry(bluffHead.geometry),
      }
      const next = {
        ...estimatedAreas,
        features: estimatedAreas.features.map(feature =>
          feature.properties.divisionId === bluffHeadId ? repaired : feature,
        ),
      }
      validateSaanseoiEstimatedAreas(next, inventory)
      await writeGeometryState(key, next, estimatedAreas)
      localStorage.setItem(bluffHeadIslandRemovalKey, 'applied')
      estimatedAreas = next
      startupMessage = `${startupMessage ? `${startupMessage} ` : ''}Removed detached islands from Bluff Head; other saved drawings were retained.`
    }
  }

  // Remove accidental offshore fragments once from the current browser work.
  // The full pre-change collection is archived and retained as Undo.
  const detachedPartCleanupKey = `${key}:small-detached-parts-removed-2026-09-17`
  if (!localStorage.getItem(detachedPartCleanupKey)) {
    const result = removeAccidentalDetachedParts(estimatedAreas, inventory)
    if (result.changes.length) {
      validateSaanseoiEstimatedAreas(result.estimatedAreas, inventory)
      await archiveGeometryBackup(key, estimatedAreas)
      await writeGeometryState(key, result.estimatedAreas, estimatedAreas)
      estimatedAreas = result.estimatedAreas
      const removedPartCount = result.changes.reduce(
        (sum, change) => sum + change.removedPartCount,
        0,
      )
      startupMessage = `${startupMessage ? `${startupMessage} ` : ''}Removed ${removedPartCount} tiny detached polygon parts from ${result.changes.length} curated areas; the previous drawings remain in Undo and backup history.`
    }
    localStorage.setItem(detachedPartCleanupKey, 'applied')
  }
  // Restore only Tseung Kwan O from the user's last downloaded fixture, once.
  const tseungKwanORestoreKey = `${key}:tseung-kwan-o-downloaded-restore-2026-09-27`
  if (!localStorage.getItem(tseungKwanORestoreKey)) {
    const restored = structuredClone(tseungKwanORestore) as ReviewArea
    const id = restored.properties.divisionId
    const next: SaanseoiEstimatedAreas = {
      ...estimatedAreas,
      features: estimatedAreas.features.some(f => f.properties.divisionId === id)
        ? estimatedAreas.features.map(f =>
            f.properties.divisionId === id ? restored : f,
          )
        : [...estimatedAreas.features, restored],
    }
    validateSaanseoiEstimatedAreas(next, inventory)
    await archiveGeometryBackup(key, estimatedAreas)
    await writeGeometryState(key, next, estimatedAreas)
    restoredUndo = estimatedAreas
    estimatedAreas = next
    localStorage.setItem(tseungKwanORestoreKey, 'applied')
    startupMessage =
      'Restored Tseung Kwan O from the 26 September download. All other drawings retained; previous state backed up.'
  }
} catch (error) {
  say(
    `Saved work was not loaded: ${String(error)}. Import a valid fixture to recover it.`,
  )
}
let mapReady = false
let selected = ''
let patch: HierarchyPatch | null = null
let vertices: Position[] = []
let markers: maplibregl.Marker[] = []
let corePointMarker: maplibregl.Marker | null = null
let rectangleSelecting = false
let selectedNodeIndices = new Set<number>()
let mode: 'draw' | 'edit' | 'part' | 'move' | 'pencil' | null = null
let editingPencilPath = false
let originalGeometry: Polygon | MultiPolygon | null = null
let movingGeometry: Polygon | MultiPolygon | null = null
let moveOrigin: [number, number] | null = null
let moveHandle: maplibregl.Marker | null = null
let lineDragStart: [number, number] | null = null
let lineDragGeometry: Polygon | MultiPolygon | null = null
type AdjoinNode = {
  sourceId: string
  sourceName: string
  ringIndex: number
  vertexIndex: number
  position: Position
}
let adjoinMode: 'boundary' | 'street' | null = null
let adjoinSelection: AdjoinNode[] = []
let streetSelection: StreetSnap[] = []
let adjoinMarkers: maplibregl.Marker[] = []
let roadCentrelinesPromise: Promise<RoadFeatureCollection> | null = null
let streetGraphPromise: Promise<StreetGraph> | null = null
let altPanActive = false
let altPanResetTimer: ReturnType<typeof setTimeout> | null = null
let vertexHistory: Position[][] = []
let vertexHistoryIndex = -1
let moveHistory: (Polygon | MultiPolygon)[] = []
let moveHistoryIndex = -1
let cleanupBackup: SaanseoiEstimatedAreas | null = null
try {
  const savedBackup = restoredUndo
    ? JSON.stringify(restoredUndo)
    : localStorage.getItem(`${key}:before-topology-cleanup`)
  if (savedBackup) {
    const candidate = prepareEstimatedAreas(JSON.parse(savedBackup))
    cleanupBackup = candidate
  }
} catch {
  /* An invalid backup must not replace the current working geometry. */
}
let cleanupBusy = false
let cleanupDiagnostic: FeatureCollection<Point> | null = null
let simplificationPreview: SaanseoiEstimatedAreas | null = null
type SimplificationDisplay = 'detailed' | 'simplified' | 'compare'
let simplificationDisplay: SimplificationDisplay = 'detailed'
const roadCentrelinesUrl = '/__division-review/assets/road-centrelines.geojson'
async function loadRoadCentrelines() {
  if (!roadCentrelinesPromise) {
    roadCentrelinesPromise = fetch(roadCentrelinesUrl).then(response => {
      if (!response.ok)
        throw new Error(
          'Road centreline data is unavailable. Generate the local OSM highway export first.',
        )
      return response.json() as Promise<RoadFeatureCollection>
    })
  }
  return roadCentrelinesPromise
}
async function loadStreetGraph() {
  if (!streetGraphPromise)
    streetGraphPromise = loadRoadCentrelines().then(buildStreetGraph)
  return streetGraphPromise
}
const pencilTools = document.createElement('section')
pencilTools.className = 'panel'
pencilTools.hidden = true
pencilTools.setAttribute('aria-label', 'Pencil drawing controls')
pencilTools.style.cssText =
  'position:absolute;top:16px;left:340px;right:340px;z-index:8;padding:12px;max-width:560px'
const pencilHelp = document.createElement('p')
pencilHelp.textContent =
  'Draw along roads · Ctrl for straight lines. Click the first node to close and save automatically.'
pencilHelp.style.cssText = 'margin:0 0 8px;font-size:12px'
const pencilActions = document.createElement('div')
pencilActions.className = 'buttons'
for (const [label, action] of [
  ['Undo segment', () => undo()],
  ['Edit points', () => editPencilPoints()],
  [
    'Download strokes',
    () =>
      download('pencil-strokes.geojson', {
        type: 'FeatureCollection',
        features: [
          ...[...pencilStrokes, vertices]
            .filter(s => s.length > 1)
            .map(coordinates => ({
              type: 'Feature',
              properties: { divisionId: selected, role: 'stroke' },
              geometry: { type: 'LineString', coordinates },
            })),
          ...(pencilExpansionOriginal
            ? [
                {
                  type: 'Feature',
                  properties: { divisionId: selected, role: 'expansion-original' },
                  geometry: pencilExpansionOriginal,
                },
              ]
            : []),
          ...pencilBoundaries()
            .filter(b => b.id !== selected)
            .map(b => ({
              type: 'Feature',
              properties: { divisionId: b.id, name: b.name, role: 'neighbour' },
              geometry: b.geometry,
            })),
        ],
      }),
  ],
  ['Cancel pencil', () => cancel()],
] as const) {
  const button = document.createElement('button')
  button.textContent = label
  button.onclick = action
  pencilActions.append(button)
}
pencilTools.append(pencilHelp, pencilActions)
document.body.append(pencilTools)
let pencilExpansion = false
let pencilExpansionOriginal: Polygon | MultiPolygon | null = null
let pencilStrokes: Position[][] = []
let pencilReview = false
let pencilRegions: Polygon[] = []
const selectedPencilRegions = new Set<number>()
let pencilHistory: Array<{ strokes: Position[][]; vertices: Position[] }> = []
let pencilHistoryIndex = -1
function rememberPencil() {
  pencilHistory = pencilHistory.slice(0, pencilHistoryIndex + 1)
  pencilHistory.push(structuredClone({ strokes: pencilStrokes, vertices }))
  pencilHistoryIndex = pencilHistory.length - 1
}
function editPencilPoints() {
  if (mode !== 'pencil' || pencilSaving || vertices.length < 2) {
    say('Draw at least two points first.')
    return
  }
  clearPencilPreview()
  pencilReview = false
  refreshPencilRegions()
  editingPencilPath = pencilExpansion
  if (
    !pencilExpansion &&
    vertices.length > 2 &&
    JSON.stringify(vertices[0]) === JSON.stringify(vertices.at(-1))
  )
    vertices.pop()
  mode = pencilExpansion ? 'edit' : 'draw'
  originalGeometry = null
  pencilTools.hidden = true
  resetNodeSelection()
  nodeSelectionControls.hidden = false
  vertexHistory = [structuredClone(vertices)]
  vertexHistoryIndex = 0
  map.boxZoom.disable()
  $('draw-help').textContent =
    'Edit pencil points: drag to move, Ctrl/Cmd-click to delete, or select a rectangle of nodes. Shift-click adds a node to the nearest segment. Finish applies the drawing; Cancel leaves saved areas unchanged.'
  updateDraft()
  say('Pencil draft retained. Edit its points, then Finish to apply it.')
}
function reportDrawingError(error: unknown, prefix = '') {
  const detail = error instanceof Error ? error.message : String(error)
  if (/self.intersect|crossings|invalid/i.test(detail)) {
    const position = drawingIntersection(vertices, !pencilExpansion)
    if (position) {
      source('pencil-junctions')?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: position },
          },
        ],
      })
      map.flyTo({
        center: position as [number, number],
        zoom: Math.max(map.getZoom(), 17),
      })
    }
  }
  say(`${prefix}${detail}`)
}
async function finishEditedPencil() {
  mode = 'pencil'
  await tryPencilExpansion(true)
  if (mode === 'pencil') {
    mode = 'edit'
    pencilReview = false
  }
}
function pencilBoundaries(): PencilBoundary[] {
  const level = byId.get(selected)?.level
  const areas = new Map(reference.features.map(f => [f.properties.divisionId, f]))
  for (const f of estimatedAreas.features) areas.set(f.properties.divisionId, f)
  return [...areas.values()]
    .filter(f => byId.get(f.properties.divisionId)?.level === level)
    .map(f => ({
      id: f.properties.divisionId,
      name: byId.get(f.properties.divisionId)
        ? divisionReviewName(byId.get(f.properties.divisionId)!)
        : f.properties.divisionId,
      geometry: f.geometry,
    }))
}
function refreshPencilRegions() {
  if (map.getSource('pencil-regions'))
    source('pencil-regions').setData({
      type: 'FeatureCollection',
      features: pencilReview
        ? pencilRegions.map((geometry, index) => ({
            type: 'Feature',
            properties: { index, selected: selectedPencilRegions.has(index) },
            geometry,
          }))
        : [],
    })
}
function calculatePencilNetwork() {
  if (pencilExpansion) {
    void tryPencilExpansion(false)
    return
  }
  const strokes = [...pencilStrokes, vertices].filter(s => s.length > 1)
  selectedPencilRegions.clear()
  if (!strokes.length) {
    pencilRegions = []
    source('pencil-junctions')?.setData({ type: 'FeatureCollection', features: [] })
    return
  }
  const result = calculatePencilRegions(strokes, pencilBoundaries())
  pencilRegions = result.regions
  source('pencil-junctions')?.setData({
    type: 'FeatureCollection',
    features: result.intersections.map(coordinates => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates },
    })),
  })
}
function reviewPencilRegions() {
  if (pencilSaving || mode !== 'pencil') return
  if (pencilExpansion) {
    void tryPencilExpansion(true)
    return
  }
  try {
    const geometry = pencilPolygon(vertices)
    pencilRegions = [geometry]
    selectedPencilRegions.clear()
    selectedPencilRegions.add(0)
    pencilReview = true
    clearPencilPreview()
    void finishPencil()
  } catch (e) {
    reportDrawingError(e, 'Cannot form area: ')
  }
}
function closePencilStroke(straight: boolean) {
  if (pencilSaving || !vertices.length) return
  try {
    vertices = pencilCandidate(vertices[0]!, straight, true)
    rememberPencil()
    clearPencilPreview()
    updateDraft()
    reviewPencilRegions()
  } catch (e) {
    reportDrawingError(e)
  }
}
let pencilGraph: StreetGraph | null = null
let pencilSaving = false
let pencilTimer: ReturnType<typeof setTimeout> | null = null
let pencilPointer: { position: Position; straight: boolean } | null = null
function clearPencilPreview() {
  if (pencilTimer) clearTimeout(pencilTimer)
  pencilTimer = null
  if (map.getSource('pencil-preview'))
    source('pencil-preview').setData({ type: 'FeatureCollection', features: [] })
}
function pencilCandidate(target: Position, straight: boolean, closing = false) {
  return extendPencilPath(
    vertices,
    target,
    straight,
    p =>
      pencilGraph ? (nearestStreetSelection(p, pencilGraph)?.position ?? null) : null,
    (a, b) => (pencilGraph ? shortestStreetRoute(pencilGraph, a, b) : null),
    closing,
  )
}
function pencilClosing(position: Position) {
  return (
    !pencilExpansion &&
    vertices.length >= 3 &&
    map
      .project(vertices[0]! as [number, number])
      .dist(map.project(position as [number, number])) <= 12
  )
}
function previewPencil(position: Position, straight: boolean) {
  if (mode !== 'pencil' || pencilSaving || pencilReview) return
  pencilPointer = { position, straight }
  let coordinates: Position[],
    error = ''
  try {
    const closing = pencilClosing(position)
    const next = pencilCandidate(closing ? vertices[0]! : position, straight, closing)
    coordinates = next.slice(Math.max(0, vertices.length - 1))
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
    coordinates = vertices.length ? [vertices.at(-1)!, position] : [position, position]
  }
  source('pencil-preview').setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { valid: !error },
        geometry: { type: 'LineString', coordinates },
      },
    ],
  })
  if (!vertices.length)
    say(
      error ||
        `Pencil · ${straight ? 'straight line (Ctrl)' : 'road centreline'} · click to add this segment; click the first node to close. Undo removes the last segment.`,
    )
}
function pencilTap(position: Position, straight: boolean) {
  if (pencilSaving || pencilReview) return
  if (pencilClosing(position)) {
    closePencilStroke(straight)
    return
  }
  try {
    const next = pencilCandidate(position, straight)
    const added = next.length - vertices.length
    vertices = next
    rememberPencil()
    clearPencilPreview()
    updateDraft()
    if (pencilExpansion) {
      void tryPencilExpansion(true)
      return
    }
    calculatePencilNetwork()
    refreshPencilRegions()
    say(
      `Road pencil · ${straight ? 'Ctrl: straight segment' : 'road-centreline segment'} · ${added} vertices added; ${vertices.length} total. Click the first node to close and save automatically.`,
    )
  } catch (e) {
    say(e instanceof Error ? e.message : String(e))
  }
}
async function startPencil(expand = false) {
  if (mode || cleanupBusy) {
    say('Finish or cancel the current operation first.')
    return
  }
  pencilExpansion = expand
  pencilExpansionOriginal = expand
    ? structuredClone(pencilBoundaries().find(b => b.id === selected)?.geometry ?? null)
    : null
  if (expand && !pencilExpansionOriginal) {
    say('Select a division with an existing polygon to expand.')
    return
  }
  layerVisibility.show(layerKey(byId.get(selected)!))
  updateLayerFilters()
  pencilStrokes = []
  pencilReview = false
  pencilRegions = []
  selectedPencilRegions.clear()
  pencilHistory = []
  pencilHistoryIndex = -1
  start('pencil')
  pencilHelp.textContent = expand
    ? 'EXPAND AREA · Draw out across the current boundary and return at a second point. The stroke replaces the old boundary section, including narrow leftover strips. Crossed loops resolve to the main area automatically. Ctrl draws straight lines.'
    : 'Draw along roads · Ctrl for straight lines. Click the first node to close and save automatically.'
  pencilHelp.textContent = `Editing ${divisionReviewName(byId.get(selected)!)} · ${pencilHelp.textContent}`
  for (const button of pencilActions.querySelectorAll('button'))
    button.style.display =
      expand && ['New stroke', 'Review regions'].includes(button.textContent ?? '')
        ? 'none'
        : ''
  source('pencil-expansion-base')?.setData({
    type: 'FeatureCollection',
    features: pencilExpansionOriginal
      ? [{ type: 'Feature', properties: {}, geometry: pencilExpansionOriginal }]
      : [],
  })
  rememberPencil()
  refreshPencilRegions()
  if (mode !== 'pencil') return
  say(
    'Loading road centrelines. Ctrl-click can draw straight segments while they load.',
  )
  try {
    pencilGraph = await loadStreetGraph()
    if (mode === 'pencil' && !vertices.length && !pencilStrokes.length)
      say(
        expand
          ? 'Expansion ready: draw outside the highlighted polygon and back across its boundary. Two intersections add the enclosed outside area automatically; Ctrl draws straight lines.'
          : 'Pencil ready: click along roads; hold Ctrl for straight segments. Click the first node to close and save automatically.',
      )
  } catch (e) {
    if (mode === 'pencil')
      say(`Roads unavailable: ${String(e)}. Ctrl-click still draws straight lines.`)
  }
}
async function tryPencilExpansion(apply: boolean) {
  if (!pencilExpansionOriginal || mode !== 'pencil' || pencilSaving) return
  try {
    const result = expandPencilStroke(pencilExpansionOriginal, vertices)
    source('pencil-junctions').setData({
      type: 'FeatureCollection',
      features: result.intersections.map(coordinates => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates },
      })),
    })
    if (!result.geometry) {
      say(
        result.intersections.length < 2
          ? `Expansion: ${result.intersections.length} of 2 contacts with ${divisionReviewName(byId.get(selected)!)}. Return across its green boundary; grey neighbours do not close this area.`
          : `The stroke has ${result.intersections.length} contacts with the selected area but does not increase its area. The polygon has not changed.`,
        'error',
      )
      return
    }
    if (!apply) return
    pencilRegions =
      result.geometry.type === 'Polygon'
        ? [result.geometry]
        : result.geometry.coordinates.map(coordinates => ({
            type: 'Polygon',
            coordinates,
          }))
    selectedPencilRegions.clear()
    pencilRegions.forEach((_, i) => {
      selectedPencilRegions.add(i)
    })
    pencilReview = true
    await finishPencil()
  } catch (e) {
    reportDrawingError(e, 'Expansion not applied: ')
  }
}
async function finishPencil() {
  if (mode !== 'pencil' || pencilSaving || !pencilReview) return
  try {
    const result = commitPencilRegions(
      [...selectedPencilRegions].map(i => pencilRegions[i]!),
      pencilBoundaries(),
      selected,
    )
    const expanded = pencilExpansion
    const oldDrawing = estimatedAreas.features.find(
      f => f.properties.divisionId === selected,
    )
    const previous = structuredClone(estimatedAreas)
    const nextFeatures = new Map(
      estimatedAreas.features.map(f => [f.properties.divisionId, f]),
    )
    let updatedNeighbours = 0
    for (const boundary of result.boundaries) {
      const existing =
        nextFeatures.get(boundary.id) ??
        reference.features.find(f => f.properties.divisionId === boundary.id)
      if (
        !existing ||
        JSON.stringify(existing.geometry) === JSON.stringify(boundary.geometry)
      )
        continue
      nextFeatures.set(boundary.id, {
        ...existing,
        geometry: boundary.geometry,
        properties: { ...existing.properties, variant: 'saanseoi' },
      })
      updatedNeighbours++
    }
    nextFeatures.set(selected, {
      type: 'Feature',
      id: `saanseoi:${selected}`,
      geometry: result.geometry,
      properties: estimatedAreaPropertiesWithCorePoint(result.geometry, {
        ...(oldDrawing?.properties ?? {}),
        divisionId: selected,
        variant: 'saanseoi',
        name: divisionReviewName(byId.get(selected)!),
        reviewedAt: new Date().toISOString(),
        geometryOriginalDrawing: structuredClone(
          expanded
            ? (oldDrawing?.properties.geometryOriginalDrawing ??
                pencilExpansionOriginal!)
            : result.geometry,
        ),
        geometryPencilLinework: structuredClone(
          [...pencilStrokes, vertices].filter(s => s.length > 1),
        ),
      }),
    })
    const next: SaanseoiEstimatedAreas = {
      ...estimatedAreas,
      features: [...nextFeatures.values()],
    }
    validateSaanseoiEstimatedAreas(next, inventory)
    pencilSaving = true
    refreshPencilRegions()
    await archiveGeometryBackup(key, previous)
    await commitGeometryOperation(next, previous)
    pencilSaving = false
    cancel()
    refreshCleanupControls()
    if (result.overlaps.length)
      say(
        `Saved ${divisionReviewName(byId.get(selected)!)}. Warning: same-level overlap with ${result.overlaps.map(b => b.name).join(', ')}. Both polygons are marked; Undo restores the previous drawing.`,
      )
    else
      say(
        expanded
          ? `Polygon expanded automatically at boundary intersections. Main polygon retained; stroke replaces the contacted boundary section; ${updatedNeighbours} adjoining boundaries received shared vertices. Undo last operation restores the previous drawing.`
          : `Selected regions saved as a valid polygon; ${updatedNeighbours} adjoining boundaries received shared vertices. Undo last operation restores all affected drawings.`,
      )
  } catch (e) {
    reportDrawingError(e, 'Drawing not saved: ')
  } finally {
    pencilSaving = false
    if (mode === 'pencil') pencilReview = false
    refreshPencilRegions()
  }
}

const byId = new Map(inventory.divisions.map(d => [d.id, d]))
const existingIds = existingDivisionIds
const cleanupControls: Array<{ level: CleanupLevel; id: string; label: string }> = [
  { level: 3, id: 'clean-town', label: 'L3 towns' },
  { level: 4, id: 'clean-level-4', label: 'L4 hoods' },
  { level: 5, id: 'clean-level-5', label: 'L5 villages' },
  { level: 6, id: 'clean-level-6', label: 'L6 areas' },
]
const islandCleanupButton = document.createElement('button')
islandCleanupButton.id = 'clean-islands'
islandCleanupButton.textContent = 'Clip islands to coast'
$('clean-town').parentElement!.append(islandCleanupButton)
const isIsland = (id: string) =>
  ['major_island', 'minor_island', 'islet'].includes(byId.get(id)?.class ?? '')
const cleanupFeature = (id: string) =>
  estimatedAreas.features.find(f => f.properties.divisionId === id) ??
  (isIsland(id)
    ? reference.features.find(f => f.properties.divisionId === id)
    : undefined)
islandCleanupButton.onclick = async () => {
  if (mode || cleanupBusy) return
  cleanupBusy = true
  refreshCleanupControls()
  try {
    const response = await fetch('/__division-review/assets/coastline-land.geojson')
    if (!response.ok) throw Error('Coastline land data unavailable')
    const previous = structuredClone(estimatedAreas)
    const result = cleanIslandGeometries(
      estimatedAreas,
      inventory,
      reference.features,
      await response.json(),
      cleanupSelection,
    )
    if (!result.count) return
    validateSaanseoiEstimatedAreas(result.estimatedAreas, inventory)
    await archiveGeometryBackup(key, previous)
    await commitGeometryOperation(result.estimatedAreas, previous)
    say(
      `Clipped ${result.count} islands to the detailed coastline. Download fixtures to retain the geometry. Undo restores the drawings.`,
    )
  } catch (error) {
    showCleanupError(error, 'island')
  } finally {
    cleanupBusy = false
    refreshCleanupControls()
  }
}
const alignmentControls = document.createElement('div')
alignmentControls.className = 'alignment-controls'
const alignmentTitle = document.createElement('h3')
alignmentTitle.textContent = 'Align across levels'
const alignmentHelp = document.createElement('p')
alignmentHelp.className = 'section-note'
alignmentHelp.textContent =
  'Keep the reference outline fixed. Align the other selected drawings within 5 m, adding shared nodes.'
const alignmentReference = document.createElement('select')
alignmentReference.setAttribute('aria-label', 'Alignment reference')
const alignmentRelation = document.createElement('select')
alignmentRelation.setAttribute('aria-label', 'Alignment relationship')
for (const [value, label] of [
  ['inside', 'Inside reference · exact inclusion'],
  ['neighbour', 'Neighbour · shared boundary'],
]) {
  const option = document.createElement('option')
  option.value = value!
  option.textContent = label!
  alignmentRelation.append(option)
}
const alignmentButton = document.createElement('button')
alignmentButton.textContent = 'Align selected boundaries'
alignmentControls.append(
  alignmentTitle,
  alignmentHelp,
  alignmentReference,
  alignmentRelation,
  alignmentButton,
)
$('clean-town').closest('.control-section')!.append(alignmentControls)
alignmentButton.onclick = async () => {
  if (mode || cleanupBusy) return
  const anchorId = alignmentReference.value
  const selectedIds = new Set(cleanupSelection)
  const anchor = estimatedAreas.features.find(f => f.properties.divisionId === anchorId)
  const targets = estimatedAreas.features.filter(
    f =>
      selectedIds.has(f.properties.divisionId) && f.properties.divisionId !== anchorId,
  )
  if (!anchor || !targets.length) {
    say('Select a reference and at least one other drawn division.')
    return
  }
  cleanupBusy = true
  refreshCleanupControls()
  try {
    const previous = structuredClone(estimatedAreas)
    let referenceGeometry = structuredClone(anchor.geometry)
    const updates = new Map<string, typeof anchor>()
    for (const target of targets) {
      let result: ReturnType<typeof alignBoundary>
      try {
        result = alignBoundary(
          referenceGeometry,
          target.geometry,
          alignmentRelation.value as 'inside' | 'neighbour',
        )
      } catch (error) {
        if (error instanceof BoundaryAlignmentError && error.coordinate)
          showAlignmentFailure(target, error.coordinate)
        const division = byId.get(target.properties.divisionId)
        const label = division
          ? `${divisionReviewName(division)} (${target.properties.divisionId})`
          : target.properties.divisionId
        const detail = error instanceof Error ? error.message : String(error)
        throw Error(`Could not align ${label}: ${detail}`)
      }
      referenceGeometry = result.reference
      updates.set(target.properties.divisionId, {
        ...adoptCurrentGeometryBaseline(target),
        geometry: result.geometry,
      })
    }
    const referenceNodes =
      referenceGeometry.type === 'Polygon'
        ? referenceGeometry.coordinates.flat()
        : referenceGeometry.coordinates.flat(2)
    for (const [id, feature] of updates)
      updates.set(id, {
        ...feature,
        geometry: insertBoundaryNodes(feature.geometry, referenceNodes),
      })
    updates.set(anchorId, {
      ...adoptCurrentGeometryBaseline(anchor),
      geometry: referenceGeometry,
    })
    const next = {
      ...estimatedAreas,
      features: estimatedAreas.features.map(
        f => updates.get(f.properties.divisionId) ?? f,
      ),
    }
    validateSaanseoiEstimatedAreas(next, inventory)
    await archiveGeometryBackup(key, previous)
    await commitGeometryOperation(next, previous)
    say(
      `Aligned ${targets.length} selected divisions to ${divisionReviewName(byId.get(anchorId)!)} across levels. ${alignmentRelation.value === 'inside' ? 'Contained exactly within the reference.' : 'Nearby edges share the reference boundary.'} Undo restores all affected drawings.`,
    )
  } catch (error) {
    say(
      `Alignment not applied: ${error instanceof Error ? error.message : String(error)}`,
      'error',
    )
  } finally {
    cleanupBusy = false
    refreshCleanupControls()
  }
}
const cleanupSelection = new Set<string>()
const cleanupSelectionMode = $<HTMLInputElement>('cleanup-select-mode')
cleanupSelectionMode.onchange = () => refreshList()
$('cleanup-clear-selection').onclick = () => {
  if (cleanupBusy) return
  cleanupSelection.clear()
  refreshList()
}
const handledCleanupEvents = new WeakSet<Event>()
function chooseDivision(id: string, fly = true, event?: Event) {
  if (cleanupBusy) return
  if (cleanupSelectionMode.checked) {
    if (event && handledCleanupEvents.has(event)) return
    if (event) handledCleanupEvents.add(event)
    if (mode) {
      say('Finish or cancel the drawing first.')
      return
    }
    if (
      !cleanupFeature(id) ||
      (!isIsland(id) && ![0, 1, 2, 3, 4, 5, 6].includes(byId.get(id)?.level ?? -1))
    ) {
      say('Choose a drawn division or an island with polygon geometry for cleanup.')
      return
    }
    if (cleanupSelection.has(id)) cleanupSelection.delete(id)
    else cleanupSelection.add(id)
  }
  select(id, fly)
}
const layerVisibility = createLayerControls($('level-toggles'), () => refreshList())
const showPolygonDisplay = $<HTMLInputElement>('show-polygon-display')
function layerKey(division: ReviewDivision) {
  return divisionLayerKey(
    division,
    new Set(estimatedAreas.features.map(f => f.properties.divisionId)),
  )
}
function divisionVisible(division: ReviewDivision) {
  return layerVisibility.has(layerKey(division))
}
function setPolygonDisplayVisibility(visible: boolean) {
  const value = visible ? 'visible' : 'none'
  for (const layer of [
    'polygon-display-fill',
    'polygon-display-line',
    'polygon-display-labels',
    'polygon-display-labels-level-6',
  ]) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', value)
  }
}
showPolygonDisplay.onchange = () =>
  setPolygonDisplayVisibility(showPolygonDisplay.checked)
const islandReviewIds = new Set(publishedIslandReviewAreas.map(row => row.id))
function reviewPoints() {
  const estimatedAreaDivisionIds = new Set(
    estimatedAreas.features.map(f => f.properties.divisionId),
  )
  const reviewedPoints = new Map(
    estimatedAreas.features.flatMap(feature =>
      feature.properties.corePoint
        ? [[feature.properties.divisionId, feature.properties.corePoint] as const]
        : [],
    ),
  )
  return {
    type: 'FeatureCollection',
    features: inventory.divisions.flatMap(d => {
      const point = divisionCorePoint(d.id)
      return point
        ? [
            {
              type: 'Feature' as const,
              id: d.id,
              properties: {
                id: d.id,
                label: divisionReviewName(d),
                level: d.level,
                category: d.category,
                hasArea: existingIds.has(d.id),
                hasSaanseoi: estimatedAreaDivisionIds.has(d.id),
                hasCorePoint: reviewedPoints.has(d.id),
              },
              geometry: { type: 'Point' as const, coordinates: point },
            },
          ]
        : []
    }),
  } as FeatureCollection
}
const polygonDisplayPalette = [
  '#ef476f',
  '#f8961e',
  '#ffd166',
  '#90be6d',
  '#06d6a0',
  '#00b4d8',
  '#118ab2',
  '#4d9de0',
  '#5e60ce',
  '#7b2cbf',
  '#c77dff',
  '#f15bb5',
  '#f94144',
  '#43aa8b',
  '#577590',
  '#00bbf9',
  '#b8de6f',
  '#ff70a6',
]
type PolygonDisplayArea = {
  geometry: Polygon | MultiPolygon
  level: number | null
  label: string
}
function polygonDisplayGroup(level: number | null) {
  return level === null ? 'landform' : String(level)
}
function polygonDisplayColours(areas: Map<string, PolygonDisplayArea>) {
  const groups = new Map<string, Array<{ divisionId: string; label: string }>>()
  for (const [divisionId, area] of areas) {
    const group = polygonDisplayGroup(area.level)
    const entries = groups.get(group) ?? []
    entries.push({ divisionId, label: area.label })
    groups.set(group, entries)
  }
  const colours = new Map<string, string>()
  for (const entries of groups.values()) {
    entries.sort(
      (a, b) =>
        a.label.localeCompare(b.label) || a.divisionId.localeCompare(b.divisionId),
    )
    entries.forEach((entry, index) => {
      colours.set(
        entry.divisionId,
        polygonDisplayPalette[index % polygonDisplayPalette.length]!,
      )
    })
  }
  return colours
}
function polygonDisplayData() {
  const areas = new Map<string, PolygonDisplayArea>()
  for (const feature of reference.features) {
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')
      continue
    const division = byId.get(feature.properties.divisionId)
    areas.set(feature.properties.divisionId, {
      geometry: feature.geometry,
      level: division?.level ?? null,
      label: division ? divisionReviewName(division) : feature.properties.divisionId,
    })
  }
  for (const feature of estimatedAreas.features) {
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')
      continue
    const division = byId.get(feature.properties.divisionId)
    areas.set(feature.properties.divisionId, {
      geometry: feature.geometry,
      level: division?.level ?? null,
      label: division ? divisionReviewName(division) : feature.properties.divisionId,
    })
  }
  const colours = polygonDisplayColours(areas)
  return {
    type: 'FeatureCollection' as const,
    features: [...areas.entries()].map(([divisionId, area]) => ({
      type: 'Feature' as const,
      id: `polygon-display:${divisionId}`,
      properties: {
        divisionId,
        level: area.level,
        label: area.label,
        shade: colours.get(divisionId) ?? '#9fb4bd',
      },
      geometry: area.geometry,
    })),
  }
}
function refreshPolygonDisplaySources() {
  const data = polygonDisplayData()
  source('polygon-display')?.setData(data)
  source('polygon-display-label-points')?.setData(polygonDisplayLabelData(data))
}
function refreshCleanupControls() {
  const selectedReference = alignmentReference.value
  const choices = estimatedAreas.features
    .filter(f => cleanupSelection.has(f.properties.divisionId))
    .sort(
      (a, b) =>
        (byId.get(a.properties.divisionId)?.level ?? 99) -
        (byId.get(b.properties.divisionId)?.level ?? 99),
    )
  alignmentReference.replaceChildren(
    ...choices.map(f => {
      const option = document.createElement('option')
      option.value = f.properties.divisionId
      option.textContent = divisionReviewName(byId.get(f.properties.divisionId)!)
      return option
    }),
  )
  if (choices.some(f => f.properties.divisionId === selectedReference))
    alignmentReference.value = selectedReference
  alignmentButton.disabled = cleanupBusy || Boolean(mode) || choices.length < 2
  alignmentReference.disabled = cleanupBusy || Boolean(mode)
  alignmentRelation.disabled = cleanupBusy || Boolean(mode)

  const chosen = [...cleanupSelection]
    .map(cleanupFeature)
    .filter((f): f is ReviewArea => Boolean(f))
  const islandCount = chosen.filter(f => isIsland(f.properties.divisionId)).length
  islandCleanupButton.textContent = `Clip islands to coast (${islandCount})`
  islandCleanupButton.disabled = cleanupBusy || Boolean(mode) || !islandCount
  $('cleanup-selection-count').textContent = `${chosen.length} selected`
  if (map.getSource('cleanup-selection')) {
    source('cleanup-selection').setData({
      type: 'FeatureCollection',
      features: cleanupSelectionMode.checked ? chosen : [],
    })
    const vertices: FeatureCollection<Point> = {
      type: 'FeatureCollection',
      features: cleanupSelectionMode.checked
        ? chosen.flatMap(f => {
            const rings =
              f.geometry.type === 'Polygon'
                ? f.geometry.coordinates
                : f.geometry.coordinates.flat()
            return rings.flatMap(ring =>
              ring.slice(0, -1).map(coordinates => ({
                type: 'Feature' as const,
                properties: { divisionId: f.properties.divisionId },
                geometry: { type: 'Point' as const, coordinates },
              })),
            )
          })
        : [],
    }
    source('cleanup-selection-nodes').setData(vertices)
  }
  cleanupSelectionMode.disabled = cleanupBusy || Boolean(mode)
  $<HTMLButtonElement>('cleanup-clear-selection').disabled = cleanupBusy
  for (const control of cleanupControls) {
    const button = $<HTMLButtonElement>(control.id)
    const count = estimatedAreas.features.filter(
      feature =>
        byId.get(feature.properties.divisionId)?.level === control.level &&
        cleanupSelection.has(feature.properties.divisionId),
    ).length
    button.textContent = `${control.label} (${count})`
    button.disabled = cleanupBusy || Boolean(mode) || count === 0
  }
  $<HTMLButtonElement>('undo-geometry-cleanup').disabled = cleanupBusy || !cleanupBackup
  $<HTMLButtonElement>('simplify-geometry').disabled = cleanupBusy || Boolean(mode)
  $<HTMLButtonElement>('preview-simplification').disabled = cleanupBusy || Boolean(mode)
}
maplibregl.setWorkerUrl(workerUrl)
const map = new maplibregl.Map({
  container: 'map',
  style: {
    ...createMapStyleFragment('midnight'),
    sources: {
      basemap: {
        type: 'vector',
        url: 'https://tiles.saanseoi.hk/hongkong-latest.json',
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
  },
  center: [114.07, 22.35],
  zoom: 10.4,
  maxZoom: 20,
})
map.setMissingStyleImageResolver(id => {
  if (id !== 'townhall') return
  map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) })
})
map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
const source = (id: string) => map.getSource(id) as maplibregl.GeoJSONSource
function showAlignmentFailure(target: ReviewArea, coordinate: Position) {
  clearCleanupError()
  selected = target.properties.divisionId
  if (map.getLayer('selected-area'))
    map.setFilter('selected-area', ['==', ['get', 'divisionId'], selected])
  refreshList()
  source('cleanup-error').setData({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { label: 'Alignment fault' },
        geometry: { type: 'Point', coordinates: coordinate },
      },
    ],
  })
  map.flyTo({
    center: coordinate as [number, number],
    zoom: Math.max(map.getZoom(), 17),
    padding: { left: 330, right: 335, top: 50, bottom: 140 },
  })
}
function clearCleanupError() {
  cleanupDiagnostic = null
  $<HTMLButtonElement>('download-cleanup-diagnostics').disabled = true
  if (map.getSource('cleanup-error'))
    source('cleanup-error').setData({ type: 'FeatureCollection', features: [] })
}
function showCleanupError(error: unknown, label: string) {
  if (!(error instanceof GeometryCleanupError)) {
    clearCleanupError()
    const detail = error instanceof Error ? error.message : String(error)
    say(
      `${label} could not complete: ${detail}${error instanceof Error && error.name === 'QuotaExceededError' ? ' Browser storage is full. Download fixtures to preserve your work.' : ''}`,
    )
    return
  }
  const contextual = error instanceof GeometryCleanupError ? error : null
  const division = contextual ? byId.get(contextual.divisionId) : undefined
  const divisionLabel = contextual
    ? division
      ? `${divisionReviewName(division)} (${contextual.divisionId})`
      : (contextual.contextLabel ?? contextual.divisionId)
    : 'the coastline/coverage geometry'
  const coordinates = contextual?.coordinates ?? []
  if (contextual) {
    selected = contextual.divisionId
    if (map.getLayer('selected-area'))
      map.setFilter('selected-area', ['==', ['get', 'divisionId'], selected])
    refreshList()
  }
  cleanupDiagnostic = {
    type: 'FeatureCollection',
    features: coordinates.map((coordinates, index) => ({
      type: 'Feature',
      properties: {
        label: index < 12 ? `${contextual?.category ?? 'Cleanup'} ${index + 1}` : '',
        divisionId: contextual?.divisionId ?? null,
        divisionName: divisionLabel,
        category: contextual?.category ?? 'shared boundary',
        coordinateRole: contextual?.coordinateRole ?? 'failure',
        message: error instanceof Error ? error.message : String(error),
      },
      geometry: { type: 'Point', coordinates },
    })),
  }
  $<HTMLButtonElement>('download-cleanup-diagnostics').disabled = false
  if (map.getSource('cleanup-error')) source('cleanup-error').setData(cleanupDiagnostic)
  if (coordinates.length) {
    const west = Math.min(...coordinates.map(position => position[0]!))
    const east = Math.max(...coordinates.map(position => position[0]!))
    const south = Math.min(...coordinates.map(position => position[1]!))
    const north = Math.max(...coordinates.map(position => position[1]!))
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: { left: 330, right: 335, top: 50, bottom: 140 }, maxZoom: 18 },
    )
  }
  const nodeMessage = coordinates.length
    ? `${coordinates.length} ${contextual?.coordinateRole === 'source boundary' ? 'affected source vertices' : 'failing nodes'} highlighted in red.`
    : 'No node coordinate was returned by the geometry engine.'
  const detail = error instanceof Error ? error.message : String(error)
  say(
    `${label} failed for ${divisionLabel} — ${contextual?.category ?? 'shared boundary'}. ${nodeMessage} ${detail} ${coordinates
      .slice(0, 3)
      .map(p => `[${p.join(', ')}]`)
      .join(
        '; ',
      )}${coordinates.length > 3 ? '… Download diagnostics for every coordinate.' : ''}`,
  )
}
function filtered() {
  const search = $<HTMLInputElement>('search').value.trim().toLowerCase()
  const drawn = new Set(estimatedAreas.features.map(f => f.properties.divisionId))
  const onlyVisible = $<HTMLInputElement>('only-visible-layers').checked
  const missing = $<HTMLInputElement>('missing-area').checked
  return inventory.divisions.filter(
    d =>
      (!search || `${divisionReviewName(d)} ${d.id}`.toLowerCase().includes(search)) &&
      (!onlyVisible ||
        divisionVisible(d) ||
        (d.category === 'administrative' &&
          d.level === 2 &&
          layerVisibility.has('hkgov-censtatd-2024'))) &&
      (!missing || (!existingIds.has(d.id) && !drawn.has(d.id))),
  )
}
function refreshList() {
  const rows = filtered()
  $('results').replaceChildren(
    ...rows.slice(0, 100).map(d => {
      const item = document.createElement('li')
      const b = document.createElement('button')
      b.type = 'button'
      b.className = selected === d.id ? 'active' : ''
      b.onclick = () => chooseDivision(d.id)
      const name = document.createElement('span')
      name.textContent = `${cleanupSelection.has(d.id) ? '☑ ' : cleanupSelectionMode.checked ? '☐ ' : ''}${divisionReviewName(d)}`
      const detail = document.createElement('small')
      detail.textContent = `${d.class} · ${d.level === null ? 'no level' : `level ${d.level}`} · ${estimatedAreas.features.some(f => f.properties.divisionId === d.id) ? 'estimated area' : existingIds.has(d.id) ? (islandReviewIds.has(d.id) ? 'published island area' : 'existing area') : 'point only'}`
      b.append(name, detail)
      item.append(b)
      return item
    }),
  )
  $('result-count').textContent =
    `${rows.length.toLocaleString()} matches${rows.length > 100 ? ' · first 100 shown' : ''}`
  renderCoverage(
    $('coverage'),
    inventory.divisions,
    [...reference.features, ...estimatedAreas.features]
      .filter(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
      .map(f => f.properties.divisionId),
  )
  refreshCleanupControls()
  if (map.getLayer('points')) {
    source('points').setData(reviewPoints())
    updateLayerFilters()
  }
}
let overlapWarningSource: SaanseoiEstimatedAreas | null = null
let overlapWarnings = new Map<string, string[]>()
const overlapNotice = document.createElement('p')
overlapNotice.className = 'overlap-notice'
overlapNotice.hidden = true
$('evidence').after(overlapNotice)
function refreshOverlapWarnings() {
  if (overlapWarningSource !== estimatedAreas) {
    const areas = new Map(reference.features.map(f => [f.properties.divisionId, f]))
    for (const f of estimatedAreas.features) areas.set(f.properties.divisionId, f)
    overlapWarnings = sameLevelOverlapWarnings(
      [...areas].map(([id, f]) => ({
        id,
        name: byId.get(id) ? divisionReviewName(byId.get(id)!) : id,
        level: byId.get(id)?.level ?? null,
        geometry: f.geometry,
      })),
    )
    source('overlap-warnings').setData({
      type: 'FeatureCollection',
      features: [...areas]
        .filter(([id]) => overlapWarnings.has(id))
        .map(([id, f]) => ({
          type: 'Feature',
          properties: { divisionId: id, label: '⚠ Same-level overlap' },
          geometry: f.geometry,
        })),
    })
    overlapWarningSource = estimatedAreas
  }
  const names = overlapWarnings.get(selected)
  overlapNotice.hidden = !names?.length
  overlapNotice.textContent = names?.length
    ? `⚠ Same-level overlap with ${names.join(', ')}`
    : ''
}
function updateLayerFilters() {
  if (!map.getLayer('points')) return
  for (const variant of ['hkgov-censtatd-2024', 'hkgov-had']) {
    for (const kind of ['fill', 'line'])
      map.setLayoutProperty(
        `${variant}-${kind}`,
        'visibility',
        layerVisibility.has(variant) ? 'visible' : 'none',
      )
  }
  refreshOverlapWarnings()
  const visibleIds = new Set(inventory.divisions.filter(divisionVisible).map(d => d.id))
  for (const layer of ['overlap-warning-line', 'overlap-warning-label'])
    map.setFilter(layer, ['in', ['get', 'divisionId'], ['literal', [...visibleIds]]])
  const rowIds = [...visibleIds]
  const areaIds = reference.features
    .filter(
      f =>
        visibleIds.has(f.properties.divisionId) &&
        !islandReviewIds.has(f.properties.divisionId) &&
        !estimatedAreas.features.some(
          d => d.properties.divisionId === f.properties.divisionId,
        ),
    )
    .map(f => f.properties.divisionId)
  const islandOutlines = reviewedIslandOutlines(
    publishedIslandReference,
    estimatedAreas,
  )
  source('published-islands').setData(islandOutlines)
  const publishedIslandIds = islandOutlines.features
    .filter(f => visibleIds.has(f.properties.divisionId))
    .map(f => f.properties.divisionId)
  const estimatedAreaDivisionIds = estimatedAreas.features
    .filter(feature => visibleIds.has(feature.properties.divisionId))
    .map(feature => feature.properties.divisionId)
  const previewIds = new Set(
    simplificationPreview?.features
      .filter(feature => feature.properties.geometrySimplification)
      .map(feature => feature.properties.divisionId) ?? [],
  )
  const detailedEstimatedAreaIds =
    simplificationDisplay === 'simplified'
      ? estimatedAreaDivisionIds.filter(id => !previewIds.has(id))
      : estimatedAreaDivisionIds
  const visiblePreviewIds =
    simplificationDisplay === 'detailed'
      ? []
      : [...previewIds].filter(id => visibleIds.has(id))
  const displayIds = polygonDisplayData()
    .features.filter(f => visibleIds.has(String(f.properties.divisionId)))
    .map(f => String(f.properties.divisionId))
  // Keep the active drawing distinct while allowing coloured inactive areas.
  const activeIds = cleanupSelectionMode.checked
    ? [...cleanupSelection]
    : selected
      ? [selected]
      : []
  const active: maplibregl.ExpressionSpecification = [
    'in',
    ['get', 'divisionId'],
    ['literal', activeIds],
  ]
  const palette = polygonDisplayData().features.flatMap(f => [
    String(f.properties.divisionId),
    String(f.properties.shade),
  ])
  const inactive: maplibregl.ExpressionSpecification = palette.length
    ? [
        'match',
        ['get', 'divisionId'],
        palette[0]!,
        palette[1]!,
        ...palette.slice(2),
        '#8e969c',
      ]
    : ['literal', '#8e969c']
  for (const layer of ['reference-fill', 'saanseoi-fill', 'polygon-display-fill'])
    map.setPaintProperty(layer, 'fill-color', ['case', active, '#39d7aa', inactive])
  for (const layer of ['reference-line', 'saanseoi-line', 'polygon-display-line'])
    map.setPaintProperty(layer, 'line-color', ['case', active, '#65f0c6', inactive])
  map.setPaintProperty('polygon-display-labels', 'text-color', [
    'case',
    active,
    '#baffdf',
    '#fff8dc',
  ])
  map.setFilter('points', ['in', ['get', 'id'], ['literal', rowIds]])
  map.setFilter('labels', [
    'all',
    ['==', ['get', 'id'], selected],
    ['in', ['get', 'id'], ['literal', rowIds]],
  ])
  map.setFilter('reference-fill', ['in', ['get', 'divisionId'], ['literal', areaIds]])
  map.setFilter('reference-line', ['in', ['get', 'divisionId'], ['literal', areaIds]])
  map.setFilter('published-islands-fill', [
    'in',
    ['get', 'divisionId'],
    ['literal', publishedIslandIds],
  ])
  map.setFilter('published-islands-line', [
    'in',
    ['get', 'divisionId'],
    ['literal', publishedIslandIds],
  ])
  map.setFilter('saanseoi-fill', [
    'in',
    ['get', 'divisionId'],
    ['literal', detailedEstimatedAreaIds],
  ])
  map.setFilter('saanseoi-line', [
    'in',
    ['get', 'divisionId'],
    ['literal', detailedEstimatedAreaIds],
  ])
  map.setFilter('selected-area', [
    'all',
    ['==', ['get', 'divisionId'], selected],
    ['in', ['get', 'divisionId'], ['literal', detailedEstimatedAreaIds]],
  ])
  for (const layer of ['simplification-preview-fill', 'simplification-preview-line'])
    map.setFilter(layer, ['in', ['get', 'divisionId'], ['literal', visiblePreviewIds]])
  map.setFilter('polygon-display-fill', [
    'in',
    ['get', 'divisionId'],
    ['literal', displayIds],
  ])
  map.setFilter('polygon-display-line', [
    'in',
    ['get', 'divisionId'],
    ['literal', displayIds],
  ])
  map.setFilter('polygon-display-labels', [
    'in',
    ['get', 'divisionId'],
    ['literal', displayIds],
  ])
  map.setFilter('polygon-display-labels-level-6', [
    'all',
    ['==', ['get', 'level'], 6],
    ['in', ['get', 'divisionId'], ['literal', displayIds]],
  ])
}
let candidatePreview: ReviewArea | null = null
let catalogue: ReviewArea[] = []
void fetch('/__division-review/assets/catalogue.json')
  .then(r => {
    if (!r.ok) throw new Error('Geometry catalogue unavailable')
    return r.json()
  })
  .then(data => {
    catalogue = data
  })
  .catch(() => {
    $<HTMLButtonElement>('catalogue-preview').disabled = true
    $<HTMLInputElement>('catalogue-search').placeholder =
      'Prepare local catalogue data to search'
  })
$('catalogue-search').oninput = () => {
  const term = $<HTMLInputElement>('catalogue-search').value.toLowerCase().trim()
  const results = $<HTMLSelectElement>('catalogue-results')
  results.replaceChildren()
  if (!term) return
  catalogue.forEach((f, i) => {
    const p = f.properties as Record<string, unknown>
    if (String(p.name).toLowerCase().includes(term)) {
      const o = document.createElement('option')
      o.value = String(i)
      o.textContent = `${p.name} · ${p.sourceDomain} · ${p.sourceCohort}`
      results.append(o)
    }
  })
}
function showCandidate(f: ReviewArea) {
  if (!selected || mode) {
    say('Select a division and finish drawing first.')
    return
  }
  candidatePreview = f
  source('geometry-preview').setData({ type: 'FeatureCollection', features: [f] })
  map.setFilter('selected-area', ['==', ['get', 'divisionId'], ''])
  $<HTMLButtonElement>('copy-preview').disabled = false
  moveButton.disabled = !geometryToMove()
  const [w, s, e, n] = reviewAreaBounds(f.geometry)
  map.fitBounds(
    [
      [w, s],
      [e, n],
    ],
    { padding: { left: 330, right: 335, top: 50, bottom: 140 } },
  )
  say(
    'Preview only. Copy preview into an estimated area to save it for the selected division.',
  )
}
$('catalogue-preview').onclick = () => {
  const value = $<HTMLSelectElement>('catalogue-results').value
  if (value) showCandidate(catalogue[Number(value)]!)
}
$('suggest-built').onclick = async () => {
  const id = selected
  const d = byId.get(id)
  if (!d?.point || mode) {
    say('Select a division with a point and finish drawing first.')
    return
  }
  const gap = Number($<HTMLInputElement>('building-gap').value),
    radius = Number($<HTMLInputElement>('building-radius').value)
  if (
    !Number.isFinite(gap) ||
    !Number.isFinite(radius) ||
    gap < 10 ||
    gap > 500 ||
    radius < 100 ||
    radius > 5000
  ) {
    say('Gap must be 10–500 m; radius must be 100–5,000 m.')
    return
  }
  const button = $<HTMLButtonElement>('suggest-built')
  button.disabled = true
  say('Growing a building cluster…')
  try {
    const f = await suggestBuiltExtent(d.point, gap, radius)
    if (selected === id) showCandidate(f as ReviewArea)
  } catch (e) {
    say(String(e))
  } finally {
    button.disabled = false
  }
}
$('copy-preview').onclick = async () => {
  if (!candidatePreview || !selected || mode) return
  const f = structuredClone(candidatePreview)
  f.id = `saanseoi:${selected}`
  f.properties = estimatedAreaPropertiesWithCorePoint(f.geometry, {
    ...f.properties,
    sourceDivisionId: f.properties.divisionId,
    divisionId: selected,
    variant: 'saanseoi',
    copiedFrom: f.properties.variant,
  } as ReviewArea['properties'])
  const next = {
    ...estimatedAreas,
    features: [
      ...estimatedAreas.features.filter(x => x.properties.divisionId !== selected),
      f,
    ],
  }
  try {
    validateSaanseoiEstimatedAreas(next, inventory)
    await persist(next)
    say('Preview saved as an estimated area with source provenance.')
  } catch (e) {
    say(String(e))
  }
}
function geometryOptions(id: string) {
  return geometrySources()
    .map((feature, index) => ({ feature, index }))
    .filter(x => x.feature.properties.divisionId === id)
    .sort((a, b) => {
      const score = (f: typeof a.feature) => {
        const p = f.properties as typeof f.properties & { isTerritorial?: boolean }
        return byId.get(id)?.category === 'administrative'
          ? governmentCandidates.includes(f)
            ? -1
            : p.isTerritorial
              ? 0
              : p.variant === 'hkgov-had'
                ? 1
                : 2
          : 0
      }
      return score(a.feature) - score(b.feature)
    })
}
function fillGeometryOptions(id: string) {
  const input = $<HTMLSelectElement>('geometry-source')
  const previous = input.dataset.division === id ? input.value : ''
  input.replaceChildren(
    ...geometryOptions(id).map(({ feature, index }) => {
      const p = feature.properties as typeof feature.properties & {
        isLand?: boolean
        isTerritorial?: boolean
      }
      const option = document.createElement('option')
      option.value = String(index)
      option.textContent =
        (p as typeof p & { sourceLabel?: string }).sourceLabel ??
        `${p.variant} · ${p.isTerritorial ? 'territorial extent' : p.isLand ? 'land only' : p.variant === 'hkgov-had' ? 'district extent' : p.variant.includes('landclipped') ? 'land clipped' : 'area'}`
      return option
    }),
  )
  input.dataset.division = id
  if ([...input.options].some(o => o.value === previous)) input.value = previous
  else {
    const active = geometryOptions(id).find(
      ({ feature }) => !governmentCandidates.includes(feature),
    )
    if (active) input.value = String(active.index)
  }
  input.disabled = !input.options.length
}
function previewGeometry() {
  candidatePreview = null
  $<HTMLButtonElement>('copy-preview').disabled = true
  const f = geometrySources()[Number($<HTMLSelectElement>('geometry-source').value)]
  if (!f || f.properties.divisionId !== selected || !map.getSource('geometry-preview'))
    return
  source('geometry-preview').setData({ type: 'FeatureCollection', features: [f] })
  map.setFilter('selected-area', ['==', ['get', 'divisionId'], ''])
  if (governmentCandidates.includes(f)) {
    const [w, s, e, n] = reviewAreaBounds(f.geometry)
    map.setPadding({ left: 0, right: 0, top: 0, bottom: 0 })
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: { left: 350, right: 350, top: 60, bottom: 80 },
      },
    )
    say(
      `${f.properties.sourceLabel} · white outline is a review preview. Active areas are unchanged.`,
    )
  } else {
    say(
      'White outline previews the selected source. Copy existing area to replace the saved estimated area.',
    )
  }
}
$('geometry-source').onchange = previewGeometry
function selectedReferenceGeometry(): Polygon | MultiPolygon | null {
  const feature =
    geometrySources()[Number($<HTMLSelectElement>('geometry-source').value)]
  if (
    !feature ||
    feature.properties.divisionId !== selected ||
    !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
  )
    return null
  return structuredClone(feature.geometry)
}
function geometryToEdit(): Polygon | MultiPolygon | null {
  const estimatedArea = estimatedAreas.features.find(
    f => f.properties.divisionId === selected,
  )
  if (
    estimatedArea &&
    ['Polygon', 'MultiPolygon'].includes(estimatedArea.geometry.type)
  )
    return structuredClone(estimatedArea.geometry)
  return selectedReferenceGeometry()
}
function geometryToMove(): Polygon | MultiPolygon | null {
  if (
    candidatePreview &&
    ['Polygon', 'MultiPolygon'].includes(candidatePreview.geometry.type)
  )
    return structuredClone(candidatePreview.geometry)
  const estimatedArea = estimatedAreas.features.find(
    f => f.properties.divisionId === selected,
  )
  if (
    estimatedArea &&
    ['Polygon', 'MultiPolygon'].includes(estimatedArea.geometry.type)
  )
    return structuredClone(estimatedArea.geometry)
  return selectedReferenceGeometry()
}
function geometryAnchor(geometry: Polygon | MultiPolygon): [number, number] {
  const [west, south, east, north] = reviewAreaBounds(geometry)
  return [(west + east) / 2, (south + north) / 2]
}
function adjoiningPolygonFeatures() {
  const features = new Map<string, { geometry: Polygon | MultiPolygon; name: string }>()
  const visible = (divisionId: string) => {
    const division = byId.get(divisionId)
    return !division || divisionVisible(division)
  }
  const focus = geometryToEdit()
  const focusBounds = focus
    ? reviewAreaBounds(focus)
    : byId.get(selected)?.point
      ? ([
          byId.get(selected)!.point![0]!,
          byId.get(selected)!.point![1]!,
          byId.get(selected)!.point![0]!,
          byId.get(selected)!.point![1]!,
        ] as [number, number, number, number])
      : null
  const padding = 0.01
  const nearby = (geometry: Polygon | MultiPolygon) => {
    if (!focusBounds) return true
    const [west, south, east, north] = reviewAreaBounds(geometry)
    return (
      east >= focusBounds[0]! - padding &&
      west <= focusBounds[2]! + padding &&
      north >= focusBounds[1]! - padding &&
      south <= focusBounds[3]! + padding
    )
  }
  for (const feature of reference.features) {
    if (feature.properties.divisionId === selected) continue
    if (!visible(feature.properties.divisionId)) continue
    if (
      (feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon') &&
      nearby(feature.geometry)
    )
      features.set(feature.properties.divisionId, {
        geometry: feature.geometry,
        name: byId.get(feature.properties.divisionId)
          ? divisionReviewName(byId.get(feature.properties.divisionId)!)
          : feature.properties.divisionId,
      })
  }
  for (const feature of estimatedAreas.features) {
    if (feature.properties.divisionId === selected) continue
    if (!visible(feature.properties.divisionId)) continue
    if (
      (feature.geometry.type === 'Polygon' ||
        feature.geometry.type === 'MultiPolygon') &&
      nearby(feature.geometry)
    )
      features.set(feature.properties.divisionId, {
        geometry: feature.geometry,
        name: byId.get(feature.properties.divisionId)
          ? divisionReviewName(byId.get(feature.properties.divisionId)!)
          : feature.properties.divisionId,
      })
  }
  return [...features.entries()]
}
function outerRings(geometry: Polygon | MultiPolygon) {
  return geometry.type === 'Polygon'
    ? [geometry.coordinates[0]!.slice(0, -1)]
    : geometry.coordinates.flatMap(polygon =>
        polygon[0] ? [polygon[0].slice(0, -1)] : [],
      )
}
function adjoiningNodes() {
  const nodes: AdjoinNode[] = []
  adjoiningPolygonFeatures().forEach(([sourceId, feature]) => {
    outerRings(feature.geometry).forEach((ring, ringIndex) => {
      ring.forEach((position, vertexIndex) => {
        nodes.push({
          sourceId,
          sourceName: feature.name,
          ringIndex,
          vertexIndex,
          position,
        })
      })
    })
  })
  return nodes
}
function sameAdjoinRing(a: AdjoinNode, b: AdjoinNode) {
  return a.sourceId === b.sourceId && a.ringIndex === b.ringIndex
}
function ringPathBetween(a: AdjoinNode, b: AdjoinNode) {
  const ring = outerRings(
    adjoiningPolygonFeatures().find(([sourceId]) => sourceId === a.sourceId)![1]
      .geometry,
  )[a.ringIndex]!
  const path = (step: 1 | -1) => {
    const points: Position[] = []
    let index = a.vertexIndex
    for (let count = 0; count <= ring.length; count += 1) {
      points.push([...ring[index]!])
      if (index === b.vertexIndex) return points
      index = (index + step + ring.length) % ring.length
    }
    return points
  }
  const forward = path(1)
  const backward = path(-1)
  const distance = (points: Position[]) =>
    points
      .slice(1)
      .reduce(
        (total, point, index) =>
          total +
          Math.hypot(point[0]! - points[index]![0]!, point[1]! - points[index]![1]!),
        0,
      )
  return distance(forward) <= distance(backward) ? forward : backward
}
function ringIndicesBetween(start: number, end: number, step: 1 | -1, length: number) {
  const indices: number[] = []
  let index = start
  for (let count = 0; count <= length; count += 1) {
    indices.push(index)
    if (index === end) return indices
    index = (index + step + length) % length
  }
  return indices
}
function nearestVertexIndex(position: Position) {
  return vertices.reduce(
    (nearest, candidate, index) =>
      Math.hypot(candidate[0]! - position[0]!, candidate[1]! - position[1]!) <
      Math.hypot(
        vertices[nearest]![0]! - position[0]!,
        vertices[nearest]![1]! - position[1]!,
      )
        ? index
        : nearest,
    0,
  )
}
function replaceEditedBoundary(
  first: Position,
  second: Position,
  sourcePath: Position[],
) {
  const firstIndex = nearestVertexIndex(first)
  const secondIndex = nearestVertexIndex(second)
  if (firstIndex === secondIndex) {
    say('The adjoining nodes must match two different points on the estimated area.')
    return false
  }
  const forward = ringIndicesBetween(firstIndex, secondIndex, 1, vertices.length)
  const backward = ringIndicesBetween(firstIndex, secondIndex, -1, vertices.length)
  const distance = (indices: number[]) =>
    indices.slice(1).reduce((total, index, offset) => {
      const previous = vertices[indices[offset]!]!
      const current = vertices[index]!
      return total + Math.hypot(current[0]! - previous[0]!, current[1]! - previous[1]!)
    }, 0)
  const step: 1 | -1 = distance(forward) <= distance(backward) ? 1 : -1
  const remainder = ringIndicesBetween(secondIndex, firstIndex, step, vertices.length)
    .slice(1, -1)
    .map(index => [...vertices[index]!])
  // The selected adjoining nodes are the endpoints of the replacement
  // sequence. Keeping sourcePath[0] was the missing piece that left the old
  // coarse edge in place when editing an existing estimated area.
  vertices = [...sourcePath.map(position => [...position]), ...remainder]
  return true
}
function clearAdjoinMarkers() {
  adjoinMarkers.forEach(marker => {
    marker.remove()
  })
  adjoinMarkers = []
}
function showStreetMarkers() {
  clearAdjoinMarkers()
  streetSelection.forEach((selection, index) => {
    const element = document.createElement('div')
    element.title = `Street point ${index + 1}`
    element.setAttribute('aria-label', element.title)
    element.style.cssText =
      'width:18px;height:18px;border-radius:50%;background:#ffcb66;border:3px solid #173f4d;box-shadow:0 0 0 2px white;pointer-events:none;z-index:4'
    adjoinMarkers.push(
      new maplibregl.Marker({ element }).setLngLat(selection.position).addTo(map),
    )
  })
}
function applyAdjoinPath(
  sourcePath: Position[],
  first: Position,
  second: Position,
  streetMode: boolean,
) {
  if (mode === 'edit' && !replaceEditedBoundary(first, second, sourcePath)) {
    adjoinSelection = []
    streetSelection = []
    clearAdjoinMarkers()
    return false
  }
  if (mode === 'draw') {
    const last = vertices.at(-1)
    const startsAtLast = last && samePositions([last], [sourcePath[0]!])
    vertices = [
      ...vertices,
      ...sourcePath.slice(startsAtLast ? 1 : 0).map(position => [...position]),
    ]
  }
  adjoinSelection = []
  streetSelection = []
  adjoinMode = null
  clearAdjoinMarkers()
  $('draw-help').textContent =
    mode === 'edit'
      ? 'Click map to add vertices; click a line to insert one. Shift-click anywhere to insert into the nearest segment at your click. Drag nodes to adjust. Ctrl/Cmd-click a node to delete. Ctrl/Cmd-Z undoes the last edit.'
      : 'Click map to add vertices; the shared boundary was appended. Drag nodes to adjust. Ctrl/Cmd-click a node to delete. Ctrl/Cmd-Z undoes the last edit.'
  recordVertexHistory()
  updateDraft()
  say(
    `${streetMode ? 'Adjoined the shortest street route' : 'Adjoined'} with ${vertices.length} boundary nodes. Continue editing the outline, then click Finish.`,
  )
  return true
}
async function handleStreetTap(event: maplibregl.MapMouseEvent) {
  if (mode !== 'edit' || adjoinMode !== 'street') return
  const graph = await loadStreetGraph()
  const snap = nearestStreetSelection([event.lngLat.lng, event.lngLat.lat], graph)
  if (!snap) {
    say(`Tap within ${STREET_SELECTION_TOLERANCE_METRES} m of a street centreline.`)
    return
  }
  if (
    streetSelection.length &&
    streetDistance(streetSelection[0]!.position, snap.position) <= 0.01
  ) {
    say('Tap a different point on the street network.')
    return
  }
  streetSelection = [...streetSelection, snap]
  showStreetMarkers()
  if (streetSelection.length === 1) {
    say('First street point selected. Tap the second point on a street.')
    return
  }
  say('Finding the shortest connected street route…')
  const [first, second] = streetSelection
  const route = shortestStreetRoute(graph, first!.position, second!.position)
  if (!route || route.length < 2) {
    streetSelection = []
    showStreetMarkers()
    say('No connected street route could be found between those points.')
    return
  }
  applyAdjoinPath(route, first!.position, second!.position, true)
}
function showAdjoinMarkers() {
  clearAdjoinMarkers()
  const selectedRing = adjoinSelection[0]
  const bounds = map.getBounds()
  const nodes = adjoiningNodes().filter(
    node =>
      bounds.contains([node.position[0]!, node.position[1]!]) &&
      (!selectedRing || sameAdjoinRing(node, selectedRing)),
  )
  for (const node of nodes) {
    const element = document.createElement('div')
    element.className = 'adjoin-node'
    element.title = `${node.sourceName} boundary node ${node.vertexIndex + 1}`
    element.setAttribute('aria-label', element.title)
    element.style.cssText = `width:16px;height:16px;border-radius:50%;background:${adjoinSelection.some(selection => selection.sourceId === node.sourceId && selection.ringIndex === node.ringIndex && selection.vertexIndex === node.vertexIndex) ? '#ffcb66' : '#b9a2ff'};border:3px solid #173f4d;box-shadow:0 0 0 2px white;cursor:pointer;pointer-events:auto;touch-action:none;user-select:none;z-index:4`
    const marker = new maplibregl.Marker({ element })
      .setLngLat(node.position as [number, number])
      .addTo(map)
    element.addEventListener('mousedown', event => event.stopPropagation())
    element.addEventListener('click', async event => {
      event.preventDefault()
      event.stopPropagation()
      if (!adjoinMode) return
      if (adjoinSelection.length && !sameAdjoinRing(adjoinSelection[0]!, node)) {
        say('Choose the second node from the same adjoining polygon ring.')
        return
      }
      if (
        adjoinSelection.some(
          selection =>
            selection.vertexIndex === node.vertexIndex &&
            sameAdjoinRing(selection, node),
        )
      ) {
        say('Choose a different boundary node.')
        return
      }
      adjoinSelection = [...adjoinSelection, node]
      if (adjoinSelection.length === 1) {
        showAdjoinMarkers()
        say(`First node selected on ${node.sourceName}. Select the second node.`)
        return
      }
      const first = adjoinSelection[0]!
      const second = adjoinSelection[1]!
      const streetMode = adjoinMode === 'street'
      let sourcePath: Position[]
      if (streetMode) {
        say('Finding the shortest connected street route…')
        let route: Position[] | null = null
        try {
          route = shortestStreetRoute(
            await loadStreetGraph(),
            first.position,
            second.position,
          )
        } catch (error) {
          adjoinSelection = []
          showAdjoinMarkers()
          say(`Street route failed: ${String(error)}`)
          return
        }
        if (!route || route.length < 2) {
          adjoinSelection = []
          showAdjoinMarkers()
          say('No connected street route could be found between those points.')
          return
        }
        sourcePath = route
      } else sourcePath = ringPathBetween(first, second)
      applyAdjoinPath(sourcePath, first.position, second.position, streetMode)
    })
    adjoinMarkers.push(marker)
  }
}
function translateGeometry(
  geometry: Polygon | MultiPolygon,
  dx: number,
  dy: number,
): Polygon | MultiPolygon {
  const shifted = structuredClone(geometry)
  const translate = (value: unknown): unknown => {
    if (Array.isArray(value) && typeof value[0] === 'number')
      return [value[0]! + dx, value[1]! + dy, ...value.slice(2)]
    return Array.isArray(value) ? value.map(translate) : value
  }
  shifted.coordinates = translate(shifted.coordinates) as typeof shifted.coordinates
  return shifted
}
function updateMovePreview() {
  if (!movingGeometry || !map.getSource('geometry-preview')) return
  source('geometry-preview').setData({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: movingGeometry }],
  })
}
function restoreEditorPan() {
  if (!altPanActive) return
  altPanActive = false
  if (mode) {
    map.dragPan.disable()
    map.getCanvas().style.cursor = mode === 'move' ? 'grab' : 'crosshair'
  }
}
function scheduleAltPanReset() {
  if (altPanResetTimer !== null) clearTimeout(altPanResetTimer)
  altPanResetTimer = setTimeout(() => {
    altPanResetTimer = null
    restoreEditorPan()
  }, 0)
}
function handleEditorMouseDown(event: maplibregl.MapMouseEvent) {
  if (!mode) return
  if (event.originalEvent.button !== 0 || !event.originalEvent.altKey) {
    map.dragPan.disable()
    return
  }
  altPanActive = true
  map.dragPan.enable()
  map.getCanvas().style.cursor = 'grabbing'
}
function makeMarkerAltPanFriendly(element: HTMLElement, marker: maplibregl.Marker) {
  element.addEventListener('mousedown', event => {
    if (
      !mode ||
      (event as MouseEvent).button !== 0 ||
      (event as MouseEvent).altKey === false
    )
      return
    marker.setDraggable(false)
    document.addEventListener('mouseup', () => marker.setDraggable(true), {
      once: true,
    })
  })
}
function moveLineDrag(event: maplibregl.MapMouseEvent) {
  if (!lineDragStart || !lineDragGeometry || mode !== 'move') return
  movingGeometry = translateGeometry(
    lineDragGeometry,
    event.lngLat.lng - lineDragStart[0],
    event.lngLat.lat - lineDragStart[1],
  )
  updateMovePreview()
  say(
    `Drag the outline to move ${divisionReviewName(byId.get(selected)!)}. Release when aligned.`,
  )
}
function endLineDrag() {
  if (lineDragStart) recordMoveHistory()
  lineDragStart = null
  lineDragGeometry = null
  map.off('mousemove', moveLineDrag)
  map.off('mouseup', endLineDrag)
  if (mode === 'move') map.getCanvas().style.cursor = 'grab'
}
function startLineDrag(event: maplibregl.MapMouseEvent) {
  if (mode !== 'move' || !movingGeometry || lineDragStart || event.originalEvent.altKey)
    return
  event.preventDefault()
  lineDragStart = [event.lngLat.lng, event.lngLat.lat]
  lineDragGeometry = structuredClone(movingGeometry)
  map.getCanvas().style.cursor = 'grabbing'
  map.on('mousemove', moveLineDrag)
  map.on('mouseup', endLineDrag)
}
function divisionCorePoint(id: string): Position | null {
  const estimatedArea = estimatedAreas.features.find(
    feature => feature.properties.divisionId === id,
  )
  const reviewed = estimatedArea?.properties.corePoint
  const source = byId.get(id)?.point
  if (reviewed ?? source) return reviewed ?? source ?? null
  const geometry =
    estimatedArea?.geometry ??
    reference.features.find(feature => feature.properties.divisionId === id)?.geometry
  if (!geometry) return null
  const labelPoint = largestPolygonLabelPoint(geometry)
  if (containsReviewPoint(labelPoint, geometry)) return labelPoint
  return geometry.type === 'Polygon'
    ? (geometry.coordinates[0]?.[0] ?? null)
    : (geometry.coordinates[0]?.[0]?.[0] ?? null)
}
function clearCorePointMarker() {
  corePointMarker?.remove()
  corePointMarker = null
}
function estimatedAreaPropertiesWithCorePoint(
  geometry: Polygon | MultiPolygon,
  properties: ReviewArea['properties'],
) {
  const { corePoint: _previousCorePoint, ...rest } = properties
  const corePoint = divisionCorePoint(properties.divisionId)
  return {
    ...rest,
    ...(corePoint && containsReviewPoint(corePoint, geometry) ? { corePoint } : {}),
  }
}
async function saveCorePoint(id: string, point: Position) {
  const existing = estimatedAreas.features.find(
    feature => feature.properties.divisionId === id,
  )
  const selectedSource =
    geometrySources()[Number($<HTMLSelectElement>('geometry-source').value)]
  const source =
    selectedSource?.properties.divisionId === id
      ? selectedSource
      : reference.features.find(feature => feature.properties.divisionId === id)
  const geometry = structuredClone(existing?.geometry ?? source?.geometry)
  if (!geometry) throw new Error('Draw or copy an area before placing its core marker.')
  if (!containsReviewPoint(point, geometry))
    throw new Error('The core marker must remain inside the division polygon.')
  const properties: ReviewArea['properties'] = existing
    ? { ...existing.properties, corePoint: point, reviewedAt: new Date().toISOString() }
    : {
        divisionId: id,
        variant: 'saanseoi',
        corePoint: point,
        reviewedAt: new Date().toISOString(),
        ...(source?.properties.variant
          ? { copiedFrom: source.properties.variant }
          : {}),
        ...(source?.properties.sourceAreaId
          ? { sourceAreaId: source.properties.sourceAreaId }
          : {}),
      }
  const feature: ReviewArea = {
    type: 'Feature',
    id: `saanseoi:${id}`,
    properties,
    geometry,
  }
  await persist({
    ...estimatedAreas,
    features: [
      ...estimatedAreas.features.filter(
        candidate => candidate.properties.divisionId !== id,
      ),
      feature,
    ],
  })
}
function refreshCorePointMarker() {
  clearCorePointMarker()
  if (!mapReady || mode || !selected) return
  const point = divisionCorePoint(selected)
  if (!point || !geometryToEdit()) return
  const id = selected
  const element = document.createElement('div')
  element.className = 'core-point-marker'
  element.title = `Drag the core marker for ${divisionReviewName(byId.get(id)!)}`
  element.setAttribute('aria-label', element.title)
  corePointMarker = new maplibregl.Marker({ element, draggable: true })
    .setLngLat(point as [number, number])
    .addTo(map)
  makeMarkerAltPanFriendly(element, corePointMarker)
  for (const eventName of ['click', 'dblclick', 'contextmenu'])
    element.addEventListener(eventName, event => event.stopPropagation())
  corePointMarker.on('dragstart', () => {
    element.classList.add('dragging')
    say('Drag the marker to the representative core of this division.')
  })
  corePointMarker.on('dragend', async () => {
    element.classList.remove('dragging')
    const marker = corePointMarker
    if (!marker || selected !== id) return
    const position = marker.getLngLat()
    try {
      await saveCorePoint(id, [position.lng, position.lat])
      say(
        'Core marker saved with the reviewed polygon. Download fixtures to retain it in the repository.',
      )
    } catch (error) {
      const previous = divisionCorePoint(id)
      if (previous) marker.setLngLat(previous as [number, number])
      say(error instanceof Error ? error.message : String(error))
    }
  })
}
function select(id: string, fly = true) {
  if (mode) {
    say('Finish or cancel the current drawing before changing division.')
    return
  }
  clearCleanupError()
  if (map.getSource('geometry-preview'))
    source('geometry-preview').setData({ type: 'FeatureCollection', features: [] })
  candidatePreview = null
  $<HTMLButtonElement>('copy-preview').disabled = true
  selected = id
  fillGeometryOptions(id)
  const d = byId.get(id)!
  $('name').textContent = divisionReviewName(d)
  $('classification').textContent =
    `${d.category} / ${d.class} · ${d.level === null ? 'no level' : `level ${d.level}`}`
  const decision = patch?.entries.find(e => e.divisionId === id)
  $('ancestry').textContent =
    (decision?.hierarchies ?? d.hierarchies).full
      .map(path =>
        [...path]
          .reverse()
          .map(x => x.name || x.id)
          .join(' → '),
      )
      .join(' / ') || 'No stored ancestors'
  const reviewedCorePoint = estimatedAreas.features.find(
    feature => feature.properties.divisionId === id,
  )?.properties.corePoint
  $('evidence').textContent = decision
    ? `${decision.status} · ${decision.evidence.length} polygon matches${decision.competingParentIds.length ? ` · ${decision.competingParentIds.length} overlapping alternatives` : ''}`
    : reviewedCorePoint
      ? 'Reviewed core point. Drag the highlighted marker to adjust it.'
      : d.point
        ? 'Retained source point. Drag the highlighted marker to set the reviewed core.'
        : 'No retained source point; ancestry needs review.'
  const estimatedArea = estimatedAreas.features.find(
    f => f.properties.divisionId === id,
  )
  $<HTMLButtonElement>('draw').disabled = !mapReady
  $<HTMLButtonElement>('pencil').disabled = !mapReady
  $<HTMLButtonElement>('expand-pencil').disabled = !mapReady || !geometryToEdit()
  $<HTMLButtonElement>('edit').textContent = estimatedArea
    ? 'Edit estimated area'
    : 'Edit existing area'
  $<HTMLButtonElement>('edit').disabled = !mapReady || !geometryToEdit()
  moveButton.disabled = !mapReady || !geometryToMove()
  $<HTMLButtonElement>('part').disabled = !mapReady || !estimatedArea
  const polygonParts = estimatedArea
    ? estimatedArea.geometry.type === 'Polygon'
      ? [estimatedArea.geometry.coordinates]
      : estimatedArea.geometry.coordinates
    : []
  removeHolesButton.disabled =
    !mapReady || !estimatedArea || !polygonParts.some(rings => rings.length > 1)
  $<HTMLButtonElement>('adjoin').disabled = !mapReady
  $<HTMLButtonElement>('adjoin-street').disabled = !mapReady || !geometryToEdit()
  $<HTMLButtonElement>('remove').disabled = !mapReady || !estimatedArea
  $<HTMLButtonElement>('copy').disabled = !mapReady || !existingIds.has(id)
  if (derivedReferenceIds.has(id)) {
    for (const control of [
      'draw',
      'pencil',
      'expand-pencil',
      'edit',
      'part',
      'adjoin',
      'adjoin-street',
      'remove',
      'copy',
      'copy-preview',
    ])
      $<HTMLButtonElement>(control).disabled = true
    moveButton.disabled = true
    removeHolesButton.disabled = true
    $('evidence').textContent =
      d.class === 'island_group'
        ? 'Group geometry is generated from its island members.'
        : 'Administrative geometry is loaded from the pinned source archives.'
  }
  const point = divisionCorePoint(id)
  if (fly && point)
    map.flyTo({
      center: point as [number, number],
      zoom: Math.max(map.getZoom(), d.level === 6 ? 15 : 13),
      padding: { left: 330, right: 335, top: 50, bottom: 140 },
    })
  else if (fly) {
    const feature =
      estimatedArea ?? reference.features.find(f => f.properties.divisionId === id)
    if (feature) {
      const [w, s, e, n] = reviewAreaBounds(feature.geometry)
      map.fitBounds(
        [
          [w, s],
          [e, n],
        ],
        { padding: { left: 330, right: 335, top: 50, bottom: 140 } },
      )
    }
  }
  if (map.getLayer('selected-area'))
    map.setFilter('selected-area', ['==', ['get', 'divisionId'], id])
  refreshList()
  refreshCorePointMarker()
}
async function persist(
  next: SaanseoiEstimatedAreas = estimatedAreas,
  preserveCleanupUndo = false,
) {
  validateSaanseoiEstimatedAreas(next, inventory)
  await writeGeometryState(key, next, preserveCleanupUndo ? cleanupBackup : null)
  estimatedAreas = next
  patch = null
  source('estimatedAreas')?.setData(estimatedAreas)
  clearSimplificationPreview()
  refreshPolygonDisplaySources()
  if (!preserveCleanupUndo) {
    cleanupBackup = null
    localStorage.removeItem(`${key}:before-topology-cleanup`)
  }
  refreshList()
  if (selected) select(selected, false)
}
async function cleanLevelEstimatedAreas(level: CleanupLevel) {
  if (mode || cleanupBusy) {
    say('Finish the current operation first.')
    return
  }
  const selectedIds = new Set(cleanupSelection)
  $<HTMLSelectElement>('simplify-level').value = String(level)
  const control = cleanupControls.find(item => item.level === level)!
  const levelEstimatedAreaCount = estimatedAreas.features.filter(
    feature =>
      byId.get(feature.properties.divisionId)?.level === level &&
      selectedIds.has(feature.properties.divisionId),
  ).length
  if (!levelEstimatedAreaCount) {
    say(`There are no ${control.label} to clean.`)
    return
  }
  clearCleanupError()
  cleanupBusy = true
  refreshCleanupControls()
  say(`Loading coastline land for ${levelEstimatedAreaCount} ${control.label}…`)
  try {
    const response = await fetch('/__division-review/assets/coastline-land.geojson')
    if (!response.ok)
      throw new Error(
        'Coastline land data is unavailable. Run the local coastline export first.',
      )
    const land = await response.json()
    const roads = levelEstimatedAreaCount > 1 ? await loadRoadCentrelines() : undefined
    const previous = structuredClone(estimatedAreas)
    // Archive before geometry operations; only remove old local backups after durable storage.
    await archiveGeometryBackup(key, previous)
    const cleanupInventory = {
      ...inventory,
      divisions: inventory.divisions.filter(d => selectedIds.has(d.id)),
    }
    const sourceEstimatedAreas = restoreUnsimplifiedCleanupSources(
      estimatedAreas,
      cleanupInventory,
      [],
      level,
    )
    const result = cleanEstimatedAreaGeometriesForLevel(
      sourceEstimatedAreas,
      inventory,
      land,
      level,
      roads,
      undefined,
      selectedIds,
    )
    if (result.changedCount === 0) {
      say(
        `All ${result.levelCount} ${control.label} already use the validated topology cleanup.`,
      )
      return
    }
    await commitGeometryOperation(result.estimatedAreas, previous)
    if (levelEstimatedAreaCount === 1) {
      say(
        'Clipped the selected division to the detailed coastline. No neighbours required; no simplification. Download fixtures to retain it.',
      )
      return
    }
    say(
      `Cleaned ${result.changedCount} of ${result.levelCount} ${control.label}: shared topology repaired, coastline clipped and coverage validated; ${result.snappedCount} polygons snapped to streets, ${result.addedNodeCount} vertices added across those polygons. Outer edges and junctions stay fixed; shared matches must lie within 5 m. No simplification. Download fixtures to retain it.`,
    )
  } catch (error) {
    showCleanupError(error, control.label)
  } finally {
    cleanupBusy = false
    refreshCleanupControls()
  }
}
async function commitGeometryOperation(
  next: SaanseoiEstimatedAreas,
  previous: SaanseoiEstimatedAreas,
) {
  validateSaanseoiEstimatedAreas(next, inventory)
  await writeGeometryState(key, next, previous)
  cleanupBackup = previous
  estimatedAreas = next
  patch = null
  source('estimatedAreas')?.setData(estimatedAreas)
  clearSimplificationPreview()
  refreshPolygonDisplaySources()
  refreshList()
  if (selected) select(selected, false)
  refreshCleanupControls()
}
async function simplifyLevelEstimatedAreas() {
  if (mode || cleanupBusy) return
  cleanupBusy = true
  refreshCleanupControls()
  try {
    const level = Number($<HTMLSelectElement>('simplify-level').value) as CleanupLevel
    const tolerance = Number($<HTMLInputElement>('simplify-metres').value)
    const previous = structuredClone(estimatedAreas)
    await archiveGeometryBackup(key, previous)
    const next = simplifyCleanedGeometries(
      estimatedAreas,
      inventory,
      level,
      tolerance,
      new Set(cleanupSelection),
    )
    await commitGeometryOperation(next, previous)
    say(
      `Simplified selected L${level} divisions’ shared internal boundaries with ${tolerance} m tolerance. Coastline and coverage preserved. Unsimplified geometry retained for cleanup.`,
    )
  } catch (error) {
    showCleanupError(error, 'Simplification')
  } finally {
    cleanupBusy = false
    refreshCleanupControls()
  }
}
function previewSimplification() {
  if (mode || cleanupBusy) return
  try {
    const level = Number($<HTMLSelectElement>('simplify-level').value) as CleanupLevel
    const tolerance = Number($<HTMLInputElement>('simplify-metres').value)
    simplificationPreview = simplifyCleanedGeometries(
      estimatedAreas,
      inventory,
      level,
      tolerance,
      new Set(cleanupSelection),
    )
    simplificationDisplay = 'compare'
    const display = $<HTMLSelectElement>('simplification-display')
    display.disabled = false
    display.value = simplificationDisplay
    refreshSimplificationPreview()
    say(
      `Previewing simplified selected L${level} divisions at ${tolerance} m. Choose Detailed, Simplified or Compare both; no estimated area has changed.`,
    )
  } catch (error) {
    showCleanupError(error, 'Simplification preview')
  }
}
function refreshSimplificationPreview() {
  const previewFeatures =
    simplificationPreview?.features.filter(
      feature => feature.properties.geometrySimplification,
    ) ?? []
  if (map.getSource('simplification-preview')) {
    source('simplification-preview').setData({
      type: 'FeatureCollection',
      features: previewFeatures,
    })
  }
  const visibility = simplificationDisplay === 'detailed' ? 'none' : 'visible'
  for (const layer of ['simplification-preview-fill', 'simplification-preview-line']) {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visibility)
  }
  updateLayerFilters()
}
function clearSimplificationPreview() {
  simplificationPreview = null
  simplificationDisplay = 'detailed'
  const display = $<HTMLSelectElement>('simplification-display')
  display.value = simplificationDisplay
  display.disabled = true
  refreshSimplificationPreview()
}
async function undoCleanup() {
  if (mode || !cleanupBackup) return
  await persist(cleanupBackup)
  say('Undid the last geometry cleanup.')
}
function samePositions(a: Position[], b: Position[]) {
  return (
    a.length === b.length &&
    a.every(
      (position, index) =>
        position.length === b[index]!.length &&
        position.every(
          (coordinate, coordinateIndex) => coordinate === b[index]![coordinateIndex],
        ),
    )
  )
}
function recordVertexHistory() {
  const snapshot = structuredClone(vertices)
  if (
    vertexHistory[vertexHistoryIndex] &&
    samePositions(vertexHistory[vertexHistoryIndex]!, snapshot)
  )
    return
  vertexHistory = vertexHistory.slice(0, vertexHistoryIndex + 1)
  vertexHistory.push(snapshot)
  vertexHistoryIndex = vertexHistory.length - 1
}
function recordMoveHistory() {
  if (!movingGeometry) return
  const snapshot = structuredClone(movingGeometry)
  const previous = moveHistory[moveHistoryIndex]
  if (previous && JSON.stringify(previous) === JSON.stringify(snapshot)) return
  moveHistory = moveHistory.slice(0, moveHistoryIndex + 1)
  moveHistory.push(snapshot)
  moveHistoryIndex = moveHistory.length - 1
}
function updateDraftPreview() {
  if (map.getLayer('draft-line'))
    map.setPaintProperty(
      'draft-line',
      'line-dasharray',
      mode === 'pencil' ? [1, 0] : [3, 2],
    )
  source('draft').setData({
    type: 'FeatureCollection',
    features:
      vertices.length > 1
        ? [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: [
                  ...vertices,
                  ...(vertices.length > 2 && mode !== 'pencil' && !editingPencilPath
                    ? [vertices[0]!]
                    : []),
                ],
              },
            },
          ]
        : [],
  })
  if (mode === 'pencil')
    source('draft').setData({
      type: 'FeatureCollection',
      features: [...pencilStrokes, vertices]
        .filter(s => s.length > 1)
        .map(coordinates => ({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates },
        })),
    })
  const parent = byId.get(selected)!
  const members =
    mode !== 'pencil' && vertices.length >= 3
      ? inventory.divisions
          .filter(
            d =>
              d.point &&
              d.id !== parent.id &&
              d.level !== null &&
              (parent.level === null || d.level > parent.level) &&
              containsReviewPoint(d.point!, {
                type: 'Polygon',
                coordinates: [[...vertices, vertices[0]!]],
              }),
          )
          .map(d => d.id)
      : []
  map.setFilter('draft-members', ['in', ['get', 'id'], ['literal', members]])
  if (mode === 'pencil') {
    say(
      `Pencil · ${vertices.length} vertices · click along roads; Ctrl-click for straight lines. Click the first node to close and save automatically.`,
    )
    return
  }
  say(
    `${members.length} lower-level points inside · ${mode === 'edit' ? 'Editing' : 'Straight-line drawing (no road snapping)'} ${divisionReviewName(byId.get(selected)!)} · ${vertices.length} vertices. Finish saves locally.`,
  )
}
const nodeSelectionControls = document.createElement('div')
nodeSelectionControls.className = 'buttons node-selection-controls'
const rectangleButton = document.createElement('button')
rectangleButton.textContent = 'Select nodes in rectangle'
rectangleButton.setAttribute('aria-pressed', 'false')
const deleteNodesButton = document.createElement('button')
deleteNodesButton.textContent = 'Delete selected nodes (0)'
deleteNodesButton.disabled = true
const clearNodesButton = document.createElement('button')
clearNodesButton.textContent = 'Clear node selection'
clearNodesButton.disabled = true
nodeSelectionControls.append(rectangleButton, deleteNodesButton, clearNodesButton)
$('drawing').append(nodeSelectionControls)
const nodeRectangle = createNodeRectangle(
  map.getContainer(),
  (start, end, additive) => {
    const contained = nodesInRectangle(
      vertices.map(p => map.project(p as [number, number])),
      start,
      end,
    )
    selectedNodeIndices = additive
      ? new Set([...selectedNodeIndices, ...contained])
      : contained
    refreshNodeSelection()
    say(
      `${selectedNodeIndices.size} boundary nodes selected. Delete selected nodes removes them from this draft; Undo restores them.`,
    )
  },
)
function refreshNodeSelection() {
  rectangleButton.setAttribute('aria-pressed', String(rectangleSelecting))
  deleteNodesButton.textContent = `Delete selected nodes (${selectedNodeIndices.size})`
  deleteNodesButton.disabled = selectedNodeIndices.size === 0
  clearNodesButton.disabled = selectedNodeIndices.size === 0
  markers.forEach((marker, index) => {
    marker
      .getElement()
      .classList.toggle('vertex-selected', selectedNodeIndices.has(index))
  })
}
function resetNodeSelection() {
  rectangleSelecting = false
  selectedNodeIndices.clear()
  nodeRectangle.setActive(false)
  refreshNodeSelection()
}
rectangleButton.onclick = () => {
  if (!mode || mode === 'move') return
  if (adjoinMode) {
    say('Finish adjoining the boundary before selecting nodes.')
    return
  }
  rectangleSelecting = !rectangleSelecting
  nodeRectangle.setActive(rectangleSelecting)
  refreshNodeSelection()
  say(
    rectangleSelecting
      ? 'Drag a rectangle on the map to select nodes on the active outline. Hold Shift to add to the selection. Delete removes the selection; Escape leaves selection mode.'
      : 'Rectangle selection closed. Continue editing the outline.',
  )
}
clearNodesButton.onclick = () => {
  selectedNodeIndices.clear()
  refreshNodeSelection()
}
function deleteSelectedNodes() {
  if (!mode || mode === 'move' || !selectedNodeIndices.size) return
  try {
    const remaining = removeSelectedNodes(vertices, selectedNodeIndices)
    const ring = [...remaining, [...remaining[0]!]]
    let geometry: Polygon | MultiPolygon = { type: 'Polygon', coordinates: [ring] }
    if (mode === 'edit' && originalGeometry) {
      geometry = structuredClone(originalGeometry)
      if (geometry.type === 'Polygon') geometry.coordinates[0] = ring
      else geometry.coordinates[0]![0] = ring
    }
    const candidate: SaanseoiEstimatedAreas = {
      ...estimatedAreas,
      features: [
        ...estimatedAreas.features.filter(f => f.properties.divisionId !== selected),
        {
          type: 'Feature',
          properties: { divisionId: selected, variant: 'saanseoi' },
          geometry,
        },
      ],
    }
    if (!editingPencilPath) validateSaanseoiEstimatedAreas(candidate, inventory)
    const count = selectedNodeIndices.size
    vertices = remaining
    recordVertexHistory()
    updateDraft()
    say(
      `Deleted ${count} nodes from the active outline. Undo restores the whole selection; Finish saves the draft.`,
    )
  } catch (error) {
    say(`Nodes were not deleted: ${String(error)}`)
  }
}
deleteNodesButton.onclick = deleteSelectedNodes
function updateDraft() {
  selectedNodeIndices.clear()
  markers.forEach(m => {
    m.remove()
  })
  markers = []
  vertices.forEach((position, index) => {
    const element = document.createElement('div')
    element.className = 'vertex'
    element.title =
      mode === 'pencil'
        ? index === 0
          ? 'Click to close; Ctrl-click closes with a straight line'
          : 'Road boundary vertex'
        : 'Drag to move · Ctrl-click to delete'
    if (mode === 'pencil')
      element.style.cssText =
        index === 0
          ? 'width:12px;height:12px;border:2px solid white;background:#18a87b;cursor:pointer'
          : 'width:5px;height:5px;border:1px solid #18a87b;background:white;pointer-events:none'
    const marker = new maplibregl.Marker({ element, draggable: mode !== 'pencil' })
      .setLngLat(position as [number, number])
      .addTo(map)
    makeMarkerAltPanFriendly(element, marker)
    element.addEventListener('contextmenu', event => event.stopPropagation())
    element.addEventListener('click', event => {
      event.stopPropagation()
      const mouseEvent = event as MouseEvent
      if (mode === 'pencil') {
        if (index === 0 && !pencilReview && !pencilExpansion)
          closePencilStroke(mouseEvent.ctrlKey)
        return
      }
      if (!(mouseEvent.ctrlKey || mouseEvent.metaKey)) return
      event.preventDefault()
      if (vertices.length <= 3) {
        say('A polygon needs at least three vertices.')
        return
      }
      vertices.splice(index, 1)
      recordVertexHistory()
      updateDraft()
    })
    marker.on('dragstart', () => {
      element.style.cursor = 'grabbing'
    })
    marker.on('drag', () => {
      const p = marker.getLngLat()
      vertices[index] = [p.lng, p.lat]
      updateDraftPreview()
    })
    marker.on('dragend', () => {
      element.style.cursor = 'grab'
      recordVertexHistory()
    })
    markers.push(marker)
  })
  updateDraftPreview()
  refreshNodeSelection()
}
function startAdjoin() {
  resetNodeSelection()
  if (mode && (mode === 'move' || mode === 'part')) {
    say('Finish or cancel the current drawing before starting Adjoin.')
    return
  }
  if (!adjoiningNodes().length) {
    say(
      'No adjoining polygon nodes are available. Show the neighbouring area and zoom to it first.',
    )
    return
  }
  if (!mode) start(geometryToEdit() ? 'edit' : 'draw')
  if (mode !== 'draw' && mode !== 'edit') return
  adjoinMode = 'boundary'
  adjoinSelection = []
  $('draw-help').textContent =
    'Adjoin mode: click two nodes on the same adjoining polygon. The boundary between them will be copied into this area.'
  showAdjoinMarkers()
  say('Adjoin mode: select the first node on an adjoining polygon.')
}
function startAdjoinStreet() {
  resetNodeSelection()
  if (mode && mode !== 'edit') {
    say('Finish or cancel the current drawing before starting Adjoin street.')
    return
  }
  if (!mode) {
    if (!geometryToEdit()) {
      say('Adjoin street requires an existing polygon to edit.')
      return
    }
    start('edit')
  }
  if (mode !== 'edit') return
  adjoinMode = 'street'
  adjoinSelection = []
  streetSelection = []
  $('draw-help').textContent =
    'Adjoin street mode: tap two points on the street network. The shortest connected street route will replace the nearest segment of this ring.'
  showStreetMarkers()
  say('Adjoin street mode: tap the first point on a street.')
}
function undo() {
  if (pencilSaving) return
  if (mode === 'pencil') {
    if (pencilHistoryIndex <= 0) {
      say('Nothing to undo.')
      return
    }
    const state = structuredClone(pencilHistory[--pencilHistoryIndex]!)
    pencilStrokes = state.strokes
    vertices = state.vertices
    pencilReview = false
    clearPencilPreview()
    updateDraft()
    calculatePencilNetwork()
    refreshPencilRegions()
    return
  }
  clearPencilPreview()
  if (mode === 'move') {
    if (moveHistoryIndex <= 0) {
      say('Nothing to undo.')
      return
    }
    moveHistoryIndex -= 1
    movingGeometry = structuredClone(moveHistory[moveHistoryIndex]!)
    moveHandle?.setLngLat(geometryAnchor(movingGeometry))
    updateMovePreview()
    say('Undid the last geometry move.')
    return
  }
  if (!mode || vertexHistoryIndex <= 0) {
    say('Nothing to undo.')
    return
  }
  vertexHistoryIndex -= 1
  vertices = structuredClone(vertexHistory[vertexHistoryIndex]!)
  updateDraft()
}
function nearestDraftSegment(point: maplibregl.Point) {
  if (vertices.length < 2) return null
  const segmentCount =
    vertices.length >= 3 && !editingPencilPath ? vertices.length : vertices.length - 1
  let nearest: { index: number; distance: number } | null = null
  for (let index = 0; index < segmentCount; index += 1) {
    const start = map.project(vertices[index] as [number, number])
    const end = map.project(vertices[(index + 1) % vertices.length] as [number, number])
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthSquared = dx * dx + dy * dy
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
            ),
          )
    const distance = Math.hypot(
      point.x - (start.x + dx * t),
      point.y - (start.y + dy * t),
    )
    if (!nearest || distance < nearest.distance) nearest = { index, distance }
  }
  return nearest
}
function start(next: typeof mode) {
  if (mode) {
    say('Finish or cancel the current drawing first.')
    return
  }
  if (!mapReady || !selected) return
  if (next === 'edit') map.boxZoom.disable()
  const moveGeometry = next === 'move' ? geometryToMove() : null
  const editGeometry = next === 'edit' ? geometryToEdit() : null
  const partGeometry = next === 'part' ? geometryToEdit() : null
  if (next === 'move' && !moveGeometry) return
  if (next === 'edit' && !editGeometry) return
  if (next === 'part' && !partGeometry) return
  clearCorePointMarker()
  resetNodeSelection()
  nodeSelectionControls.hidden = next === 'move' || next === 'pencil'
  pencilTools.hidden = next !== 'pencil'
  mode = next
  adjoinMode = null
  adjoinSelection = []
  streetSelection = []
  clearAdjoinMarkers()
  originalGeometry = next === 'move' ? moveGeometry : (editGeometry ?? partGeometry)
  vertices =
    next === 'edit' && originalGeometry
      ? structuredClone(
          originalGeometry.type === 'Polygon'
            ? originalGeometry.coordinates[0]!.slice(0, -1)
            : originalGeometry.coordinates[0]![0]!.slice(0, -1),
        )
      : []
  movingGeometry =
    next === 'move' && moveGeometry ? structuredClone(moveGeometry) : null
  moveOrigin = movingGeometry ? geometryAnchor(movingGeometry) : null
  vertexHistory = [structuredClone(vertices)]
  vertexHistoryIndex = 0
  moveHistory = movingGeometry ? [structuredClone(movingGeometry)] : []
  moveHistoryIndex = movingGeometry ? 0 : -1
  $('draw-help').textContent =
    next === 'move'
      ? 'Drag the yellow centre handle or any outline to move the whole geometry. Finish when it is aligned.'
      : next === 'pencil'
        ? 'Click along road centrelines to draw. Hold Ctrl for a straight unsnapped segment. Click the first node to close a stroke; Ctrl closes straight. Finish reviews the regions. Crossings create shared nodes. Review regions to choose what to save.'
        : 'Click map to add vertices; click a line to insert one. Shift-click anywhere to insert into the nearest segment at your click. Drag nodes to adjust. Ctrl/Cmd-click a node to delete. Ctrl/Cmd-Z undoes the last edit.'
  if (next === 'move' && moveOrigin) {
    const element = document.createElement('div')
    element.className = 'move-handle'
    element.title = 'Drag to move the whole geometry'
    element.setAttribute('aria-label', 'Drag to move the whole geometry')
    element.style.cssText =
      'width:22px;height:22px;border-radius:50%;background:#ffcb66;border:3px solid #173f4d;box-shadow:0 0 0 2px white;cursor:grab;pointer-events:auto;touch-action:none;user-select:none;z-index:3'
    moveHandle = new maplibregl.Marker({ element, draggable: true })
      .setLngLat(moveOrigin)
      .addTo(map)
    makeMarkerAltPanFriendly(element, moveHandle)
    for (const eventName of ['click', 'contextmenu'])
      element.addEventListener(eventName, event => event.stopPropagation())
    moveHandle.on('dragstart', () => {
      element.style.cursor = 'grabbing'
    })
    moveHandle.on('drag', () => {
      if (!movingGeometry || !moveOrigin || !moveHandle) return
      const position = moveHandle.getLngLat()
      movingGeometry = translateGeometry(
        originalGeometry!,
        position.lng - moveOrigin[0],
        position.lat - moveOrigin[1],
      )
      updateMovePreview()
      say(
        `Drag the handle to move ${divisionReviewName(byId.get(selected)!)}. Release when aligned.`,
      )
    })
    moveHandle.on('dragend', () => {
      element.style.cursor = 'grab'
      recordMoveHistory()
    })
  }
  $('drawing').hidden = false
  $<HTMLButtonElement>('undo').disabled = false
  map.setFilter('points', null)
  map.doubleClickZoom.disable()
  map.dragPan.disable()
  map.getCanvas().style.cursor = next === 'move' ? 'grab' : 'crosshair'
  if (next === 'move') {
    updateMovePreview()
    say(
      `Drag the handle to move ${divisionReviewName(byId.get(selected)!)}. Finish saves the translated geometry.`,
    )
  } else updateDraft()
}
function cancel() {
  editingPencilPath = false
  if (pencilSaving) return
  clearPencilPreview()
  pencilPointer = null
  pencilTools.hidden = true
  pencilExpansion = false
  pencilExpansionOriginal = null
  source('pencil-expansion-base')?.setData({ type: 'FeatureCollection', features: [] })
  pencilReview = false
  pencilRegions = []
  selectedPencilRegions.clear()
  refreshPencilRegions()
  source('pencil-junctions')?.setData({ type: 'FeatureCollection', features: [] })
  resetNodeSelection()
  endLineDrag()
  restoreEditorPan()
  adjoinMode = null
  adjoinSelection = []
  streetSelection = []
  clearAdjoinMarkers()
  mode = null
  vertices = []
  originalGeometry = null
  movingGeometry = null
  moveOrigin = null
  markers.forEach(m => {
    m.remove()
  })
  markers = []
  moveHandle?.remove()
  moveHandle = null
  $('drawing').hidden = true
  $<HTMLButtonElement>('undo').disabled = false
  map.setFilter('draft-members', ['==', ['get', 'id'], ''])
  refreshList()
  refreshCorePointMarker()
  source('draft').setData({ type: 'FeatureCollection', features: [] })
  map.doubleClickZoom.enable()
  map.boxZoom.enable()
  map.dragPan.enable()
  map.getCanvas().style.cursor = ''
  say('Drawing closed. Saved estimated areas are retained.')
  if (map.getSource('geometry-preview'))
    source('geometry-preview').setData({ type: 'FeatureCollection', features: [] })
}
async function finish() {
  if (editingPencilPath) {
    void finishEditedPencil()
    return
  }
  if (mode === 'pencil') {
    reviewPencilRegions()
    return
  }
  if (mode === 'move') {
    if (!movingGeometry) {
      say('Drag the move handle before finishing.')
      return
    }
    const sourceProperties =
      candidatePreview?.properties ??
      estimatedAreas.features.find(f => f.properties.divisionId === selected)
        ?.properties ??
      geometrySources()[Number($<HTMLSelectElement>('geometry-source').value)]
        ?.properties
    const geometry = structuredClone(movingGeometry)
    const next: SaanseoiEstimatedAreas = {
      ...estimatedAreas,
      features: [
        ...estimatedAreas.features.filter(f => f.properties.divisionId !== selected),
        {
          type: 'Feature',
          id: `saanseoi:${selected}`,
          properties: estimatedAreaPropertiesWithCorePoint(geometry, {
            ...(estimatedAreas.features.find(f => f.properties.divisionId === selected)
              ?.properties ?? {}),
            divisionId: selected,
            variant: 'saanseoi',
            name: divisionReviewName(byId.get(selected)!),
            reviewedAt: new Date().toISOString(),
            ...(sourceProperties?.variant
              ? { copiedFrom: sourceProperties.variant }
              : {}),
            ...(sourceProperties?.sourceAreaId
              ? { sourceAreaId: sourceProperties.sourceAreaId }
              : {}),
          }),
          geometry,
        },
      ],
    }
    try {
      validateSaanseoiEstimatedAreas(next, inventory)
      await persist(next)
      cancel()
      say(
        'Moved geometry saved as an estimated area in this browser. Download fixtures to retain the review in the repository.',
      )
    } catch (e) {
      say(String(e))
    }
    return
  }
  if (vertices.length < 3) {
    say('Add at least three vertices.')
    return
  }
  const ring = [...vertices.map(p => [...p]), [...vertices[0]!]]
  let geometry: Polygon | MultiPolygon = { type: 'Polygon', coordinates: [ring] }
  if (mode === 'part' && originalGeometry)
    geometry = mergePolygonPart(originalGeometry, {
      type: 'Polygon',
      coordinates: [ring],
    })
  if (mode === 'edit' && originalGeometry) {
    geometry = structuredClone(originalGeometry)
    if (geometry.type === 'Polygon') geometry.coordinates[0] = ring
    else geometry.coordinates[0]![0] = ring
  }
  const next: SaanseoiEstimatedAreas = {
    ...estimatedAreas,
    features: [
      ...estimatedAreas.features.filter(f => f.properties.divisionId !== selected),
      {
        type: 'Feature',
        id: `saanseoi:${selected}`,
        properties: estimatedAreaPropertiesWithCorePoint(geometry, {
          ...(estimatedAreas.features.find(f => f.properties.divisionId === selected)
            ?.properties ?? {}),
          divisionId: selected,
          variant: 'saanseoi',
          name: divisionReviewName(byId.get(selected)!),
          reviewedAt: new Date().toISOString(),
        }),
        geometry,
      },
    ],
  }
  try {
    validateSaanseoiEstimatedAreas(next, inventory)
    await persist(next)
    cancel()
    say(
      'Saanseoi saved in this browser. Download fixtures to retain the review in the repository.',
    )
  } catch (e) {
    reportDrawingError(e)
  }
}
function derive() {
  if (mode) {
    say('Finish or cancel the drawing first.')
    return
  }
  say('Deriving membership…')
  setTimeout(() => {
    try {
      patch = deriveHierarchyPatch(
        inventory,
        reference.features,
        estimatedAreas,
        $<HTMLInputElement>('provisional').checked,
      )
      if (selected) select(selected, false)
      const count = (s: string) => patch!.entries.filter(e => e.status === s).length
      say(
        `${patch.entries.length} decisions · ${count('geometry')} geometry · ${count('provisional')} provisional · ${count('unresolved')} unresolved. Overlaps choose the smallest containing area, then ID.`,
      )
    } catch (e) {
      say(String(e))
    }
  }, 20)
}
function download(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('download').onclick = async () => {
  if (mode) {
    say('Finish or cancel the drawing first.')
    return
  }
  try {
    const exported = exportReviewCuration(
      estimatedAreas,
      reviewInputs.drawings,
      reviewInputs.editorProject,
    )
    download('division-geometry.json', exported.geometry)
    setTimeout(() => download('division-editor-project.json', exported.project), 200)
    say(
      `Downloaded ${estimatedAreas.features.length} active estimated areas, ${estimatedAreas.withheld?.length ?? 0} withheld drawings and a local-only editor cache. Keep division-geometry.json in Git; save division-editor-project.json under .local/division-review/. Hierarchies are generated from the retained drawings and explicit parent decisions. Withheld drawings retain their curation reasons and do not contribute to hierarchy or publication.`,
    )
  } catch (e) {
    say(String(e))
  }
}
const recoveryDownload = document.createElement('button')
recoveryDownload.textContent = 'Download geometry recovery history'
$('download').after(recoveryDownload)
recoveryDownload.onclick = async () => {
  try {
    const ids = new Set([
      '64a1b3b8-ee9e-4193-bc22-e5abca06cf1c',
      '4ce57ea5-ebe4-4d08-bca3-5f0b4e6d473b',
      'c8745e10-0c52-4f29-89e9-eab707d7783c',
    ])
    const pick = (value: SaanseoiEstimatedAreas) => ({
      ...value,
      features: value.features.filter(f => ids.has(f.properties.divisionId)),
    })
    const history = await readGeometryBackups(key)
    download('division-geometry-recovery.json', {
      current: pick(estimatedAreas),
      undo: cleanupBackup ? pick(cleanupBackup) : null,
      backups: history.map(item => ({
        key: item.key,
        value: pick(item.value as SaanseoiEstimatedAreas),
      })),
    })
    say('Recovery history downloaded. Current drawings have not changed.')
  } catch (error) {
    say(`Recovery export failed: ${String(error)}`)
  }
}
$('derive').onclick = derive
for (const control of cleanupControls)
  $(control.id).onclick = () => {
    void cleanLevelEstimatedAreas(control.level)
  }
$('undo-geometry-cleanup').onclick = undoCleanup
$('preview-simplification').onclick = previewSimplification
$<HTMLSelectElement>('simplification-display').onchange = () => {
  simplificationDisplay = $<HTMLSelectElement>('simplification-display')
    .value as SimplificationDisplay
  refreshSimplificationPreview()
}
$<HTMLInputElement>('simplify-metres').onchange = clearSimplificationPreview
$<HTMLSelectElement>('simplify-level').onchange = clearSimplificationPreview
$('simplify-geometry').onclick = simplifyLevelEstimatedAreas
$('download-cleanup-diagnostics').onclick = () => {
  if (cleanupDiagnostic)
    download('polygon-cleanup-diagnostics.geojson', cleanupDiagnostic)
}
$('expand-pencil').onclick = () => {
  void startPencil(true)
}
$('pencil').onclick = () => {
  void startPencil(Boolean(geometryToEdit()))
}
$('draw').onclick = () => start('draw')
$('edit').onclick = () => start('edit')
moveButton.onclick = () => start('move')
removeHolesButton.onclick = async () => {
  if (mode || !selected) return
  const estimatedArea = estimatedAreas.features.find(
    feature => feature.properties.divisionId === selected,
  )
  if (!estimatedArea) return
  const result = removeInteriorRings(estimatedArea.geometry)
  if (!result.removedHoleCount) return
  await persist({
    ...estimatedAreas,
    features: estimatedAreas.features.map(feature =>
      feature.properties.divisionId === selected
        ? { ...adoptCurrentGeometryBaseline(feature), geometry: result.geometry }
        : feature,
    ),
  })
  say(
    `Filled ${result.removedHoleCount} interior ${result.removedHoleCount === 1 ? 'hole' : 'holes'} in ${divisionReviewName(byId.get(selected)!)}. Undo restores the previous drawing.`,
  )
}
$('part').onclick = () => start('part')
$('adjoin').onclick = startAdjoin
$('adjoin-street').onclick = startAdjoinStreet
$('finish').onclick = finish
$('cancel').onclick = cancel
$('undo').onclick = undo
$('remove').onclick = async () => {
  if (mode) return
  await persist({
    ...estimatedAreas,
    features: estimatedAreas.features.filter(f => f.properties.divisionId !== selected),
  })
  say('Estimated area removed; the original source area is untouched.')
}
$('copy').onclick = async () => {
  if (mode) return
  const f = geometrySources()[Number($<HTMLSelectElement>('geometry-source').value)]
  if (!f || f.properties.divisionId !== selected) return
  const copy = structuredClone(f)
  copy.id = `saanseoi:${selected}`
  copy.properties = estimatedAreaPropertiesWithCorePoint(copy.geometry, {
    ...f.properties,
    divisionId: selected,
    variant: 'saanseoi',
    copiedFrom: f.properties.variant,
    sourceAreaId: (f.properties as typeof f.properties & { sourceAreaId?: string })
      .sourceAreaId,
  })
  const next = {
    ...estimatedAreas,
    features: [
      ...estimatedAreas.features.filter(f => f.properties.divisionId !== selected),
      copy,
    ],
  }
  try {
    validateSaanseoiEstimatedAreas(next, inventory)
    await persist(next)
    say('Existing geometry copied into an estimated area. Edit it as needed.')
  } catch (e) {
    say(String(e))
  }
}
$<HTMLInputElement>('import').onchange = async event => {
  if (mode) {
    say('Finish or cancel the drawing first.')
    return
  }
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const data = prepareEstimatedAreas(JSON.parse(await file.text()))
    const next = prepareEstimatedAreas(mergeReviewEstimatedAreas(estimatedAreas, data))
    await persist(next)
    say(
      `Imported ${data.features.length} active estimated areas; ${next.withheld?.length ?? 0} withheld drawings retained with their curation reasons. Other saved drawings were retained.`,
    )
  } catch (e) {
    say(`Import rejected: ${String(e)}`)
  } finally {
    input.value = ''
  }
}
$('search').oninput = refreshList
$('only-visible-layers').onchange = refreshList
$('missing-area').onchange = refreshList
$('provisional').onchange = () => {
  patch = null
  say('Fallback policy changed. Derive hierarchy to refresh the preview.')
}
$('overview').onclick = () =>
  map.fitBounds(
    [
      [113.83, 22.13],
      [114.44, 22.57],
    ],
    { padding: { left: 330, right: 335, top: 50, bottom: 140 } },
  )
map.on('load', () => {
  map.addSource('geometry-preview', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addSource('reference', { type: 'geojson', data: reference })
  map.addSource('published-islands', {
    type: 'geojson',
    data: publishedIslandReference,
  })
  map.addSource('estimatedAreas', { type: 'geojson', data: estimatedAreas })
  map.addSource('simplification-preview', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  const initialPolygonDisplay = polygonDisplayData()
  map.addSource('polygon-display', { type: 'geojson', data: initialPolygonDisplay })
  map.addSource('polygon-display-label-points', {
    type: 'geojson',
    data: polygonDisplayLabelData(initialPolygonDisplay),
  })
  map.addSource('points', { type: 'geojson', data: reviewPoints() })
  map.addSource('draft', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addSource('cleanup-error', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'reference-fill',
    type: 'fill',
    source: 'reference',
    paint: { 'fill-color': '#84aede', 'fill-opacity': 0.19 },
  })
  map.addLayer({
    id: 'reference-line',
    type: 'line',
    source: 'reference',
    paint: { 'line-color': '#7ea4d4', 'line-width': 2, 'line-opacity': 1 },
  })
  map.addSource('government-districts', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: governmentCandidates },
  })
  for (const [variant, colour] of [
    ['hkgov-censtatd-2024', '#e9b85b'],
    ['hkgov-had', '#c39aff'],
  ] as const) {
    map.addLayer({
      id: `${variant}-fill`,
      type: 'fill',
      source: 'government-districts',
      filter: ['==', ['get', 'variant'], variant],
      layout: { visibility: 'none' },
      paint: { 'fill-color': colour, 'fill-opacity': 0.19 },
    })
    map.addLayer({
      id: `${variant}-line`,
      type: 'line',
      source: 'government-districts',
      filter: ['==', ['get', 'variant'], variant],
      layout: { visibility: 'none' },
      paint: {
        'line-color': colour,
        'line-width': 2,
        ...(variant === 'hkgov-had' ? { 'line-dasharray': [3, 2] } : {}),
      },
    })
  }
  map.addLayer({
    id: 'published-islands-fill',
    type: 'fill',
    source: 'published-islands',
    paint: { 'fill-color': '#e5a83c', 'fill-opacity': 0.16 },
  })
  map.addLayer({
    id: 'published-islands-line',
    type: 'line',
    source: 'published-islands',
    paint: { 'line-color': '#f7bd4b', 'line-width': 2, 'line-opacity': 0.9 },
  })
  map.addLayer({
    id: 'saanseoi-fill',
    type: 'fill',
    source: 'estimatedAreas',
    paint: { 'fill-color': '#4ce2b4', 'fill-opacity': 0.19 },
  })
  map.addLayer({
    id: 'saanseoi-line',
    type: 'line',
    source: 'estimatedAreas',
    paint: { 'line-color': '#4ce2b4', 'line-width': 2 },
  })
  map.addLayer({
    id: 'simplification-preview-fill',
    type: 'fill',
    source: 'simplification-preview',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#ffbd59', 'fill-opacity': 0.2 },
  })
  map.addLayer({
    id: 'simplification-preview-line',
    type: 'line',
    source: 'simplification-preview',
    layout: { visibility: 'none' },
    paint: { 'line-color': '#ffbd59', 'line-width': 3 },
  })
  map.addSource('cleanup-selection', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addSource('cleanup-selection-nodes', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'cleanup-selection-outline',
    type: 'line',
    source: 'cleanup-selection',
    paint: { 'line-color': '#ffbb44', 'line-width': 4, 'line-dasharray': [2, 1] },
  })
  map.addLayer({
    id: 'cleanup-selection-vertices',
    type: 'circle',
    source: 'cleanup-selection-nodes',
    paint: {
      'circle-radius': 3,
      'circle-color': '#ffbb44',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#15232a',
    },
  })
  map.addLayer({
    id: 'polygon-display-fill',
    type: 'fill',
    source: 'polygon-display',
    paint: { 'fill-color': ['get', 'shade'], 'fill-opacity': 0.48 },
    layout: { visibility: 'none' },
  })
  map.addLayer({
    id: 'polygon-display-line',
    type: 'line',
    source: 'polygon-display',
    paint: { 'line-color': ['get', 'shade'], 'line-width': 2.5, 'line-opacity': 0.98 },
    layout: { visibility: 'none' },
  })
  map.addLayer({
    id: 'selected-area',
    type: 'line',
    source: 'estimatedAreas',
    filter: ['==', ['get', 'divisionId'], ''],
    paint: { 'line-color': 'white', 'line-width': 3 },
  })
  map.addLayer({
    id: 'geometry-preview-hit',
    type: 'line',
    source: 'geometry-preview',
    paint: { 'line-color': 'white', 'line-width': 18, 'line-opacity': 0.001 },
  })
  map.addLayer({
    id: 'geometry-preview-line',
    type: 'line',
    source: 'geometry-preview',
    paint: { 'line-color': 'white', 'line-width': 3 },
  })
  map.addLayer({
    id: 'points',
    type: 'circle',
    source: 'points',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 15, 6],
      'circle-color': [
        'case',
        ['get', 'hasSaanseoi'],
        '#65e7be',
        ['get', 'hasArea'],
        '#8baee3',
        '#f2b45b',
      ],
      'circle-stroke-color': '#142f3d',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'draft-members',
    type: 'circle',
    source: 'points',
    filter: ['==', ['get', 'id'], ''],
    paint: {
      'circle-radius': 7,
      'circle-color': '#65e7be',
      'circle-stroke-color': 'white',
      'circle-stroke-width': 1,
    },
  })
  map.addLayer({
    id: 'labels',
    type: 'symbol',
    source: 'points',
    filter: ['==', ['get', 'id'], ''],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 14,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': 'white',
      'text-halo-color': '#112b37',
      'text-halo-width': 2,
    },
  })
  map.addLayer({
    id: 'polygon-display-labels',
    type: 'symbol',
    source: 'polygon-display-label-points',
    filter: ['!=', ['get', 'level'], 6],
    layout: {
      visibility: 'none',
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 9, 13, 15, 17],
      'text-max-width': 14,
      'text-padding': 2,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#fff8dc',
      'text-halo-color': '#071923',
      'text-halo-width': 3,
      'text-halo-blur': 0.15,
    },
  })
  map.addLayer({
    id: 'polygon-display-labels-level-6',
    type: 'symbol',
    source: 'polygon-display-label-points',
    minzoom: 13,
    filter: ['==', ['get', 'level'], 6],
    layout: {
      visibility: 'none',
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 13, 14, 15, 17],
      'text-max-width': 14,
      'text-padding': 2,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#fff8dc',
      'text-halo-color': '#071923',
      'text-halo-width': 3,
      'text-halo-blur': 0.15,
    },
  })
  map.addLayer({
    id: 'cleanup-error-halo',
    type: 'circle',
    source: 'cleanup-error',
    paint: {
      'circle-radius': 10,
      'circle-color': '#ff304f',
      'circle-opacity': 0.3,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'cleanup-error-point',
    type: 'circle',
    source: 'cleanup-error',
    paint: {
      'circle-radius': 5,
      'circle-color': '#ff304f',
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'cleanup-error-label',
    type: 'symbol',
    source: 'cleanup-error',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-offset': [0, 1.2],
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#fff', 'text-halo-color': '#7f1025', 'text-halo-width': 2 },
  })
  map.addSource('pencil-expansion-base', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'pencil-expansion-outline',
    type: 'line',
    source: 'pencil-expansion-base',
    paint: { 'line-color': 'white', 'line-width': 3 },
  })
  map.addSource('pencil-regions', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addSource('pencil-junctions', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'pencil-region-fill',
    type: 'fill',
    source: 'pencil-regions',
    paint: {
      'fill-color': ['case', ['get', 'selected'], '#44df9b', '#ffcc55'],
      'fill-opacity': 0.35,
    },
  })
  map.addLayer({
    id: 'pencil-region-outline',
    type: 'line',
    source: 'pencil-regions',
    paint: {
      'line-color': ['case', ['get', 'selected'], '#44df9b', '#ffcc55'],
      'line-width': 2,
    },
  })
  map.addLayer({
    id: 'pencil-junction-points',
    type: 'circle',
    source: 'pencil-junctions',
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffcc55',
      'circle-stroke-color': '#112b37',
      'circle-stroke-width': 1,
    },
  })
  map.addSource('pencil-preview', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'pencil-preview-line',
    type: 'line',
    source: 'pencil-preview',
    paint: {
      'line-color': ['case', ['get', 'valid'], '#ffcc55', '#ff4055'],
      'line-width': 4,
    },
  })
  map.addLayer({
    id: 'draft-line',
    type: 'line',
    source: 'draft',
    paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [3, 2] },
  })
  map.addSource('overlap-warnings', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })
  map.addLayer({
    id: 'overlap-warning-line',
    type: 'line',
    source: 'overlap-warnings',
    paint: { 'line-color': '#ffb84d', 'line-width': 3, 'line-dasharray': [2, 2] },
  })
  map.addLayer({
    id: 'overlap-warning-label',
    type: 'symbol',
    source: 'overlap-warnings',
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-offset': [0, 2.8],
    },
    paint: {
      'text-color': '#ffcf80',
      'text-halo-color': '#172630',
      'text-halo-width': 2,
    },
  })
  map.on('mousemove', event => {
    if (mode !== 'pencil' || pencilSaving) return
    if (pencilTimer) clearTimeout(pencilTimer)
    pencilTimer = setTimeout(
      () =>
        previewPencil(
          [event.lngLat.lng, event.lngLat.lat],
          event.originalEvent.ctrlKey,
        ),
      70,
    )
  })
  for (const type of ['keydown', 'keyup'] as const)
    window.addEventListener(type, event => {
      if (mode === 'pencil' && event.key === 'Control' && pencilPointer)
        previewPencil(pencilPointer.position, event.ctrlKey)
    })
  map.on('click', event => {
    if (mode === 'pencil') {
      if (pencilSaving) return
      if (pencilReview) {
        const region = map.queryRenderedFeatures(event.point, {
          layers: ['pencil-region-fill'],
        })[0]
        const index = region?.properties?.index
        if (typeof index === 'number') {
          if (selectedPencilRegions.has(index)) selectedPencilRegions.delete(index)
          else selectedPencilRegions.add(index)
          refreshPencilRegions()
        }
        return
      }
      if (event.originalEvent.altKey) return
      pencilTap([event.lngLat.lng, event.lngLat.lat], event.originalEvent.ctrlKey)
      return
    }
    if (mode === 'move') return
    if (mode) {
      if (adjoinMode === 'street') {
        void handleStreetTap(event)
        return
      }
      if (adjoinMode) {
        say('Select two nodes on the adjoining polygon.')
        return
      }
      if (
        event.originalEvent.ctrlKey ||
        event.originalEvent.metaKey ||
        event.originalEvent.altKey
      )
        return
      const nearest = nearestDraftSegment(event.point)
      if (nearest && (nearest.distance <= 16 || event.originalEvent.shiftKey)) {
        vertices.splice(nearest.index + 1, 0, [event.lngLat.lng, event.lngLat.lat])
        recordVertexHistory()
        updateDraft()
        return
      }
      const last = vertices.at(-1)
      if (
        !last ||
        Math.abs(last[0]! - event.lngLat.lng) + Math.abs(last[1]! - event.lngLat.lat) >
          1e-9
      ) {
        vertices.push([event.lngLat.lng, event.lngLat.lat])
        recordVertexHistory()
      }
      updateDraft()
      return
    }
  })
  // Resolve one target per click: names and markers take precedence over fills.
  const selectableLayers = [
    'labels',
    'polygon-display-labels-level-6',
    'polygon-display-labels',
    'points',
    'draft-members',
    'selected-area',
    'polygon-display-line',
    'saanseoi-line',
    'published-islands-line',
    'reference-line',
    'hkgov-censtatd-2024-line',
    'hkgov-had-line',
    'polygon-display-fill',
    'saanseoi-fill',
    'published-islands-fill',
    'reference-fill',
    'hkgov-censtatd-2024-fill',
    'hkgov-had-fill',
  ]
  map.on('click', event => {
    if (mode) return
    for (const layer of selectableLayers) {
      const feature = map
        .queryRenderedFeatures(event.point, { layers: [layer] })
        .find(feature => feature.properties?.divisionId || feature.properties?.id)
      const id = feature?.properties?.divisionId ?? feature?.properties?.id
      if (!id) continue
      chooseDivision(String(id), false, event.originalEvent)
      return
    }
  })
  for (const layer of selectableLayers) {
    map.on('mouseenter', layer, () => {
      if (!mode) map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', layer, () => {
      if (!mode) map.getCanvas().style.cursor = ''
    })
  }
  map.on('moveend', () => {
    if (adjoinMode === 'street') showStreetMarkers()
    else if (adjoinMode) showAdjoinMarkers()
  })
  map.on('contextmenu', event => {
    if (mode) {
      event.preventDefault()
      if (vertices.length <= 3) {
        say('A polygon needs at least three vertices.')
        return
      }
      vertices.pop()
      recordVertexHistory()
      updateDraft()
    }
  })
  map.on('mousedown', 'geometry-preview-hit', startLineDrag)
  map.on('mousedown', 'geometry-preview-line', startLineDrag)
  setPolygonDisplayVisibility(showPolygonDisplay.checked)
  mapReady = true
  refreshList()
  const requestedDivision = new URLSearchParams(location.search).get('division')
  if (requestedDivision && byId.has(requestedDivision)) select(requestedDivision)
  else if (selected) select(selected, false)
  say(startupMessage ?? '')
})
map.on('error', event => say(`Map resource error: ${event.error.message}`))
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mode) {
    if (rectangleSelecting || selectedNodeIndices.size) {
      resetNodeSelection()
      say('Node selection cleared. Continue editing.')
    } else cancel()
    return
  }
  const target = event.target as HTMLElement | null
  if (
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement) &&
    !(target instanceof HTMLInputElement && target.type === 'checkbox')
  )
    return
  if (
    (event.key === 'Delete' || event.key === 'Backspace') &&
    mode &&
    selectedNodeIndices.size
  ) {
    event.preventDefault()
    deleteSelectedNodes()
    return
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && mode) {
    event.preventDefault()
    undo()
  }
})
map.on('mousedown', handleEditorMouseDown)
document.addEventListener('mouseup', scheduleAltPanReset)
refreshList()

initialiseReviewControls()
const cleanupTarget = (id: string) => {
  const division = byId.get(id)
  if (!division || !cleanupFeature(id)) return []
  return [
    {
      id,
      name: divisionReviewName(division),
      group: isIsland(id) ? 'islands' : String(division.level),
    },
  ]
}
createCleanupTargets({
  candidates: () =>
    filtered()
      .filter(divisionVisible)
      .flatMap(d => cleanupTarget(d.id)),
  selected: () => [...cleanupSelection].flatMap(cleanupTarget),
  add: ids => {
    if (mode || cleanupBusy) return
    for (const id of ids) cleanupSelection.add(id)
    refreshList()
  },
  remove: id => {
    if (mode || cleanupBusy) return
    cleanupSelection.delete(id)
    refreshList()
  },
})
