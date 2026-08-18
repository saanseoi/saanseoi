export type DiscordMessage = {
  id: string
  channel_id: string
  content?: string
  type?: number
  author: {
    bot?: boolean
    global_name?: string | null
    username: string
  }
  attachments?: Array<{ url: string }>
  embeds?: Array<{
    author?: { name?: string }
    description?: string
    fields?: Array<{ name?: string; value?: string }>
    footer?: { text?: string }
    provider?: { name?: string }
    title?: string
    type?: string
    url?: string
  }>
  sticker_items?: Array<{ name?: string }>
}

export type GitHubDiscussion = {
  body: string
  title: string
}

export type DiscordMessagePageOptions = {
  before?: string
  limit: number
}

export function compareMessageIds(left: string, right: string) {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0
}

export async function collectMessagesAfter<Message extends { id: string }>(
  fetchPage: (options: DiscordMessagePageOptions) => Promise<Message[]>,
  after?: string | null,
  maximum?: number,
) {
  const messages = new Map<string, Message>()
  let before: string | undefined

  while (maximum === undefined || messages.size < maximum) {
    const limit = Math.min(100, maximum === undefined ? 100 : maximum - messages.size)
    const page = await fetchPage({
      ...(before ? { before } : {}),
      limit,
    })
    if (page.length === 0) break

    for (const message of page) {
      if (!after || compareMessageIds(message.id, after) > 0) {
        messages.set(message.id, message)
      }
    }
    if (page.length < limit) break

    const oldest = page
      .map(message => message.id)
      .sort(compareMessageIds)
      .at(0)
    if (!oldest || (after && compareMessageIds(oldest, after) <= 0)) break
    before = oldest
  }

  return [...messages.values()].sort((left, right) =>
    compareMessageIds(left.id, right.id),
  )
}

export function formatAdminLog(message: DiscordMessage, channelName: string) {
  const sender = message.author.global_name ?? message.author.username
  return `${channelName} · ${sender}\n\n${formatBody(message) || '[empty message]'}`
}

export function formatBody(message: DiscordMessage) {
  return [
    message.content?.trim() ?? '',
    ...formatEmbeds(message.embeds ?? []),
    ...(message.attachments ?? []).map(attachment => attachment.url),
    ...(message.sticker_items ?? []).flatMap(sticker =>
      sticker.name ? [`[Sticker: ${sticker.name}]`] : [],
    ),
    formatSystemMessage(message.type),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function formatEmbeds(embeds: NonNullable<DiscordMessage['embeds']>) {
  return embeds.flatMap(embed => {
    if (isLinkPreviewEmbed(embed)) return []

    const fields = (embed.fields ?? []).flatMap(field => {
      const name = field.name?.trim()
      const value = field.value?.trim()
      return name && value ? [`${name}: ${value}`] : [name ?? value].filter(Boolean)
    })
    const lines = [
      embed.author?.name?.trim(),
      embed.title?.trim(),
      embed.description?.trim(),
      ...fields,
      embed.footer?.text?.trim(),
    ].filter(Boolean)

    return lines.length > 0
      ? [[...lines, embed.url?.trim()].filter(Boolean).join('\n')]
      : []
  })
}

function isLinkPreviewEmbed(embed: NonNullable<DiscordMessage['embeds']>[number]) {
  return (
    embed.provider ||
    embed.type === 'article' ||
    embed.type === 'image' ||
    embed.type === 'link' ||
    embed.type === 'video'
  )
}

function formatSystemMessage(type: number | undefined) {
  switch (type) {
    case 1:
      return '[Added a recipient]'
    case 2:
      return '[Removed a recipient]'
    case 3:
      return '[Started a call]'
    case 4:
      return '[Changed the channel name]'
    case 5:
      return '[Changed the channel icon]'
    case 6:
      return '[Pinned a message]'
    case 7:
      return '[Joined the server]'
    case 8:
      return '[Boosted the server]'
    case 12:
      return '[Followed an announcement channel]'
    case 18:
      return '[Created a thread]'
    case 20:
      return '[Used an application command]'
    case 21:
      return '[Started a thread]'
    case 22:
      return '[Server invite reminder]'
    case 23:
      return '[Used an application context menu]'
    case 24:
      return '[Automoderation action]'
    default:
      return type && type !== 0 ? '[Discord system event]' : ''
  }
}

/** Formats one Discord announcement for a repository Discussion. */
export function formatGitHubDiscussion(
  message: DiscordMessage,
  guildId: string,
): GitHubDiscussion | null {
  const body = formatBody(message)
  const title = body
    .split('\n')
    .find(line => line.trim())
    ?.trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)]\((?:<)?[^)\s]+(?:>)?\)/g, '$1')
    .replace(/<a?:([^:>]+):\d+>/g, ':$1:')
    .replace(/\*\*|__|~~|`/g, '')
    .slice(0, 256)

  if (!body || !title) return null

  const sourceUrl = `https://discord.com/channels/${guildId}/${message.channel_id}/${message.id}`
  return {
    title,
    body: `${body}\n\n---\n[View the original Discord announcement](${sourceUrl})`,
  }
}

