import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LocalPipelineBucket } from '../../../apps/harbour-cli/src/lib/pipeline/local/localBucket'
import {
  retainLocalR2Object,
  disposeRemoteR2,
} from '../../../apps/harbour-cli/src/lib/storage/remoteR2'
import type { ProvenanceStore } from '../../core/src/provenance/types'

/** Staging is temporary; returned references may be committed only after deliver(). */
export function stageLocalLineageObjects() {
  const root = mkdtempSync(join(tmpdir(), 'saanseoi-lineage-r2-'))
  const bucket = new LocalPipelineBucket(root)
  const keys = new Set<string>()
  const store: ProvenanceStore = {
    get: key => bucket.get(key),
    async put(key, bytes) {
      const path = join(root, 'objects', key)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, new Uint8Array(bytes))
      keys.add(key)
    },
  }
  return {
    store,
    async deliver() {
      let retained = 0
      for (const key of keys) {
        await retainLocalR2Object(key, readFileSync(join(root, 'objects', key)), {
          contentType: 'application/json',
        })
        retained++
        if (retained % 20 === 0)
          console.log(`Verified ${retained}/${keys.size} lineage R2 objects`)
      }
      return keys.size
    },
    async dispose() {
      await disposeRemoteR2()
      rmSync(root, { recursive: true, force: true })
    },
  }
}
