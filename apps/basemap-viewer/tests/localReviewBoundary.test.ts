import { describe, expect, it } from 'vitest'
import { build } from 'vite'
import { resolve } from 'node:path'
import { localReviewBoundary } from '../localReviewBoundary'

describe('deployment boundary', () => {
  for (const mode of ['preview', 'production']) {
    it(`rejects the editor as a ${mode} build entry`, async () => {
      await expect(
        build({
          configFile: false,
          mode,
          logLevel: 'silent',
          plugins: [localReviewBoundary()],
          build: {
            write: false,
            rolldownOptions: {
              input: resolve(
                '../harbour-app/src/tools/division-areas/layerControls.ts',
              ),
            },
          },
        }),
      ).rejects.toThrow('Local division review files cannot be included')
    })
  }
})
