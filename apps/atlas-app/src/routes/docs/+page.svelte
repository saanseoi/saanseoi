<script lang="ts">
import { onMount } from 'svelte'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { m } from '#lib/bits/internal/i18n.js'
import {
  THEME_CHANGE_EVENT,
  resolveTheme,
  type ThemeMode,
} from '#lib/bits/internal/theme.js'
import type { createApiReference as createScalarApiReference } from '@scalar/api-reference'
import '@scalar/api-reference/style.css'

const openApiUrl = '/openapi'

const scalarConfig = (theme: ThemeMode, onLoaded: () => void) => ({
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
  onLoaded,
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

const addGlossaryLink = (mountElement: Element) => {
  requestAnimationFrame(() => {
    const sidebarItems = mountElement.querySelector('.t-doc__sidebar .group\\/items')

    if (!sidebarItems || sidebarItems.querySelector('.scalar-glossary-link')) {
      return
    }

    const item = document.createElement('li')
    const link = document.createElement('a')

    item.className = 'group/item flex flex-col text-base'
    link.className =
      'scalar-glossary-link group/button peer/button flex items-stretch rounded p-2 font-sidebar text-base/4 text-sidebar-c-2 no-underline wrap-break-word hover:bg-sidebar-b-hover hover:text-sidebar-c-hover'
    link.href = '/docs/glossary'
    link.textContent = `${m.glossary_title()} →`
    item.appendChild(link)
    sidebarItems.insertBefore(
      item,
      sidebarItems.firstElementChild?.nextElementSibling ?? null,
    )
  })
}

onMount(() => {
  let scalarReference: ReturnType<typeof createScalarApiReference> | null = null
  let createReference: typeof createScalarApiReference | null = null

  const mountScalar = (theme: ThemeMode) => {
    const mountElement = document.querySelector('#atlas-api-reference')

    scalarReference?.destroy()
    scalarReference = null
    mountElement?.replaceChildren()

    if (!createReference || !mountElement) {
      return
    }

    scalarReference = createReference(
      '#atlas-api-reference',
      scalarConfig(theme, () => addGlossaryLink(mountElement)),
    )
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

<Seo title={m.docs_title()} description={m.docs_meta_description()} />

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
