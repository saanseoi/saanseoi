import type { CreateAMapSelectionValue } from '#lib/guides/createAMapSelections.js'

export type EmbedHeight = { mode: 'fixed'; pixels: number } | { mode: 'fill' }

const escapeAttribute = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export function normalisePublishedMapUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return
    return url.href
  } catch {
    return
  }
}

export function createMapIframeCode({
  height,
  title,
  url,
}: {
  height: EmbedHeight
  title: string
  url: string
}) {
  const source = normalisePublishedMapUrl(url) ?? 'https://YOUR_PUBLISHED_MAP_URL/'
  const accessibleTitle = title.trim() || 'Interactive map'
  const heightAttribute = height.mode === 'fixed' ? `\n  height="${height.pixels}"` : ''
  const heightStyle =
    height.mode === 'fill' ? ' width: 100%; height: 100%;' : ' width: 100%;'

  return [
    '<iframe',
    `  src="${escapeAttribute(source)}"`,
    `  title="${escapeAttribute(accessibleTitle)}"`,
    `  width="100%"${heightAttribute}`,
    `  style="border: 0;${heightStyle}"`,
    '  loading="lazy"',
    '  referrerpolicy="strict-origin-when-cross-origin"',
    '  allow="fullscreen"',
    '  allowfullscreen',
    '></iframe>',
  ].join('\n')
}

export function embedElementName(
  platform: CreateAMapSelectionValue<'websitePlatform'>,
) {
  switch (platform) {
    case 'wordpress':
      return 'Custom HTML block'
    case 'squarespace':
      return 'Code Block'
    case 'wix':
      return 'Embed HTML element'
    case 'webflow':
      return 'Code Embed element'
    case 'other':
      return 'HTML or embed element'
  }
}
