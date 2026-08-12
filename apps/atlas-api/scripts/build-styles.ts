import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createMapStyleFragment, mapStyleDefinitions } from '@repo/basemap'

const outputDirectory = resolve(import.meta.dir, '../dist/styles')

for (const style of mapStyleDefinitions) {
  const directory = resolve(outputDirectory, style.id)
  await mkdir(directory, { recursive: true })
  await writeFile(
    resolve(directory, `${style.version}.json`),
    `${JSON.stringify(createMapStyleFragment(style.id), null, 2)}\n`,
  )
}
