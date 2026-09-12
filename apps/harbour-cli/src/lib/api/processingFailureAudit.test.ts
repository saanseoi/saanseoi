import { expect, spyOn, test } from 'bun:test'
import { ProcessingGuardError, type ProvenanceStore } from '@repo/core/provenance'
import { retainProcessingFailure } from './processingFailureAudit'

test('audit delivery failure retains the guard and lets the caller mark its stage failed', async () => {
  const objects = new Map<string, ArrayBuffer>()
  const store: ProvenanceStore = {
    async get(key) {
      const bytes = objects.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      objects.set(key, bytes)
    },
  }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'audit storage unavailable' }), {
      status: 400,
    }),
  )
  const warn = spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const error = new ProcessingGuardError('Invalid hierarchy', [
      {
        id: 'hierarchy',
        summary: 'Validate hierarchy',
        consequence: 'block-ingestion',
        status: 'failed',
        checked: 1,
        failed: 1,
        reason: 'Invalid hierarchy',
      },
    ])
    await retainProcessingFailure({
      error,
      store,
      target: { remote: false, environment: 'dev' },
      releaseId: 'release',
      datasetCode: 'dataset',
    })
    expect(objects.size).toBeGreaterThan(0)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid hierarchy'))
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('audit storage unavailable'),
    )
  } finally {
    fetch.mockRestore()
    warn.mockRestore()
  }
})
