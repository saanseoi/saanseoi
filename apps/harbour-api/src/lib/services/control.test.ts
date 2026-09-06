import { afterEach } from 'bun:test'
import { rmSync } from 'node:fs'
import { tempDirs } from './controlFixtures.fixtures.ts'
import './controlStatistics.cases.ts'
import './controlPublication.cases.ts'
import './controlStages.cases.ts'
import './controlProvenance.cases.ts'
import './controlReconciliation.cases.ts'

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()

    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})
