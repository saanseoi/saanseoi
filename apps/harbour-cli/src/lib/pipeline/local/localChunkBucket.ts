import { LocalPipelineBucket } from './localBucket.ts'

/** One bounded chunk owns its intermediate objects; raw data and SQL stay on disk. */
export class LocalChunkBucket extends LocalPipelineBucket {
  private readonly artefacts = new Map<string, unknown>()

  async getJsonArtefact<T>(key: string): Promise<T> {
    if (!this.artefacts.has(key)) throw new Error(`Missing chunk artefact: ${key}`)
    return this.artefacts.get(key) as T
  }

  async putJsonArtefact<T>(key: string, value: T) {
    this.artefacts.set(key, value)
  }

  clear() {
    this.artefacts.clear()
  }
}
