import { expect, test } from 'bun:test'

import { collectMessagesAfter, formatAdminLog, splitTelegramText } from './messages.ts'

test('walks backward through full Discord pages without skipping messages', async () => {
  const calls: Array<{ before?: string; limit: number }> = []
  const messages = await collectMessagesAfter(async options => {
    calls.push(options)
    const upperBound = Number(options.before ?? 251)
    return Array.from({ length: 100 }, (_, index) => ({
      id: String(upperBound - index - 1),
    })).filter(message => Number(message.id) > 0)
  }, '0')

  expect(calls.slice(0, 3)).toEqual([
    { limit: 100 },
    { before: '151', limit: 100 },
    { before: '51', limit: 100 },
  ])
  expect(messages).toHaveLength(250)
  expect(messages[0]?.id).toBe('1')
  expect(messages.at(-1)?.id).toBe('250')
})

test('limits initial backfill to the requested latest messages', async () => {
  const messages = await collectMessagesAfter(
    async () =>
      Array.from({ length: 100 }, (_, index) => ({ id: String(200 - index) })),
    undefined,
    100,
  )

  expect(messages).toHaveLength(100)
  expect(messages[0]?.id).toBe('101')
  expect(messages.at(-1)?.id).toBe('200')
})

test('formats append-only admin records and splits without corrupting emoji', () => {
  const formatted = formatAdminLog(
    {
      attachments: [{ url: 'https://example.com/attachment' }],
      author: { global_name: 'Sender Name', username: 'sender' },
      channel_id: 'channel',
      content: 'Message contents',
      id: '1',
    },
    '#channel',
  )

  expect(formatted).toBe(
    '#channel · Sender Name\n\nMessage contents\n\nhttps://example.com/attachment',
  )
  expect(splitTelegramText('ab😀cd', 4)).toEqual(['ab😀c', 'd'])
})
