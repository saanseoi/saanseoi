<script lang="ts">
import { onMount } from 'svelte'
import { Main } from '$lib/bits'
import { m } from '$lib/bits/internal/i18n'
import {
  THEME_CHANGE_EVENT,
  resolveTheme,
  type ThemeMode,
} from '$lib/bits/internal/theme'
import type { createApiReference as createScalarApiReference } from '@scalar/api-reference'
import '@scalar/api-reference/style.css'

const openApiUrl = '/openapi'

const scalarConfig = (theme: ThemeMode) => ({
  defaultOpenFirstTag: true,
  darkMode: theme === 'dark',
  documentDownloadType: 'both' as const,
  expandAllModelSections: false,
  expandAllResponses: false,
  expandAllSchemaProperties: false,
  externalUrls: {
    apiBaseUrl: 'https://api.scalar.com',
    dashboardUrl: 'https://dashboard.scalar.com',
    proxyUrl: 'https://proxy.scalar.com',
    registryUrl: 'https://registry.scalar.com',
  },
  forceDarkModeState: theme,
  hideClientButton: false,
  hideDarkModeToggle: true,
  hideModels: false,
  hideSearch: false,
  hideTestRequestButton: false,
  isEditable: false,
  layout: 'modern' as const,
  modelsSectionLabel: m.docs_models(),
  operationTitleSource: 'summary' as const,
  orderRequiredPropertiesFirst: true,
  orderSchemaPropertiesBy: 'alpha' as const,
  persistAuth: false,
  showDeveloperTools: 'localhost' as const,
  showOperationId: true,
  showSidebar: true,
  showToolbar: 'localhost' as const,
  telemetry: true,
  theme: 'default' as const,
  title: m.docs_title(),
  url: openApiUrl,
  withDefaultFonts: false,
})

onMount(() => {
  let scalarReference: ReturnType<typeof createScalarApiReference> | null = null
  let createReference: typeof createScalarApiReference | null = null

  const mountScalar = (theme: ThemeMode) => {
    const mountElement = document.querySelector('#atlas-api-reference')

    scalarReference?.destroy()
    scalarReference = null
    mountElement?.replaceChildren()

    if (!createReference) {
      return
    }

    scalarReference = createReference('#atlas-api-reference', scalarConfig(theme))
  }

  const handleThemeChange = (event: Event) => {
    const theme =
      (event as CustomEvent<{ theme: ThemeMode }>).detail?.theme ?? resolveTheme()
    mountScalar(theme)
  }

  window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)

  void import('@scalar/api-reference').then(({ createApiReference }) => {
    createReference = createApiReference
    mountScalar(resolveTheme())
  })

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    scalarReference?.destroy()
  }
})
</script>

<svelte:head>
  <title>{m.docs_title()}</title>
</svelte:head>

<Main class="min-h-[calc(100vh-10rem)] bg-background">
  <div
    id="atlas-api-reference"
    class="atlas-api-reference min-h-[calc(100vh-10rem)]"
  ></div>
</Main>

<style>
:global(.atlas-api-reference) {
  --scalar-custom-header-height: 72px;
}

:global(.atlas-api-reference .collapsible-section-trigger) {
  scroll-margin-top: 72px;
}

:global(.atlas-api-reference .darklight),
:global(.atlas-api-reference .download),
:global(.atlas-api-reference .references-classic-header) {
  display: none;
}
</style>
