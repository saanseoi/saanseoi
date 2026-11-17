// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Hong Kong GeoCode for HK1980 grid coordinates (EPSG:2326).
 * Specification: https://www.landsd.gov.hk/en/survey-mapping/hkgcode.html
 * Reworked by SaanSeoi from the initial Apache-2.0 reference adaptation:
 * direct cell arithmetic, strict runtime validation and a minimal public interface.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ORIGIN = 800_000
const CELL_SIZES = { 2: 2000, 4: 100, 6: 5 } as const

export type CodeLength = keyof typeof CELL_SIZES
export interface CellOrigin {
  easting: number
  northing: number
  cellSize: 2000 | 100 | 5
}

export class HKGeoCodeError extends RangeError {
  constructor(message: string) {
    super(message)
    this.name = 'HKGeoCodeError'
  }
}

/** Checks the supported precision.
 * @param length Candidate code length.
 * @returns Whether the length denotes a supported grid level.
 */
function isCodeLength(length: number): length is CodeLength {
  return length === 2 || length === 4 || length === 6
}

/** Encodes a Hong Kong grid coordinate.
 * @param easting HK1980 easting in metres.
 * @param northing HK1980 northing in metres.
 * @param length Code length, default 6 (5 metre cells).
 * @returns The containing cell's HKGCode.
 * @remarks Coverage is half-open: E [800000,864000), N [800000,848000).
 * Coordinates must be finite. Inputs are not rounded across cell boundaries.
 */
export function hk80ToHkgeocode(
  easting: number,
  northing: number,
  length: CodeLength = 6,
): string {
  if (!isCodeLength(length)) throw new HKGeoCodeError('length must be 2, 4 or 6')
  if (!Number.isFinite(easting) || !Number.isFinite(northing))
    throw new HKGeoCodeError('coordinates must be finite numbers')
  if (
    easting < ORIGIN ||
    easting >= 864_000 ||
    northing < ORIGIN ||
    northing >= 848_000
  )
    throw new HKGeoCodeError('coordinates are outside HKGeoCode coverage')

  // Each character pair identifies easting then northing at a finer grid level.
  const east = easting - ORIGIN
  const north = northing - ORIGIN
  const region = ALPHABET[Math.floor(east / 2000)] + ALPHABET[Math.floor(north / 2000)]
  if (length === 2) return region
  const site =
    ALPHABET[Math.floor((east % 2000) / 100)] +
    ALPHABET[Math.floor((north % 2000) / 100)]
  if (length === 4) return region + site
  return (
    region +
    site +
    ALPHABET[Math.floor((east % 100) / 5)] +
    ALPHABET[Math.floor((north % 100) / 5)]
  )
}

/** Decodes a cell to its southwest origin and size.
 * @param code HKGCode at any supported precision; case and outer whitespace are ignored.
 * @returns Southwest coordinates and cell width in metres, not a point address.
 * @remarks Rejects invalid characters and impossible spatial indices. The northeast
 * coverage limit is ZQKKKK, despite ZZKKKK appearing in the official pseudocode.
 */
export function hkgeocodeCellOrigin(code: string): CellOrigin {
  if (typeof code !== 'string') throw new HKGeoCodeError('code must be a string')
  const normalised = code.trim().toUpperCase()
  const length = normalised.length
  if (!isCodeLength(length))
    throw new HKGeoCodeError('code must contain 2, 4 or 6 characters')
  const indices = Array.from(normalised, character => ALPHABET.indexOf(character))
  if (
    indices.some(
      (index, position) =>
        index < 0 || index >= (position === 0 ? 32 : position === 1 ? 24 : 20),
    )
  )
    throw new HKGeoCodeError('code contains an invalid grid index')

  // Sum the offsets from the shared southwest origin at every represented level.
  return {
    easting:
      ORIGIN + indices[0] * 2000 + (indices[2] ?? 0) * 100 + (indices[4] ?? 0) * 5,
    northing:
      ORIGIN + indices[1] * 2000 + (indices[3] ?? 0) * 100 + (indices[5] ?? 0) * 5,
    cellSize: CELL_SIZES[length],
  }
}
