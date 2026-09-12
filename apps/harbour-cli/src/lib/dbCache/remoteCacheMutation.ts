import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function withRemoteCacheMutation<T>(
  cacheDir: string,
  reason: string,
  operation: () => Promise<T>,
): Promise<T> {
  const marker = join(cacheDir, 'invalidated.json')
  // Readers already reject this marker; it must survive termination between remote writes and replay.
  await writeFile(
    marker,
    JSON.stringify({ invalidatedAt: new Date().toISOString(), reason }),
    {
      flag: 'wx',
    },
  )
  const result = await operation()
  await rm(marker)
  return result
}
