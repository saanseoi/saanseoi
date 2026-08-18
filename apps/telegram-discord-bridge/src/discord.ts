import { collectMessagesAfter, type DiscordMessage } from './messages.ts'

const DISCORD_API = 'https://discord.com/api/v10'
const MESSAGEABLE_CHANNEL_TYPES = new Set([0, 5, 10, 11, 12])
const REQUEST_TIMEOUT_MS = 15_000

export type DiscordChannel = {
  id: string
  name?: string
  parent_id?: string | null
  type: number
}

export class DiscordClient {
  constructor(
    private readonly botToken: string,
    private readonly guildId: string,
  ) {}

  async listMessageChannels() {
    const channels = await this.request<DiscordChannel[]>(
      `/guilds/${this.guildId}/channels`,
    )
    const activeThreads = await this.request<{ threads: DiscordChannel[] }>(
      `/guilds/${this.guildId}/threads/active`,
    )
    return [...channels, ...activeThreads.threads].filter(channel =>
      MESSAGEABLE_CHANNEL_TYPES.has(channel.type),
    )
  }

  async fetchMessages(channelId: string, after?: string | null, maximum?: number) {
    return collectMessagesAfter(
      async options => {
        const query = new URLSearchParams({ limit: String(options.limit) })
        if (options.before) query.set('before', options.before)
        return this.request<DiscordMessage[]>(
          `/channels/${channelId}/messages?${query.toString()}`,
        )
      },
      after,
      maximum,
    )
  }

  private async request<T>(path: string) {
    const response = await fetch(`${DISCORD_API}${path}`, {
      headers: { authorization: `Bot ${this.botToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok)
      throw new Error(`Discord API returned HTTP ${response.status} for ${path}.`)
    return (await response.json()) as T
  }
}
