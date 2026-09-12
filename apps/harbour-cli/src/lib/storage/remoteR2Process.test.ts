import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startR2Process } from './remoteR2Process.ts'

async function fixture(script: string) {
  const directory = await mkdtemp(join(tmpdir(), 'r2-process-test-'))
  const workerPath = join(directory, 'worker.mjs')
  await writeFile(
    workerPath,
    `
    import { readFileSync, readdirSync, rmSync, writeSync } from 'node:fs';
    const requestDirectory = process.argv[3];
    const send = value => writeSync(3, JSON.stringify(value)+'\\n');
    let receiveRequest;
    const receive = callback => { receiveRequest = callback; };
    setInterval(() => {
      if (!receiveRequest) return;
      for (const name of readdirSync(requestDirectory).sort()) {
        if (!name.endsWith('.json')) continue;
        const path = requestDirectory + '/' + name;
        const request = JSON.parse(readFileSync(path, 'utf8'));
        rmSync(path, {force:true});
        receiveRequest(request);
      }
    }, 10);
    ${script}
  `,
  )
  return { workerPath, close: () => rm(directory, { recursive: true, force: true }) }
}

test('Bun sends sequential work to one persistent Node process', async () => {
  const f = await fixture(`
    if (process.versions.bun) throw new Error('Worker must run under Node');
    let count = 0;
    receive( r => {
      send({type:'progress', id:r.id, operation:'request '+(++count)});
      send({type:'done', id:r.id});
    });
    send({type:'ready'});
  `)
  const progress: string[] = []
  const client = startR2Process('unused', {
    workerPath: f.workerPath,
    onProgress: message => progress.push(message),
  })
  try {
    await client.ready
    await Promise.all(
      ['first', 'second', 'third'].map(key =>
        client.retain(key, '/unused', { contentType: 'application/json' }),
      ),
    )
    expect(progress).toEqual([
      'R2 request 1: first',
      'R2 request 2: second',
      'R2 request 3: third',
    ])
  } finally {
    await client.dispose()
    await f.close()
  }
})

test('startup timeout rejects and shutdown does not wait for a hung proxy', async () => {
  const f = await fixture('setInterval(() => {}, 1000)')
  const client = startR2Process('unused', {
    workerPath: f.workerPath,
    startupTimeoutMs: 100,
  })
  try {
    await expect(client.ready).rejects.toThrow('connection timed out')
  } finally {
    await client.dispose()
    await f.close()
  }
})

test('source-file IPC retains the file path and active progress renews its idle deadline', async () => {
  const f = await fixture(`
    receive(r => {
      if (!r.sourceFile || r.path !== '/retained/source.zip') throw new Error('Missing file transfer contract');
      const progress = setInterval(() => send({type:'progress', id:r.id, operation:'verifying chunk'}), 50);
      setTimeout(() => { clearInterval(progress); send({type:'done', id:r.id}); }, 650);
    });
    send({type:'ready'});
  `)
  const client = startR2Process('unused', {
    workerPath: f.workerPath,
    requestTimeoutMs: 250,
  })
  try {
    await client.ready
    await client.retain(
      'source/key',
      '/retained/source.zip',
      { contentType: 'application/zip' },
      { sourceFile: true },
    )
  } finally {
    await client.dispose()
    await f.close()
  }
})

test('hung R2 request includes object and operation and stops queued requests', async () => {
  const f = await fixture(`
    receive( r => send({type:'progress',id:r.id,operation:'uploading'}));
    send({type:'ready'});
  `)
  const client = startR2Process('unused', {
    workerPath: f.workerPath,
    requestTimeoutMs: 100,
  })
  try {
    await client.ready
    const outcomes = await Promise.allSettled([
      client.retain('source/key', '/unused', { contentType: 'text/plain' }),
      client.retain('next/key', '/unused', { contentType: 'text/plain' }),
    ])
    expect(outcomes[0]?.status).toBe('rejected')
    if (outcomes[0]?.status === 'rejected')
      expect(outcomes[0].reason.message).toContain(
        'R2 uploading timed out for source/key',
      )
    expect(outcomes[1]).toMatchObject({ status: 'rejected' })
  } finally {
    await client.dispose()
    await f.close()
  }
})

test('worker death rejects in-flight requests without waiting for deadline', async () => {
  const f = await fixture(`receive( () => process.exit(7)); send({type:'ready'});`)
  const client = startR2Process('unused', { workerPath: f.workerPath })
  try {
    await client.ready
    await expect(
      client.retain('key', '/unused', { contentType: 'text/plain' }),
    ).rejects.toThrow('adapter exited (7)')
  } finally {
    await client.dispose()
    await f.close()
  }
})
