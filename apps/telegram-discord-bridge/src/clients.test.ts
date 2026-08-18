import { expect, mock, test } from 'bun:test'

import { DiscordClient } from './discord.ts'
import { GitHubClient } from './github.ts'
import { TelegramClient } from './telegram.ts'

test('DiscordClient returns only messageable guild channels and active threads', async () => {
  await withFetchMock(
    async input => {
      const url = String(input)
      if (url.endsWith('/channels'))
        return Response.json([
          { id: 'text', type: 0 },
          { id: 'voice', type: 2 },
        ])
      if (url.endsWith('/threads/active'))
        return Response.json({ threads: [{ id: 'thread', type: 11 }] })
      throw new Error(`Unexpected Discord request: ${url}`)
    },
    async () => {
      const client = new DiscordClient('token', 'guild')
      expect(await client.listMessageChannels()).toEqual([
        { id: 'text', type: 0 },
        { id: 'thread', type: 11 },
      ])
    },
  )
})

test('TelegramClient formats and sends message text', async () => {
  const requests: Array<[Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]]> = []
  await withFetchMock(
    async (input, init) => {
      requests.push([input, init])
      return Response.json({ ok: true, result: { message_id: 42 } })
    },
    async () => {
      const client = new TelegramClient('token')
      expect(await client.sendText('chat', '**hello**')).toEqual([{ message_id: 42 }])
    },
  )

  const request = requests[0]
  expect(String(request?.[0])).toBe('https://api.telegram.org/bottoken/sendMessage')
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({
    chat_id: 'chat',
    link_preview_options: { is_disabled: true },
    parse_mode: 'HTML',
    text: '<b>hello</b>',
  })
})

test('TelegramClient retries rate limits and transient non-JSON failures', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(
      Response.json(
        { description: 'Too Many Requests', ok: false, parameters: { retry_after: 1 } },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(new Response('upstream failure', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 42 } }))
  const delayMock = mock(async () => undefined)
  const client = new TelegramClient('token', {
    delay: delayMock,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.sendText('chat', 'hello')).resolves.toEqual([{ message_id: 42 }])
  expect(fetchMock).toHaveBeenCalledTimes(3)
  expect(delayMock).toHaveBeenNthCalledWith(1, 1000)
  expect(delayMock).toHaveBeenNthCalledWith(2, 2000)
})

test('DiscordClient retries rate limits and server failures', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(Response.json({ retry_after: 0.25 }, { status: 429 }))
    .mockResolvedValueOnce(new Response('upstream failure', { status: 502 }))
    .mockResolvedValueOnce(Response.json([{ id: 'channel', type: 0 }]))
    .mockResolvedValueOnce(Response.json({ threads: [] }))
  const delayMock = mock(async () => undefined)
  const client = new DiscordClient('token', 'guild', {
    delay: delayMock,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.listMessageChannels()).resolves.toEqual([
    { id: 'channel', type: 0 },
  ])
  expect(fetchMock).toHaveBeenCalledTimes(4)
  expect(delayMock).toHaveBeenNthCalledWith(1, 250)
  expect(delayMock).toHaveBeenNthCalledWith(2, 2000)
})

test('DiscordClient rejects other HTTP errors without retrying', async () => {
  const fetchMock = mock().mockResolvedValue(new Response(null, { status: 401 }))
  const delayMock = mock(async () => undefined)
  const client = new DiscordClient('token', 'guild', {
    delay: delayMock,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.listMessageChannels()).rejects.toThrow(
    'Discord API returned HTTP 401 for /guilds/guild/channels.',
  )
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(delayMock).not.toHaveBeenCalled()
})

test('GitHubClient resolves the fixed target and creates a discussion', async () => {
  const privateKeyBase64 = await generatePrivateKeyBase64()
  const requests: Array<[Parameters<typeof fetch>[0], Parameters<typeof fetch>[1]]> = []
  await withFetchMock(
    async (input, init) => {
      requests.push([input, init])
      const url = String(input)
      if (url.endsWith('/access_tokens'))
        return Response.json({
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          token: 'installation-token',
        })

      const body = JSON.parse(String(init?.body)) as { query: string }
      if (body.query.includes('query DiscussionTarget'))
        return Response.json({
          data: {
            repository: {
              discussionCategories: {
                nodes: [{ id: 'category', slug: 'announcements' }],
              },
              id: 'repository',
            },
          },
        })
      return Response.json({
        data: {
          createDiscussion: { discussion: { url: 'https://example.com/1' } },
        },
      })
    },
    async () => {
      const client = new GitHubClient({
        appId: '123',
        installationId: '456',
        privateKeyBase64,
      })
      expect(await client.createDiscussion({ body: 'Body', title: 'Title' })).toBe(
        'https://example.com/1',
      )
    },
  )
  expect(requests).toHaveLength(3)
})

async function withFetchMock<T>(
  implementation: (
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1],
  ) => Promise<Response>,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: implementation,
  })
  try {
    return await run()
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: originalFetch,
    })
  }
}

async function generatePrivateKeyBase64() {
  const keyPair = (await crypto.subtle.generateKey(
    {
      hash: 'SHA-256',
      modulusLength: 2048,
      name: 'RSASSA-PKCS1-v1_5',
      publicExponent: Uint8Array.of(1, 0, 1),
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair
  const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  if (!(privateKey instanceof ArrayBuffer))
    throw new Error('Expected a binary PKCS#8 private key.')

  let binary = ''
  for (const byte of new Uint8Array(privateKey)) binary += String.fromCharCode(byte)
  return btoa(binary)
}
