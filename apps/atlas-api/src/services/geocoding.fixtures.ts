import { emptyDivisionHierarchies, type DivisionHierarchies } from '@repo/db'
import type { DivisionRecord, DivisionAreaRecord } from '../db/divisions'

export function division(
  id: string,
  category: DivisionRecord['division']['category'] = 'administrative',
  paths: Partial<DivisionHierarchies> = {},
): DivisionRecord {
  return {
    division: {
      id,
      snapshotId: 'snapshot',
      level: id === 'root' ? 0 : 2,
      class:
        id === 'root' ? 'sar' : category === 'landform' ? 'minor_island' : 'district',
      category,
      geometry: null,
      bbox: null,
      hierarchies: { ...emptyDivisionHierarchies(), ...paths },
      cartography: null,
      sources: null,
      createdAt: '',
      updatedAt: '',
    },
    i18n: { en: { name: id } },
  }
}
export const entry = (id: string, klass = 'district') => ({
  id,
  name: id,
  class: klass,
})
export function area(id: string, west = 0, east = 10): DivisionAreaRecord {
  return {
    id: `area-${id}`,
    divisionId: id,
    variant: 'stub',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, 0],
          [east, 0],
          [east, 10],
          [west, 10],
          [west, 0],
        ],
      ],
    },
    bbox: [west, 0, east, 10],
    identifiers: null,
    sources: null,
    type: 'mixed',
    isLand: null,
    isTerritorial: null,
  }
}
