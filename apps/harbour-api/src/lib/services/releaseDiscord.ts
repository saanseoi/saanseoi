const DISCORD_API = 'https://discord.com/api/v10'
const REQUEST_TIMEOUT_MS = 15_000
const SAANSEOI_GREEN = 0x007c69

export type ReleaseSetPublication = {
  apiCatalogRevisionCode?: string
  apiFamily: string
  apiReleaseSetCode: string
  cohortKey: string | null
  description: string
  domainCode: string
  domainName: string
  publishedAt: string
  publisherName: string
  regionCode: string
  revision: number
}

type DiscordEmbed = {
  author: { name: string }
  color: number
  description: string
  fields: Array<{ inline: boolean; name: string; value: string }>
  footer: { text: string }
  timestamp: string
  title: string
  url: string
}

export function buildDiscordReleaseEmbed(
  publication: ReleaseSetPublication,
  atlasBaseUrl: string,
): DiscordEmbed {
  const releaseLogUrl = new URL(
    `/apis/${publication.apiFamily}/${publication.apiReleaseSetCode}`,
    atlasBaseUrl,
  ).toString()

  return {
    author: { name: 'SaanSeoi API release' },
    color: SAANSEOI_GREEN,
    description: publication.description,
    fields: [
      { inline: true, name: 'Publisher', value: publication.publisherName },
      { inline: true, name: 'Domain', value: `\`${publication.domainCode}\`` },
      {
        inline: true,
        name: 'Cohort',
        value: publication.cohortKey ? `\`${publication.cohortKey}\`` : 'Unspecified',
      },
      {
        inline: true,
        name: 'Published',
        value: formatPublishedDate(publication.publishedAt),
      },
      { inline: true, name: 'Revision', value: String(publication.revision) },
      ...(publication.apiCatalogRevisionCode
        ? [
            {
              inline: true,
              name: 'Catalogue',
              value: `\`${publication.apiCatalogRevisionCode}\``,
            },
          ]
        : []),
    ],
    footer: { text: 'Read the release log' },
    timestamp: publication.publishedAt,
    title: formatReleaseTitle(publication),
    url: releaseLogUrl,
  }
}

function formatReleaseTitle(publication: ReleaseSetPublication) {
  const scope = [
    `${publication.regionCode.toUpperCase()} ${toTitleCase(publication.apiFamily)}`,
    publication.domainName,
  ].join(' | ')
  return publication.cohortKey ? `${scope} : ${publication.cohortKey}` : scope
}

function formatPublishedDate(publishedAt: string) {
  return publishedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? publishedAt
}

function toTitleCase(value: string) {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

export async function publishDiscordReleaseEmbed(
  publication: ReleaseSetPublication,
  config: {
    atlasBaseUrl: string
    botToken: string
    channelId: string
  },
) {
  const response = await fetch(`${DISCORD_API}/channels/${config.channelId}/messages`, {
    body: JSON.stringify({
      allowed_mentions: { parse: [] },
      embeds: [buildDiscordReleaseEmbed(publication, config.atlasBaseUrl)],
    }),
    headers: {
      authorization: `Bot ${config.botToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`Discord release announcement returned HTTP ${response.status}.`)
  }
}
