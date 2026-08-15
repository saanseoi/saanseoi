export type DiscordMessage = {
  id: string
  channel_id: string
  content?: string
  author: {
    bot?: boolean
    global_name?: string | null
    username: string
  }
  attachments?: Array<{ url: string }>
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
    ...(message.attachments ?? []).map(attachment => attachment.url),
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()
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
