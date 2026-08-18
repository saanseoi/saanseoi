import { expect, mock, test } from 'bun:test'

import { DiscordClient, TelegramClient } from './clients.ts'

test('retries a rate-limited Telegram request', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(
      Response.json(
        { description: 'Too Many Requests', ok: false, parameters: { retry_after: 1 } },
        { status: 429 },
      ),
    )
    .mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 42 } }))
  const delayMock = mock(async () => undefined)
  const client = new TelegramClient('token', {
    delay: delayMock,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.request('sendMessage', { text: 'hello' })).resolves.toEqual({
    message_id: 42,
  })
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(delayMock).toHaveBeenCalledWith(1000)
})

test('retries a rate-limited Discord request', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(Response.json({ retry_after: 0.25 }, { status: 429 }))
    .mockResolvedValueOnce(Response.json([{ id: 'channel' }]))
  const delayMock = mock(async () => undefined)
  const client = new DiscordClient('token', {
    delay: delayMock,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.request('/guilds/guild/channels')).resolves.toEqual([
    { id: 'channel' },
  ])
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(delayMock).toHaveBeenCalledWith(250)
})

test('retries transient non-JSON Telegram failures', async () => {
  const fetchMock = mock()
    .mockResolvedValueOnce(new Response('upstream failure', { status: 502 }))
    .mockResolvedValueOnce(Response.json({ ok: true, result: true }))
  const client = new TelegramClient('token', {
    delay: async () => undefined,
    fetch: fetchMock as unknown as typeof fetch,
  })

  await expect(client.request('sendMessage', {})).resolves.toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
