import { readFile } from 'node:fs/promises'

/** Wrangler accepts comments and trailing commas in its JSONC configuration. */
export async function readDeploymentConfig(path: string) {
  return Bun.JSON5.parse(await readFile(path, 'utf8'))
}
