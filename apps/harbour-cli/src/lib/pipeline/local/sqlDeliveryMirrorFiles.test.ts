import { expect, test } from 'bun:test'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { acknowledgeSqlDeliveryMirrorFiles } from './sqlDeliveryMirrorFiles.ts'
import { prepareSqlDelivery, sha256 } from './sqlDeliveryFiles.ts'

test('all retained mirror files verify across plans before any baseline is promoted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'acknowledged-mirrors-'))
  try {
    await writeFile(join(root, 'existing.json'), 'old')
    const plans = []
    for (const [index, mirrorFile] of ['existing.json', 'new.json'].entries()) {
      const directory = join(root, `plan-${index}`)
      const bytes = `membership-${index}`
      const plan = await prepareSqlDelivery(
        directory,
        {
          environment: 'local',
          releaseId: 'release',
          phase: `${index}`,
          inputs: {},
          cacheDir: root,
          cachePreparedAt: 'fixed',
        },
        async () => {
          await writeFile(join(directory, 'membership.json'), bytes)
          return {
            acknowledgedMirrorFiles: [
              { file: 'membership.json', mirrorFile, sha256: sha256(bytes) },
            ],
          }
        },
      )
      plans.push({ directory, plan })
    }
    const second = join(root, 'plan-1', 'membership.json')
    for (const corrupt of [false, true]) {
      if (corrupt) await writeFile(second, 'corrupt')
      else await rm(second)
      await expect(acknowledgeSqlDeliveryMirrorFiles(plans)).rejects.toThrow()
      expect(await readFile(join(root, 'existing.json'), 'utf8')).toBe('old')
      await expect(readFile(join(root, 'new.json'))).rejects.toThrow('ENOENT')
    }
    await writeFile(second, 'membership-1')
    await acknowledgeSqlDeliveryMirrorFiles(plans)
    await acknowledgeSqlDeliveryMirrorFiles(plans)
    expect(await readFile(join(root, 'existing.json'), 'utf8')).toBe('membership-0')
    expect(await readFile(join(root, 'new.json'), 'utf8')).toBe('membership-1')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('mirror metadata rejects malformed, conflicting and redirected destinations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'acknowledged-mirror-validation-'))
  try {
    const directory = join(root, 'plan')
    const plan = await prepareSqlDelivery(
      directory,
      {
        environment: 'local',
        releaseId: 'release',
        phase: 'data',
        inputs: {},
        cacheDir: root,
        cachePreparedAt: 'fixed',
      },
      async () => {},
    )
    await writeFile(join(directory, 'membership.json'), 'membership')
    const valid = {
      file: 'membership.json',
      mirrorFile: 'mirror.json',
      sha256: sha256('membership'),
    }
    for (const value of [
      null,
      {},
      { ...valid, file: '../membership.json' },
      { ...valid, mirrorFile: '/tmp/mirror.json' },
      { ...valid, sha256: 'invalid' },
    ]) {
      await expect(
        acknowledgeSqlDeliveryMirrorFiles([
          {
            directory,
            plan: { ...plan, outputs: { acknowledgedMirrorFiles: [value] } },
          },
        ]),
      ).rejects.toThrow('Invalid')
    }
    await writeFile(join(directory, 'other.json'), 'other')
    await expect(
      acknowledgeSqlDeliveryMirrorFiles([
        {
          directory,
          plan: {
            ...plan,
            outputs: {
              acknowledgedMirrorFiles: [
                valid,
                { ...valid, file: 'other.json', sha256: sha256('other') },
              ],
            },
          },
        },
      ]),
    ).rejects.toThrow('Conflicting')
    await mkdir(join(root, 'elsewhere'))
    await symlink(join(root, 'elsewhere'), join(root, 'redirect'))
    await expect(
      acknowledgeSqlDeliveryMirrorFiles([
        {
          directory,
          plan: {
            ...plan,
            outputs: {
              acknowledgedMirrorFiles: [
                { ...valid, mirrorFile: 'redirect/mirror.json' },
              ],
            },
          },
        },
      ]),
    ).rejects.toThrow('symlinks')
    await expect(readFile(join(root, 'mirror.json'))).rejects.toThrow('ENOENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
