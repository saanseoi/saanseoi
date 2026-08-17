import { expect, test } from 'bun:test'

import {
  collectMessagesAfter,
  formatAdminLog,
  formatGitHubDiscussion,
  formatTelegramHtml,
  splitTelegramHtml,
  splitTelegramText,
} from './messages.ts'

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

test('converts Discord Markdown to Telegram HTML', () => {
  expect(
    formatTelegramHtml(
      '# **Community** channels\n\n*Join* __us__ at [SaanSeoi](https://saanseoi.hk/?a=1&b=2).\n\n> ~~No previews~~ ||secret||\n\n```ts\nconst html = `<safe>`\n```',
    ),
  ).toBe(
    '<b><b>Community</b> channels</b>\n\n<i>Join</i> <u>us</u> at <a href="https://saanseoi.hk/?a=1&amp;b=2">SaanSeoi</a>.\n\n<blockquote><s>No previews</s> <tg-spoiler>secret</tg-spoiler></blockquote>\n\n<pre>const html = `&lt;safe&gt;`</pre>',
  )
})

test('splits Telegram HTML at valid tag boundaries', () => {
  expect(splitTelegramHtml('<b>ab😀cd</b>', 10)).toEqual(['<b>ab😀</b>', '<b>cd</b>'])
})

test('preserves Discord card fields, stickers and system events in Telegram text', () => {
  expect(
    formatAdminLog(
      {
        author: { username: 'Mountainfish' },
        channel_id: 'releases',
        embeds: [
          {
            description: 'The first changelog is now published.',
            fields: [
              { name: 'Publisher', value: 'Planning Department' },
              { name: 'Source version', value: '`2021`' },
            ],
            title: 'divisions API release published',
            url: 'https://saanseoi.hk/apis/divisions/release',
          },
        ],
        id: 'card',
        sticker_items: [{ name: 'Wave hello' }],
      },
      '#releases',
    ),
  ).toBe(
    '#releases · Mountainfish\n\ndivisions API release published\nThe first changelog is now published.\nPublisher: Planning Department\nSource version: `2021`\nhttps://saanseoi.hk/apis/divisions/release\n\n[Sticker: Wave hello]',
  )

  expect(
    formatAdminLog(
      {
        author: { username: 'member' },
        channel_id: 'general',
        id: 'join',
        type: 7,
      },
      '#general',
    ),
  ).toBe('#general · member\n\n[Joined the server]')

  expect(
    formatAdminLog(
      {
        author: { username: 'member' },
        channel_id: 'general',
        id: 'rename',
        type: 4,
      },
      '#general',
    ),
  ).toBe('#general · member\n\n[Changed the channel name]')
})

test('keeps authored cards while discarding Discord link-preview embeds', () => {
  expect(
    formatAdminLog(
      {
        author: { username: 'sender' },
        channel_id: 'announcements',
        content: 'Read https://example.com/announcement',
        embeds: [
          {
            description: 'This is a Discord link preview.',
            provider: { name: 'Example' },
            title: 'Example preview',
            type: 'article',
            url: 'https://example.com/announcement',
          },
          { type: 'rich', url: 'https://example.com/announcement' },
          {
            description: 'An authored release card.',
            title: 'Release published',
            type: 'rich',
            url: 'https://saanseoi.hk/apis/release',
          },
        ],
        id: 'preview',
      },
      '#announcements',
    ),
  ).toBe(
    '#announcements · sender\n\nRead https://example.com/announcement\n\nRelease published\nAn authored release card.\nhttps://saanseoi.hk/apis/release',
  )
})

test('uses a plain-text announcement first line as a GitHub discussion title', () => {
  const discussion = formatGitHubDiscussion(
    {
      attachments: [{ url: 'https://example.com/release-notes' }],
      author: { username: 'sender' },
      channel_id: 'channel',
      content:
        '# **August release** [notes](https://example.com/notes) <:saanseoi:123>\n\nThe full announcement.',
      id: 'message',
    },
    'guild',
  )

  expect(discussion).toEqual({
    title: 'August release notes :saanseoi:',
    body: '# **August release** [notes](https://example.com/notes) <:saanseoi:123>\n\nThe full announcement.\n\nhttps://example.com/release-notes\n\n---\n[View the original Discord announcement](https://discord.com/channels/guild/channel/message)',
  })
})
