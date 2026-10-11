export type ProtomapsSourceRecord = {
  sourceRecordId: string
  properties: {
    kind: string
    tags: Record<string, unknown>
    names: Record<string, string>
  }
  sourceGeometry: { type: string; coordinates: unknown }
}

/** Component indexes refer to the original full coastline geometry, never a copy. */
export type ProtomapsIslandSelection = {
  sourceRecordId: string
  componentIndexes?: number[]
}

export function resolveProtomapsIslandSelections(
  records: ProtomapsSourceRecord[],
  selections: ProtomapsIslandSelection[],
): ProtomapsSourceRecord[] {
  const sources = new Map(records.map(row => [row.sourceRecordId, row]))
  if (sources.size !== records.length)
    throw Error('Protomaps source records require unique identities.')
  const selected = new Set<string>()
  return selections.map(selection => {
    if (
      !selection ||
      typeof selection.sourceRecordId !== 'string' ||
      Object.keys(selection).some(
        key => !['sourceRecordId', 'componentIndexes'].includes(key),
      )
    )
      throw Error('Protomaps island selections contain source references only.')
    const row = sources.get(selection.sourceRecordId)
    if (!row || selected.has(selection.sourceRecordId))
      throw Error(
        'Protomaps island selection requires a unique retained source record.',
      )
    selected.add(selection.sourceRecordId)
    if (row.properties.kind === 'osm-island') {
      if (selection.componentIndexes !== undefined)
        throw Error('OSM island selections reference the complete native feature.')
      return row
    }
    if (
      row.properties.kind !== 'coastline-land' ||
      !['Polygon', 'MultiPolygon'].includes(row.sourceGeometry.type)
    )
      throw Error('Coastline island selections require a polygonal coastline source.')
    const components =
      row.sourceGeometry.type === 'Polygon'
        ? [row.sourceGeometry.coordinates]
        : (row.sourceGeometry.coordinates as unknown[])
    const indexes = selection.componentIndexes
    if (
      !Array.isArray(indexes) ||
      !indexes.length ||
      indexes.some(
        (index, i) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index >= components.length ||
          (i > 0 && index <= indexes[i - 1]!),
      )
    )
      throw Error(
        'Coastline island selections require ordered, unique component indexes.',
      )
    if (indexes.length === components.length) return row
    return {
      ...row,
      sourceGeometry: {
        type: 'MultiPolygon',
        coordinates: indexes.map(index => components[index]),
      },
    }
  })
}

export function protomapsCoastlineLandMask(records: ProtomapsSourceRecord[]) {
  const land = records.filter(row => row.properties.kind === 'coastline-land')
  if (
    !land.length ||
    land.some(row => !['Polygon', 'MultiPolygon'].includes(row.sourceGeometry.type))
  )
    throw Error('Protomaps land mask requires retained full coastline polygons.')
  return land
}