export function splitTelegramText(text: string, maximumLength = 4096) {
  const remaining = Array.from(text)
  if (remaining.length <= maximumLength) return [text]

  const chunks: string[] = []
  while (remaining.length > maximumLength) {
    const newline = remaining.lastIndexOf('\n', maximumLength)
    const boundary = newline > 0 ? newline : maximumLength
    chunks.push(remaining.splice(0, boundary).join(''))
    while (remaining[0] === '\n' || remaining[0] === ' ') remaining.shift()
  }
  if (remaining.length > 0) chunks.push(remaining.join(''))
  return chunks
}

/** Converts Discord's Markdown subset to Telegram's HTML parse mode. */
export function formatTelegramHtml(text: string) {
  const lines = text.replaceAll('\r\n', '\n').split('\n')
  const rendered: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.startsWith('```')) {
      const end = lines.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && candidate.startsWith('```'),
      )
      if (end !== -1) {
        rendered.push(
          `<pre>${escapeTelegramHtml(lines.slice(index + 1, end).join('\n'))}</pre>`,
        )
        index = end
        continue
      }
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/)
    const quote = line.match(/^>\s?(.*)$/)
    if (heading) {
      rendered.push(`<b>${formatTelegramInline(heading[1] ?? '')}</b>`)
    } else if (quote) {
      rendered.push(`<blockquote>${formatTelegramInline(quote[1] ?? '')}</blockquote>`)
    } else {
      rendered.push(formatTelegramInline(line))
    }
  }

  return rendered.join('\n')
}

/** Splits generated Telegram HTML without leaving an unclosed formatting tag. */
export function splitTelegramHtml(html: string, maximumLength = 4096) {
  if (Array.from(html).length <= maximumLength) return [html]

  const chunks: string[] = []
  let current = ''
  const active: Array<{ name: string; opening: string }> = []
  const tokens = html.match(/<[^>]+>|[^<]+/g) ?? []

  const closings = () =>
    active
      .toReversed()
      .map(tag => `</${tag.name}>`)
      .join('')
  const finish = () => {
    if (current) chunks.push(`${current}${closings()}`)
    current = active.map(tag => tag.opening).join('')
  }

  for (const token of tokens) {
    if (token.startsWith('<')) {
      const closing = token.match(/^<\/([a-z]+)>$/i)
      const opening = token.match(/^<([a-z]+)(?:\s[^>]*)?>$/i)
      if (closing) {
        const index = active
          .map(tag => tag.name)
          .lastIndexOf((closing[1] ?? '').toLowerCase())
        const nextActive = index === -1 ? active : active.slice(0, index)
        const requiredLength = Array.from(
          `${current}${token}${nextActive
            .toReversed()
            .map(tag => `</${tag.name}>`)
            .join('')}`,
        ).length
        if (requiredLength > maximumLength) finish()
        current += token
        if (index !== -1) active.splice(index, 1)
        continue
      }
      if (opening) {
        const requiredLength = Array.from(`${current}${token}${closings()}`).length
        if (requiredLength > maximumLength) finish()
        current += token
        active.push({ name: (opening[1] ?? '').toLowerCase(), opening: token })
        continue
      }
    }

    for (const character of Array.from(token)) {
      if (Array.from(`${current}${character}${closings()}`).length > maximumLength)
        finish()
      current += character
    }
  }
  if (current) chunks.push(`${current}${closings()}`)
  return chunks
}

