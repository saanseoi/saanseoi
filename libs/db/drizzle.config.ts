import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'drizzle-kit'

const configDir = dirname(fileURLToPath(import.meta.url))
const localD1Dir = join(
  configDir,
  '../../.local/d1/dev/v3/d1/miniflare-D1DatabaseObject',
)

const localD1SqlitePath = existsSync(localD1Dir)
  ? readdirSync(localD1Dir)
      .filter((file) => file.endsWith('.sqlite') && file !== 'metadata.sqlite')
      .map((file) => join(localD1Dir, file))
      .sort()
      .at(0)
  : undefined

export default defineConfig({
  dialect: 'sqlite',
  dbCredentials: {
    url: localD1SqlitePath ?? join(localD1Dir, 'local.sqlite'),
  },
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
})
