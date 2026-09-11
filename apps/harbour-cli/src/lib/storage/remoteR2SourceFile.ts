import {
  completeSourceAssetTransfer,
  cleanupSourceAssetTransfer,
  hasSourceAssetPart,
  hasVerifiedSourceObject,
  putSourceAssetPart,
  sourceAssetScope,
  type SourceAssetStore,
} from '../../../../../libs/core/src/lib/services/sourceAssetTransfer.ts'
import { inspectSourceAssetFile, readSourceAssetFilePart } from './sourceAssetFile.ts'
import type { R2Metadata } from './remoteR2Object.ts'

/** R2-only transfer. This module has no metadata database capability. */
export async function retainSourceFileInBucket(
  store: SourceAssetStore,
  key: string,
  path: string,
  metadata: R2Metadata,
  progress: (operation: string) => void = () => {},
) {
  progress('hashing source file')
  const file = await inspectSourceAssetFile(path, (bytes, total) =>
    progress(`hashing source file ${bytes}/${total} bytes`),
  )
  if (
    !key.startsWith('by-source/') ||
    !key.split('/').at(-1)?.startsWith(`${file.sha256}-`)
  )
    throw new Error('Source file does not match its immutable object key.')
  if (await hasVerifiedSourceObject(store, key, file.sha256, file.byteLength)) return
  const scope = sourceAssetScope(key)
  for (const [index, part] of file.parts.entries()) {
    progress(`retaining chunk ${index + 1}/${file.parts.length}`)
    if (await hasSourceAssetPart(store, scope, part)) continue
    const bytes = await readSourceAssetFilePart(path, index, part)
    await putSourceAssetPart(store, scope, part.sha256, new Response(bytes).body)
  }
  await completeSourceAssetTransfer(
    store,
    {
      assetKey: key,
      byteLength: file.byteLength,
      contentHash: file.sha256,
      parts: file.parts,
      mediaType: metadata.contentType,
      fileName: key.split('/').at(-1) ?? 'source.bin',
      role: 'sourceArchive',
    },
    progress,
  )
  await cleanupSourceAssetTransfer(store, key, file.parts).catch(() => {})
}
