import { mapStyleDefinitions } from '@repo/basemap'

/**
 * The vocabulary persisted in the create-a-map URL and analytics event.
 *
 * Keeping this in one domain module prevents the public URL, client state and
 * server-side validation from quietly diverging as the guide evolves.
 */
export const createAMapSelectionChoices = {
  objective: ['local', 'web', 'web-embed', 'mobile-embed', 'notebook-embed'],
  operatingSystem: ['windows', 'macos', 'linux'],
  terminalExperience: ['none', 'basic', 'advanced'],
  codeEditor: ['zed', 'vscode', 'sublime-text', 'cursor', 'other'],
  llmMode: ['manual', 'assisted', 'handover'],
  aiAccess: ['agentic', 'web'],
  vpnAccess: ['yes', 'no'],
  agentTool: [
    'codex-app',
    'codex-cli',
    'claude-code',
    'claude-cowork',
    'kimi-code',
    'qwen-code',
    'cursor',
    'opencode',
    'pi',
    'zed',
    'other',
  ],
  llm: ['chatgpt', 'claude', 'gemini', 'deepseek', 'kimi', 'other'],
  hosting: ['cloudflare', 'github-pages', 'vercel', 'netlify', 'other'],
  websitePlatform: ['wordpress', 'squarespace', 'wix', 'webflow', 'other'],
  mobileLibrary: ['maplibre-native'],
  mobilePlatform: ['android', 'ios', 'other'],
  notebookLibrary: ['maplibre-jupyter', 'folium'],
  notebookRuntime: ['local', 'colab', 'jupyterhub'],
  renderer: ['maplibre', 'mapbox', 'leaflet'],
  region: ['hk', 'mo', 'gba'],
  style: ['custom', ...mapStyleDefinitions.map(style => style.id)],
  dataSource: ['existing', 'api', 'llm'],
  dataFormat: [
    'geojson',
    'kml',
    'csv',
    'topojson',
    'shapefile',
    'flatgeobuf',
    'wkt',
    'xlsx',
    'osm',
    'other',
  ],
} as const

export type CreateAMapSelectionKey = keyof typeof createAMapSelectionChoices
export type CreateAMapSelectionValue<Key extends CreateAMapSelectionKey> =
  (typeof createAMapSelectionChoices)[Key][number]

export type CreateAMapSelection = {
  [Key in CreateAMapSelectionKey]: CreateAMapSelectionValue<Key>
}

export type CreateAMapSelectionQuery = Partial<CreateAMapSelection>

export type CreateAMapOpeningPosition = {
  center: [longitude: number, latitude: number]
  zoom: number
}

export const createAMapSelectionQueryKeys = {
  objective: 'objective',
  operatingSystem: 'os',
  terminalExperience: 'terminal',
  codeEditor: 'editor',
  llmMode: 'llm-mode',
  aiAccess: 'ai-access',
  vpnAccess: 'vpn-access',
  agentTool: 'agent-tool',
  llm: 'llm',
  hosting: 'hosting',
  websitePlatform: 'website',
  mobileLibrary: 'mobile-library',
  mobilePlatform: 'mobile-platform',
  notebookLibrary: 'notebook-library',
  notebookRuntime: 'notebook-runtime',
  renderer: 'renderer',
  region: 'region',
  style: 'style',
  dataSource: 'data',
  dataFormat: 'data-format',
} as const satisfies Record<CreateAMapSelectionKey, string>

export function getCreateAMapQueryChoice<Key extends CreateAMapSelectionKey>(
  searchParams: Pick<URLSearchParams, 'get'>,
  selectionKey: Key,
): CreateAMapSelectionValue<Key> | undefined {
  const value = searchParams.get(createAMapSelectionQueryKeys[selectionKey])
  const choices = createAMapSelectionChoices[selectionKey] as readonly string[]
  return value && (choices as readonly string[]).includes(value)
    ? (value as CreateAMapSelectionValue<Key>)
    : undefined
}

export function detectOperatingSystem(
  userAgent: string,
): CreateAMapSelectionValue<'operatingSystem'> | undefined {
  if (/windows/i.test(userAgent)) return 'windows'
  if (/macintosh|mac os/i.test(userAgent)) return 'macos'
  if (/linux/i.test(userAgent)) return 'linux'
}

export function createAMapTileset(
  region: CreateAMapSelectionValue<'region'> | undefined,
) {
  return region === 'mo' ? 'macau' : region === 'gba' ? 'gba' : 'hongkong'
}

/**
 * Each basemap starts in an area it covers, so the generated map and its guide
 * preview show useful map content immediately.
 */
export function getCreateAMapOpeningPosition(
  region: CreateAMapSelectionValue<'region'> | undefined,
): CreateAMapOpeningPosition {
  if (region === 'mo') return { center: [113.552, 22.165], zoom: 12.2 }
  if (region === 'gba') return { center: [113.75, 22.65], zoom: 8.5 }
  return { center: [114.1694, 22.3193], zoom: 11.5 }
}

export function createAMapStylePreviewUrl(
  styleId: string,
  region: CreateAMapSelectionValue<'region'> | undefined,
  tileset: string,
) {
  const viewpoint =
    region === 'mo' ? 'senado-square' : region === 'gba' ? 'canton-tower' : 'central'
  return `https://tiles.saanseoi.hk/render/${region ?? 'hk'}/${tileset}-latest-${styleId}-${viewpoint}-z16.webp`
}
