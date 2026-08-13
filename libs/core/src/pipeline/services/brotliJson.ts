import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

// This preserves the exact C&SD geometry below D1's 2 MB row limit without
// making the Worker spend upload-time CPU on maximum-density compression.
const BROTLI_QUALITY = 6
export const MAX_BROTLI_QUALITY = 11

export function compressJsonBrotli(
  value: unknown,
  quality: number = BROTLI_QUALITY,
): Uint8Array {
  const json = JSON.stringify(value)
  if (json === undefined) {
    throw new TypeError('Value cannot be serialized as JSON')
  }

  return brotliCompressSync(json, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: quality,
    },
  })
}

export function decompressJsonBrotli(value: ArrayBuffer | Uint8Array): unknown {
  return JSON.parse(brotliDecompressSync(value).toString('utf8')) as unknown
}
