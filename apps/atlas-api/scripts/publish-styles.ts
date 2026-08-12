import { resolve } from 'node:path'

import { mapStyleDefinitions } from '@repo/basemap'

const bucket = process.argv[2]
if (!bucket) throw new Error('Pass the destination R2 bucket name.')

const stylesDirectory = resolve(import.meta.dir, '../dist/styles')
const wrangler = resolve(import.meta.dir, '../../../node_modules/.bin/wrangler')
for (const style of mapStyleDefinitions) {
  const command = Bun.spawn(
    [
      wrangler,
      'r2',
      'object',
      'put',
      `${bucket}/styles/${style.id}/${style.version}.json`,
      '--remote',
      '--file',
      resolve(stylesDirectory, style.id, `${style.version}.json`),
      '--content-type',
      'application/json',
    ],
    {
      cwd: resolve(import.meta.dir, '..'),
      stderr: 'inherit',
      stdout: 'inherit',
    },
  )
  if ((await command.exited) !== 0)
    throw new Error(`Could not publish the ${style.id} map style.`)
}
