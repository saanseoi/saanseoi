// SPDX-License-Identifier: GPL-3.0-or-later
// PROJECTION
import proj4 from 'proj4'
// GRID
import { HKGeoCodeError, hk80ToHkgeocode } from './grid.js'
// TYPES
import type { CodeLength } from './grid.js'

const RADIANS = Math.PI / 180
const ARCSECONDS = RADIANS / 3600
const WGS84_ECCENTRICITY_SQUARED = (1 / 298.2572235634) * (2 - 1 / 298.2572235634)
const HK1980_ECCENTRICITY_SQUARED = (1 / 297) * (2 - 1 / 297)
const HK1980 =
  '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +units=m +no_defs'

/** Applies the published ITRF96-to-HK1980 transformation and map projection.
 * @param longitude Decimal degrees in the API's ITRF96 reference frame.
 * @param latitude Decimal degrees in the API's ITRF96 reference frame.
 * @returns HK1980 easting and northing in metres, without display rounding.
 * @remarks Uses LandsD 7P_ITRF96_HK80_V1.0 forward parameters and coordinate-frame
 * rotation signs. Inverting the separately rounded reverse parameters produces
 * sub-millimetre differences which can change a code at a cell boundary.
 */
function projectItrf96(longitude: number, latitude: number): [number, number] {
  const phi = latitude * RADIANS
  const lambda = longitude * RADIANS
  const sinPhi = Math.sin(phi)
  const radius = 6378137 / Math.sqrt(1 - WGS84_ECCENTRICITY_SQUARED * sinPhi ** 2)
  // Geographic inputs have no ellipsoidal height, matching the API's 2D conversion.
  const x = radius * Math.cos(phi) * Math.cos(lambda)
  const y = radius * Math.cos(phi) * Math.sin(lambda)
  const z = radius * (1 - WGS84_ECCENTRICITY_SQUARED) * sinPhi

  // Apply the official forward matrix directly, rather than inverse +towgs84 parameters.
  const scale = 1 + 1.094239e-6
  const rx = 0.067741 * ARCSECONDS
  const ry = -2.243649 * ARCSECONDS
  const rz = -1.158827 * ARCSECONDS
  const eastCartesian = 162.619 + scale * x + rz * y - ry * z
  const northCartesian = 276.961 - rz * x + scale * y + rx * z
  const polarCartesian = 161.763 + ry * x - rx * y + scale * z

  // Recover latitude on the International 1910 ellipsoid before map projection.
  const distance = Math.hypot(eastCartesian, northCartesian)
  let hkLatitude = Math.atan2(
    polarCartesian,
    distance * (1 - HK1980_ECCENTRICITY_SQUARED),
  )
  for (let iteration = 0; iteration < 10; iteration++) {
    const hkRadius =
      6378388 / Math.sqrt(1 - HK1980_ECCENTRICITY_SQUARED * Math.sin(hkLatitude) ** 2)
    hkLatitude = Math.atan2(
      polarCartesian + HK1980_ECCENTRICITY_SQUARED * hkRadius * Math.sin(hkLatitude),
      distance,
    )
  }
  const hkLongitude = Math.atan2(northCartesian, eastCartesian)
  const [easting, northing] = proj4('+proj=longlat +ellps=intl +no_defs', HK1980, [
    hkLongitude / RADIANS,
    hkLatitude / RADIANS,
  ])
  return [easting, northing]
}

/** Encodes geographic coordinates without network access.
 * @param coordinates Longitude, latitude in decimal degrees (GeoJSON order).
 * @param length Code length: 2 (2 km), 4 (100 m), or 6 (5 m).
 * @returns The containing Hong Kong GeoCode cell.
 * @remarks Uses the official API's ITRF96 (epoch 1998:121) convention for geographic
 * input. Does not perform epoch conversion of modern GNSS observations or improve
 * input position accuracy. Throws for invalid coordinates or points outside coverage.
 */
export function wgs84ToHkgcode(
  coordinates: readonly [number, number],
  length: CodeLength = 6,
): string {
  if (!Array.isArray(coordinates) || coordinates.length !== 2)
    throw new HKGeoCodeError('coordinates must be a longitude and latitude pair')
  const [longitude, latitude] = coordinates
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  )
    throw new HKGeoCodeError('coordinates must be finite WGS84 longitude and latitude')
  // Match the API geographic input limits before checking the HKGCode grid rectangle.
  if (longitude < 113.82 || longitude > 114.48 || latitude < 22.13 || latitude > 22.57)
    throw new HKGeoCodeError('coordinates are outside HKGeoCode coverage')
  const [easting, northing] = projectItrf96(longitude, latitude)
  return hk80ToHkgeocode(easting, northing, length)
}
