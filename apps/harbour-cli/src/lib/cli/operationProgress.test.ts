import { describe, expect, test } from 'bun:test'

describe('OperationProgress', () => {
  test('keeps counted substage frames within the piped terminal width without extra guides', () => {
    const source = `
      import { OperationProgress } from ${JSON.stringify(`${import.meta.dir}/operationProgress.ts`)};
      const progress = new OperationProgress();
      progress.beginPhase('Materialise divisionArea', {});
      for (const label of ['write current rows', 'write history rows']) {
        progress.update(0, { max: 18, reset: true, label: 'Materialise ' + label + ' 界'.repeat(30) });
        await Bun.sleep(180);
        progress.update(18);
      }
      progress.complete('Materialise complete');
    `
    const result = Bun.spawnSync([process.execPath, '--eval', source], {
      env: {
        ...process.env,
        SAANSEOI_TERMINAL_INTERACTIVE: '1',
        SAANSEOI_TERMINAL_COLUMNS: '60',
        TERM: 'xterm-256color',
        CI: 'false',
        FORCE_COLOR: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    expect(result.exitCode).toBe(0)
    const output = result.stdout.toString()
    const plain = Bun.stripANSI(output)
    expect(plain.split('\n')).toHaveLength(3)
    expect(plain).toContain('Materialise complete')
    const frames = output.split('\u001b[1G\u001b[J').slice(1)
    expect(frames.length).toBeGreaterThan(1)
    for (const frame of frames) {
      expect(Bun.stringWidth(Bun.stripANSI(frame).trim())).toBeLessThan(60)
    }
  })

  test('redraws through the terminal logging pipe and keeps non-interactive output static', () => {
    const source = `
      import { OperationProgress } from ${JSON.stringify(`${import.meta.dir}/operationProgress.ts`)};
      const progress = new OperationProgress();
      progress.beginPhase('Normalise records (0/10)', { max: 10 });
      await Bun.sleep(120);
      progress.update(10, { label: 'Normalise records (10/10)' });
      await Bun.sleep(120);
      progress.complete('Normalise records complete');
    `
    for (const mode of [
      { interactive: '1', term: 'xterm-256color', ci: 'false', animated: true },
      { interactive: '', term: 'xterm-256color', ci: 'false', animated: false },
      { interactive: '1', term: 'dumb', ci: 'false', animated: false },
      { interactive: '1', term: 'xterm-256color', ci: 'true', animated: false },
    ]) {
      const result = Bun.spawnSync([process.execPath, '--eval', source], {
        env: {
          ...process.env,
          SAANSEOI_TERMINAL_INTERACTIVE: mode.interactive,
          TERM: mode.term,
          CI: mode.ci,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      expect(result.exitCode).toBe(0)
      const output = result.stdout.toString()
      expect(output).toContain('Normalise records complete')
      expect(output.includes('\u001b[1G\u001b[J')).toBe(mode.animated)
    }
  })

  test('includes the underlying error in a failed phase label', async () => {
    const stoppedLabels: string[] = []
    const rendererKinds: string[] = []
    const staticLabels: Array<[string, string]> = []
    const createRenderer = (kind: string) => {
      rendererKinds.push(kind)
      return {
        isCancelled: false,
        cancel() {},
        advance() {},
        clear() {},
        message() {},
        start() {},
        error(label: string) {
          stoppedLabels.push(label)
        },
        stop() {},
      }
    }
    const ui = {
      progress() {
        return createRenderer('progress')
      },
      spinner() {
        return createRenderer('spinner')
      },
      log: {
        error(label: string) {
          staticLabels.push(['error', label])
        },
        step(label: string) {
          staticLabels.push(['step', label])
        },
        success(label: string) {
          staticLabels.push(['success', label])
        },
      },
    }

    const { OperationProgress } = await import('./operationProgress.ts')
    const progress = new OperationProgress({ renderAnimated: true, ui })
    progress.beginPhase('Calculate release statistics', {})
    progress.fail(new Error('database is locked'))

    expect(stoppedLabels).toEqual([
      'Failed during Calculate release statistics: database is locked',
    ])
    expect(rendererKinds).toEqual(['spinner'])

    const staticProgress = new OperationProgress({ renderAnimated: false, ui })
    staticProgress.beginPhase('Normalise records', { max: null })
    staticProgress.update(1, {
      label: 'Normalise records (182,441)',
      max: 182_441,
      reset: true,
    })
    staticProgress.complete('Normalise records (182,441) (7.32 s)')

    expect(staticLabels).toEqual([
      ['step', 'Normalise records'],
      ['success', 'Normalise records (182,441) (7.32 s)'],
    ])
    expect(staticProgress.hasActivePhase()).toBe(false)

    const compactLabelsStart = staticLabels.length
    const compactProgress = new OperationProgress({
      ui,
      compact: true,
      renderAnimated: false,
    })
    compactProgress.beginPhase('Prepare workspace', {})
    compactProgress.beginPhase('Read Places (0/10)', { current: 0, max: 10 })
    compactProgress.update(10, { label: 'Read Places (10/10)' })
    compactProgress.complete('Read Places complete')
    compactProgress.finish('Places processing complete')

    expect(staticLabels.slice(compactLabelsStart)).toEqual([
      ['success', 'Places processing complete'],
    ])
  })
})
