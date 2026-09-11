import { expect, test } from 'bun:test'
import { resolve } from 'node:path'

test('a failed nested CLI command closes its guide after the error', () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      resolve(import.meta.dir, '../../cli.ts'),
      'init:addresses:saanseoi',
      '--invalid-option',
    ],
    {
      env: {
        ...process.env,
        SAANSEOI_INIT_GUIDES: '0,4',
        SAANSEOI_INIT_COMMAND: 'init:addresses',
        SAANSEOI_INIT_RELEASE_CODE: '',
        NO_COLOR: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  expect(result.exitCode).toBe(1)
  const output = Bun.stripANSI(result.stdout.toString())
  expect(output).toContain('accepts only')
  expect(output.trimEnd().endsWith('│   ├───╯')).toBe(true)
})

test('parent failures retain one child error and still record unreported failures', () => {
  for (const reported of [true, false]) {
    const source = `
      import { runInitialisationCommand } from ${JSON.stringify(`${import.meta.dir}/init.ts`)};
      import { recordInitialisationSummaryEvent } from ${JSON.stringify(`${import.meta.dir}/initialisationSummary.ts`)};
      delete process.env.SAANSEOI_INIT_SUMMARY_PATH;
      Bun.spawn = options => ({
        pid: 0,
        kill() {},
        exited: (async () => {
          if (${reported}) await recordInitialisationSummaryEvent({
            command: 'init:addresses:saanseoi',
            message: 'Curation required',
            releaseCode: null,
            type: 'error',
          }, options.env.SAANSEOI_INIT_SUMMARY_PATH);
          return 1;
        })(),
      });
      try {
        await runInitialisationCommand({ command: 'init:addresses', options: { target: 'preview' }, positionals: [] }, () => {});
        process.exit(2);
      } catch (error) {
        if (error.message !== 'Initialisation failed with exit code 1.') throw error;
      }
    `
    const result = Bun.spawnSync([process.execPath, '--eval', source], {
      env: { ...process.env, NO_COLOR: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(result.exitCode).toBe(0)
    const output = Bun.stripANSI(result.stdout.toString())
    expect(output).toContain('INITIALISATION SUMMARY')
    if (reported) {
      expect(output).toContain('init:addresses:saanseoi: Curation required')
      expect(output).not.toContain('Initialisation failed with exit code')
    } else {
      expect(output).toContain('init:addresses: Initialisation failed with exit code 1')
    }
  }
})

test('accepts the boolean artefact-cache opt-out', () => {
  const source = `
    import { runInitialisationCommand } from ${JSON.stringify(`${import.meta.dir}/init.ts`)};
    Bun.spawn = options => {
      if (!options.cmd.includes('--no-cache-artefacts')) process.exit(2);
      if (options.env.SAANSEOI_CACHE_ARTEFACTS !== '0') process.exit(3);
      return { pid: 0, kill() {}, exited: Promise.resolve(0) };
    };
    await runInitialisationCommand({
      command: 'init',
      options: { 'no-cache-artefacts': true, target: 'preview' },
      positionals: [],
    }, () => {});
  `
  const result = Bun.spawnSync([process.execPath, '--eval', source], {
    env: { ...process.env, NO_COLOR: '1' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  expect(result.exitCode).toBe(0)
})
