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
import type { ApiReferenceConfigurationWithMultipleSources } from '@scalar/types/api-reference'
import '@scalar/api-reference/style.css'

const apiFamilies = [
  { id: 'registry', label: 'Registry', versions: ['v0', 'v0.1'], visible: true },
  { id: 'addresses', label: 'Addresses', versions: ['v0', 'v0.1'], visible: true },
  { id: 'divisions', label: 'Divisions', versions: ['v0', 'v0.1'], visible: true },
  { id: 'places', label: 'Places', versions: ['v0', 'v0.1'], visible: false },
  { id: 'stats', label: 'Statistics', versions: ['v0', 'v0.1'], visible: true },
  { id: 'streets', label: 'Streets', versions: ['v0', 'v0.1'], visible: false },
] as const

type ApiFamilyId = (typeof apiFamilies)[number]['id']

const defaultApiFamily: ApiFamilyId = 'addresses'

const isApiFamilyId = (value: string | null): value is ApiFamilyId =>
  apiFamilies.some(family => family.id === value)

const openApiSources = (
  familyId: ApiFamilyId,
): ApiReferenceConfigurationWithMultipleSources['sources'] => {
  const family = apiFamilies.find(candidate => candidate.id === familyId)
  if (!family) {
    return []
  }

  return family.versions.map((version, index) => ({
    title: `${family.label} ${version}`,
    slug: `${family.id}-${version}`,
    url: `/openapi/${family.id}/${version}`,
    default: index === family.versions.length - 1,
  }))
}

const sortOperations = (first: { path: string }, second: { path: string }) => {
  const firstPathOrder = first.path.endsWith('/source-releases')
    ? 3
    : first.path.endsWith('/sources') && !first.path.includes('/api/')
      ? 2
      : /\/\{[^}]+\}$/.test(first.path)
        ? 1
        : 0
  const secondPathOrder = second.path.endsWith('/source-releases')
    ? 3
    : second.path.endsWith('/sources') && !second.path.includes('/api/')
      ? 2
      : /\/\{[^}]+\}$/.test(second.path)
        ? 1
        : 0
  const orderDifference = firstPathOrder - secondPathOrder
  if (orderDifference !== 0) {
    return orderDifference
  }

  return first.path.localeCompare(second.path)
}

const scalarConfig = (
  theme: ThemeMode,
  familyId: ApiFamilyId,
  onLoaded: () => void,
) => ({
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
  operationsSorter: sortOperations,
  persistAuth: false,
  showDeveloperTools: 'localhost' as const,
  showOperationId: true,
  showSidebar: true,
  showToolbar: 'localhost' as const,
  telemetry: true,
  theme: 'default' as const,
  title: m.docs_title(),
  sources: openApiSources(familyId),
  withDefaultFonts: false,
})

const addSidebarLinks = (
  mountElement: Element,
  activeFamily: ApiFamilyId,
  selectFamily: (family: ApiFamilyId) => void,
) => {
  requestAnimationFrame(() => {
    const sidebarItems = mountElement.querySelector('.t-doc__sidebar .group\\/items')

    if (!sidebarItems || sidebarItems.querySelector('.scalar-api-families')) {
      return
    }

    const familySection = document.createElement('section')
    const familyHeading = document.createElement('h2')
    const familyList = document.createElement('ul')
    const versionHeading = document.createElement('h2')
    const sidebar = sidebarItems.parentElement
    const versionSelector = sidebar?.querySelector('.document-selector')
    const searchActions = sidebarItems.previousElementSibling

    familySection.className = 'scalar-api-families'
    familyHeading.className = 'scalar-api-families__heading'
    familyHeading.textContent = 'API Families'
    familyList.className = 'scalar-api-families__list'
    versionHeading.className = 'scalar-api-version__heading'
    versionHeading.textContent = 'API Version'

    for (const family of apiFamilies.filter(family => family.visible)) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      const isActive = family.id === activeFamily

      button.className = 'scalar-api-families__link'
      button.type = 'button'
      button.textContent = family.label
      button.setAttribute('aria-current', isActive ? 'page' : 'false')
      button.addEventListener('click', () => selectFamily(family.id))
      item.appendChild(button)
      familyList.appendChild(item)
    }

    familySection.appendChild(familyHeading)
    familySection.appendChild(familyList)
    sidebar?.insertBefore(familySection, searchActions ?? sidebarItems)
    sidebar?.insertBefore(versionHeading, searchActions ?? sidebarItems)
    if (sidebar && versionSelector) {
      sidebar.insertBefore(versionSelector, searchActions ?? sidebarItems)
    }

    if (activeFamily !== 'registry') {
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
  const selectedFamily = new URLSearchParams(window.location.search).get('family')
  let activeFamily: ApiFamilyId = isApiFamilyId(selectedFamily)
    ? selectedFamily
    : defaultApiFamily

  const selectFamily = (family: ApiFamilyId) => {
    if (family === activeFamily) {
      return
    }

    activeFamily = family
    const url = new URL(window.location.href)
    url.searchParams.set('family', family)
    window.history.replaceState({}, '', url)
    mountScalar(resolveTheme())
  }

  const mountScalar = (theme: ThemeMode) => {
    const mountElement = document.querySelector('#atlas-api-reference')

    scalarReference?.destroy()
    scalarReference = null
    mountElement?.replaceChildren()

    if (!createReference || !mountElement) {
      return
    }

    scalarReference = createReference('#atlas-api-reference', {
      ...scalarConfig(theme, activeFamily, () =>
        addSidebarLinks(mountElement, activeFamily, selectFamily),
      ),
    })
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

:global(.atlas-api-reference .scalar-api-families) {
  padding: 0.75rem 0.75rem 0.5rem;
}

:global(.atlas-api-reference .scalar-api-families__heading) {
  margin: 0 0 0.25rem;
  color: var(--scalar-sidebar-color-1);
  font-family: var(--scalar-font);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:global(.atlas-api-reference .scalar-api-version__heading) {
  margin: 0;
  padding: 0.75rem 0.75rem 0.25rem;
  color: var(--scalar-sidebar-color-1);
  font-family: var(--scalar-font);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:global(.atlas-api-reference .scalar-api-families__list) {
  display: grid;
  gap: 0.125rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

:global(.atlas-api-reference .scalar-api-families__link) {
  width: 100%;
  padding: 0.5rem;
  border: 0;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--scalar-sidebar-color-2);
  cursor: pointer;
  display: block;
  font: inherit;
  text-align: left;
}

:global(.atlas-api-reference .scalar-api-families__link:hover),
:global(.atlas-api-reference .scalar-api-families__link:focus-visible) {
  background: var(--scalar-sidebar-background-2);
  color: var(--scalar-sidebar-color-1);
  outline: none;
}

:global(.atlas-api-reference .scalar-api-families__link[aria-current="page"]) {
  background: var(--scalar-sidebar-background-2);
  color: var(--scalar-sidebar-color-1);
  font-weight: 600;
}
</style>
