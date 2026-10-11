import { divisionIdentifiers, type DivisionIdentifiers } from './divisionIdentifiers'

/** Identity namespaces are established by their producers, never by UUID shape. */
export function curatedSourceIdentifiers(
  sourceId: string,
  overtureDivision = false,
): DivisionIdentifiers {
  if (sourceId.startsWith('LANDSD:PLACE_NAME:'))
    return {
      'hkgov-landsd': { geoNameId: sourceId.slice('LANDSD:PLACE_NAME:'.length) },
    }
  if (overtureDivision) return { overture: { divisionId: sourceId } }
  return { saanseoi: { sourceId } }
}

/** These IDs are supplied by the retained Protomaps source reader. */
export function protomapsIdentifiers(sourceId: string): DivisionIdentifiers {
  if (!sourceId.startsWith('PROTOMAPS:LAND:') && !/^OSM:[anwr]\d+$/.test(sourceId))
    throw Error(`Unrecognised retained Protomaps identity: ${sourceId}`)
  // Osmium's exported area ID is retained as an area ID, not guessed to be a way/relation.
  const osm = /^OSM:([anwr])(\d+)$/.exec(sourceId)
  const types = { a: 'areaId', n: 'nodeId', w: 'wayId', r: 'relationId' } as const
  return {
    protomaps: { sourceId },
    ...(osm ? { osm: { [types[osm[1] as keyof typeof types]]: osm[2]! } } : {}),
  }
}

export function mergeDivisionIdentifiers(
  ...inputs: unknown[]
): DivisionIdentifiers | null {
  const result: DivisionIdentifiers = {}
  for (const input of inputs) {
    for (const [publisher, fields] of Object.entries(
      divisionIdentifiers(input) ?? {},
    )) {
      result[publisher] ??= {}
      const group = result[publisher]
      for (const [type, value] of Object.entries(fields)) {
        if (
          group[type] !== undefined &&
          JSON.stringify(group[type]) !== JSON.stringify(value)
        )
          throw Error(`Conflicting division identifier: ${publisher}.${type}`)
        group[type] = value
      }
    }
  }
  return Object.keys(result).length ? result : null
}
