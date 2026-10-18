import { z } from 'zod'

const artefact = z.object({
  size: z.number().nonnegative().optional(),
  sha256: z.string().optional(),
})
export const basemapManifestSchema = z.object({
  createdAt: z.string(),
  region: z.object({ code: z.string(), description: z.string() }),
  release: z.object({
    version: z.string(),
    schema: z.object({ version: z.string(), base: z.string() }).optional(),
    archive: artefact.extend({ tileset: z.string() }),
    boundary: artefact
      .extend({
        source: z.string().optional(),
        boundaryRelations: z.array(z.number()).optional(),
        clipBuffer: z.number().optional(),
      })
      .optional(),
    coastline: z
      .object({
        source: z.string().optional(),
        mode: z.string().optional(),
        land: artefact.optional(),
        water: artefact.optional(),
        line: artefact.optional(),
        border: artefact.optional(),
      })
      .optional(),
  }),
  provenance: z
    .object({
      type: z.string().optional(),
      builtAt: z.string().optional(),
      basemaps: z.object({ repository: z.string(), commit: z.string() }).optional(),
      saanSeoi: z.object({ repository: z.string(), commit: z.string() }).optional(),
      source: z
        .object({
          upstream: z.string().optional(),
          extractionStrategy: z.string().optional(),
          sourceArchive: artefact.extend({ key: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
})
export type BasemapManifest = z.infer<typeof basemapManifestSchema>
export type ManifestField = { label: string; value: string }
export function manifestFields(manifest: BasemapManifest): ManifestField[] {
  const { release: r, provenance: p } = manifest
  const fields: Array<[string, unknown]> = [
    ['Schema', r.schema?.version],
    ['Base schema', r.schema?.base],
    ['Archive SHA-256', r.archive.sha256],
    ['Boundary source', r.boundary?.source],
    ['Boundary relations', r.boundary?.boundaryRelations?.join(', ')],
    ['Clip buffer', r.boundary?.clipBuffer],
    ['Boundary SHA-256', r.boundary?.sha256],
    ['Coastline mode', r.coastline?.mode],
    ['Coastline source', r.coastline?.source],
    ...(['land', 'water', 'line', 'border'] as const).map(
      key =>
        [`Coastline ${key} SHA-256`, r.coastline?.[key]?.sha256] as [string, unknown],
    ),
    ['Builder', p?.type],
    ['Protomaps commit', p?.basemaps?.commit],
    ['SaanSeoi commit', p?.saanSeoi?.commit],
    ['Source', p?.source?.upstream],
    ['Extraction', p?.source?.extractionStrategy],
    ['Source archive', p?.source?.sourceArchive?.key],
    ['Source SHA-256', p?.source?.sourceArchive?.sha256],
  ]
  return fields.flatMap(([label, value]) =>
    value === undefined ? [] : [{ label, value: String(value) }],
  )
}
export function manifestStats(m: BasemapManifest): ManifestField[] {
  const sizes: Array<[string, number | undefined]> = [
    ['PMTiles archive', m.release.archive.size],
    ['Boundary', m.release.boundary?.size],
    ...(['land', 'water', 'line', 'border'] as const).map(
      key =>
        [`Coastline ${key}`, m.release.coastline?.[key]?.size] as [
          string,
          number | undefined,
        ],
    ),
    ['Source archive', m.provenance?.source?.sourceArchive?.size],
  ]
  return sizes.flatMap(([label, size]) =>
    size === undefined ? [] : [{ label, value: String(size) }],
  )
}
export function manifestChanges(previous: BasemapManifest, current: BasemapManifest) {
  const before = new Map(
    [...manifestFields(previous), ...manifestStats(previous)].map(row => [
      row.label,
      row.value,
    ]),
  )
  const after = new Map(
    [...manifestFields(current), ...manifestStats(current)].map(row => [
      row.label,
      row.value,
    ]),
  )
  return [...new Set([...before.keys(), ...after.keys()])].flatMap(label =>
    before.get(label) === after.get(label)
      ? []
      : [
          {
            label,
            before: before.get(label) ?? 'Not supplied',
            after: after.get(label) ?? 'Not supplied',
          },
        ],
  )
}
