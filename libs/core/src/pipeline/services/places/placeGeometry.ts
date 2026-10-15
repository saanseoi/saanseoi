export type PlacePoint = { type: 'Point'; coordinates: [number, number] }
export function placePoint(lng: number, lat: number): PlacePoint {
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  )
    throw new Error('Invalid Place coordinates.')
  return { type: 'Point', coordinates: [lng, lat] }
}
export function normalisePlaceBbox(
  value: unknown,
): [number, number, number, number] | null {
  const v = value as Record<string, unknown> | null
  const bounds = Array.isArray(value)
    ? value
    : v
      ? [v.xmin, v.ymin, v.xmax, v.ymax]
      : null
  if (
    bounds?.length !== 4 ||
    bounds.some(n => typeof n !== 'number' || !Number.isFinite(n))
  )
    return null
  const [west, south, east, north] = bounds as [number, number, number, number]
  if (
    west > east ||
    south > north ||
    Math.abs(west) > 180 ||
    Math.abs(east) > 180 ||
    Math.abs(south) > 90 ||
    Math.abs(north) > 90
  )
    return null
  return [west, south, east, north]
}