function formatTelegramInline(text: string): string {
  let output = ''
  let index = 0

  while (index < text.length) {
    const character = text[index] ?? ''
    if (character === '\\' && index + 1 < text.length) {
      output += escapeTelegramHtml(text[index + 1] ?? '')
      index += 2
      continue
    }

    if (character === '[') {
      const labelEnd = text.indexOf('](', index + 1)
      const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2)
      if (labelEnd !== -1 && urlEnd !== -1) {
        const url = text
          .slice(labelEnd + 2, urlEnd)
          .replace(/^<|>$/g, '')
          .trim()
        if (isTelegramWebUrl(url)) {
          output += `<a href="${escapeTelegramAttribute(url)}">${formatTelegramInline(text.slice(index + 1, labelEnd))}</a>`
          index = urlEnd + 1
          continue
        }
      }
    }

    if (character === '<') {
      const urlEnd = text.indexOf('>', index + 1)
      const url = urlEnd === -1 ? '' : text.slice(index + 1, urlEnd)
      if (isTelegramWebUrl(url)) {
        output += `<a href="${escapeTelegramAttribute(url)}">${escapeTelegramHtml(url)}</a>`
        index = urlEnd + 1
        continue
      }
    }

    const marker = ['**', '__', '~~', '||', '`', '*', '_'].find(candidate =>
      text.startsWith(candidate, index),
    )
    if (marker && canOpenMarker(text, index, marker)) {
      const end = text.indexOf(marker, index + marker.length)
      if (end !== -1 && canCloseMarker(text, end, marker)) {
        const tag = markdownTag(marker)
        output += `<${tag}>${formatTelegramInline(text.slice(index + marker.length, end))}</${tag}>`
        index = end + marker.length
        continue
      }
    }

    output += escapeTelegramHtml(character)
    index += 1
  }

  return output
}

function markdownTag(marker: string) {
  switch (marker) {
    case '**':
      return 'b'
    case '__':
      return 'u'
    case '~~':
      return 's'
    case '||':
      return 'tg-spoiler'
    case '`':
      return 'code'
    default:
      return 'i'
  }
}

function canOpenMarker(text: string, index: number, marker: string) {
  const next = text[index + marker.length] ?? ''
  const previous = text[index - 1] ?? ''
  return (
    next !== '' &&
    !/\s/.test(next) &&
    (marker !== '_' || previous === '' || /[\s\p{P}]/u.test(previous))
  )
}

function canCloseMarker(text: string, index: number, marker: string) {
  const previous = text[index - 1] ?? ''
  const next = text[index + marker.length] ?? ''
  return (
    previous !== '' &&
    !/\s/.test(previous) &&
    (marker !== '_' || next === '' || /[\s\p{P}]/u.test(next))
  )
}

function escapeTelegramHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function escapeTelegramAttribute(value: string) {
  return escapeTelegramHtml(value).replaceAll('"', '&quot;')
}

function containsControlCharacter(value: string) {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

function isTelegramWebUrl(value: string) {
  return !containsControlCharacter(value) && /^https?:\/\/\S+$/i.test(value)
}
