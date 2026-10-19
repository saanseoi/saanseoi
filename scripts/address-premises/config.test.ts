import { expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { readDeploymentConfig } from './config'

test('reads every maintenance service configuration, including JSONC comments', async () => {
  for (const service of ['atlas-api', 'harbour-api', 'harbour-workers']) {
    const config = await readDeploymentConfig(
      resolve(import.meta.dir, `../../apps/${service}/wrangler.jsonc`),
    )
    for (const environment of ['preview', 'production']) {
      const settings = config.env[environment]
      expect(settings.name).toBeString()
      if (service === 'harbour-workers')
        expect(settings.queues.consumers.length).toBeGreaterThan(0)
      else
        expect(
          settings.routes.some(
            (route: { custom_domain?: boolean }) => route.custom_domain,
          ),
        ).toBe(true)
    }
  }
})
