import { brotliCompressSync, brotliDecompressSync, constants } from 'node:zlib'

// This preserves the exact C&SD geometry below D1's 2 MB row limit without
// making the Worker spend upload-time CPU on maximum-density compression.
const BROTLI_QUALITY = 6

export function compressJsonBrotli(value: unknown): Uint8Array {
  return brotliCompressSync(JSON.stringify(value), {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
    },
  })
}

export function decompressJsonBrotli(value: ArrayBuffer | Uint8Array): unknown {
  return JSON.parse(brotliDecompressSync(value).toString('utf8')) as unknown
}
