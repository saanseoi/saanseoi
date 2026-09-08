import { m } from '#lib/bits/internal/i18n.js'

export function resourceLabel(type: string) {
  switch (type) {
    case 'divisionStatistic':
      return m.openapi_label_statistics()
    case 'divisionArea':
      return m.source_resource_areas()
    case 'divisionBoundary':
      return m.source_resource_boundaries()
    case 'division':
      return m.openapi_label_divisions()
    case 'address':
      return m.openapi_label_addresses()
    case 'place':
      return m.openapi_label_places()
    case 'street':
      return m.openapi_label_streets()
    default:
      return type
  }
}
