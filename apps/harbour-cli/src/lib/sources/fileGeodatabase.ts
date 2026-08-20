import fgdb from 'fgdb'

import { assertSafeZipArchive } from './zipArchive.ts'

/**
 * Validate ZIP metadata before the legacy FileGDB parser decompresses it. This
 * blocks traversal/prototype keys and bounds expansion while retaining the
 * parser's proven handling of publisher GDB tables.
 */
export function assertSafeFileGeodatabaseArchive(archiveBytes: Uint8Array) {
  assertSafeZipArchive(archiveBytes)
}

export async function readFileGeodatabaseArchive(archiveBytes: Uint8Array) {
  assertSafeFileGeodatabaseArchive(archiveBytes)
  return fgdb(Uint8Array.from(archiveBytes))
}
