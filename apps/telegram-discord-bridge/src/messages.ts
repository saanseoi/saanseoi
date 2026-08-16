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
    title?: string
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
      embed.url?.trim(),
    ].filter(Boolean)

    return lines.length > 0 ? [lines.join('\n')] : []
  })
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
