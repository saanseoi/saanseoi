import { unzipSync, type UnzipFileInfo } from 'fflate'

const MAX_SELECTED_ENTRY_BYTES = 256 * 1024 * 1024
const MAX_SELECTED_TOTAL_BYTES = 512 * 1024 * 1024
const MAX_ZIP_ENTRIES = 1_000

/** Extract only required entries while bounding archive expansion. */
export function unzipSelected(
  bytes: Uint8Array,
  select: (entry: UnzipFileInfo) => boolean,
) {
  let entryCount = 0
  let selectedBytes = 0
  return unzipSync(bytes, {
    filter(entry) {
      entryCount += 1
      if (entryCount > MAX_ZIP_ENTRIES) {
        throw new Error(`Source archive exceeds ${MAX_ZIP_ENTRIES} entries.`)
      }
      if (!select(entry)) return false
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize < 0) {
        throw new Error(`Source archive entry ${entry.name} has an invalid size.`)
      }
      if (entry.originalSize > MAX_SELECTED_ENTRY_BYTES) {
        throw new Error(
          `Source archive entry ${entry.name} exceeds ${MAX_SELECTED_ENTRY_BYTES} bytes uncompressed.`,
        )
      }
      selectedBytes += entry.originalSize
      if (selectedBytes > MAX_SELECTED_TOTAL_BYTES) {
        throw new Error(
          `Selected source archive entries exceed ${MAX_SELECTED_TOTAL_BYTES} bytes uncompressed.`,
        )
      }
      return true
    },
  })
}
