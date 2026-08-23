<script lang="ts">
import { goto } from '$app/navigation'
import { onMount } from 'svelte'
import { Seo } from '#lib/bits/patterns/seo/index.js'
import { Main } from '#lib/bits/primitives/main/index.js'
import { getLocale, m } from '#lib/bits/internal/i18n.js'
import {
  THEME_CHANGE_EVENT,
  resolveTheme,
  type ThemeMode,
} from '#lib/bits/internal/theme.js'
import type { createApiReference as createScalarApiReference } from '@scalar/api-reference'
import type { ApiReferenceConfigurationWithMultipleSources } from '@scalar/types/api-reference'
import '@scalar/api-reference/style.css'

const apiFamilies = [
  {
    id: 'registry',
    label: () => m.openapi_label_registry(),
    versions: ['v0', 'v0.1'],
    visible: true,
  },
  {
    id: 'addresses',
    label: () => m.openapi_label_addresses(),
    versions: ['v0', 'v0.1'],
    visible: true,
  },
  {
    id: 'divisions',
    label: () => m.openapi_label_divisions(),
    versions: ['v0', 'v0.1'],
    visible: true,
  },
  {
    id: 'places',
    label: () => m.openapi_label_places(),
    versions: ['v0', 'v0.1'],
    visible: false,
  },
  {
    id: 'stats',
    label: () => m.openapi_label_statistics(),
    versions: ['v0', 'v0.1'],
    visible: true,
  },
  {
    id: 'streets',
    label: () => m.openapi_label_streets(),
    versions: ['v0', 'v0.1'],
    visible: false,
  },
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
    title: `${family.label()} ${version}`,
    slug: `${family.id}-${version}`,
    url: `/openapi/${family.id}/${version}?locale=${getLocale()}`,
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
    const sidebar = sidebarItems?.parentElement

    if (!sidebarItems || !sidebar || sidebar.querySelector('.scalar-api-families')) {
      return
    }

    const familySection = document.createElement('section')
    const familyHeading = document.createElement('h2')
    const familyToggle = document.createElement('button')
    const familyHeadingLabel = document.createElement('span')
    const familyChevron = document.createElement('span')
    const familyList = document.createElement('ul')
    const versionHeading = document.createElement('h2')
    const versionSelector = sidebar?.querySelector('.document-selector')
    const searchActions = sidebarItems.previousElementSibling

    familySection.className = 'scalar-api-families'
    familyHeading.className = 'scalar-api-families__heading'
    familyToggle.className = 'scalar-api-families__toggle'
    familyToggle.type = 'button'
    familyToggle.setAttribute('aria-expanded', 'true')
    familyToggle.setAttribute('aria-controls', 'scalar-api-families-list')
    familyHeadingLabel.className = 'scalar-api-families__heading-label'
    familyHeadingLabel.textContent = m.openapi_families_heading()
    familyChevron.className = 'scalar-api-families__chevron'
    familyChevron.textContent = '⌄'
    familyList.className = 'scalar-api-families__list'
    familyList.id = 'scalar-api-families-list'
    familyList.hidden = false
    versionHeading.className = 'scalar-api-version__heading'
    versionHeading.textContent = m.openapi_version_heading()

    for (const family of apiFamilies.filter(family => family.visible)) {
      const item = document.createElement('li')
      const button = document.createElement('button')
      const isActive = family.id === activeFamily

      button.className = 'scalar-api-families__link'
      button.type = 'button'
      button.textContent = family.label()
      button.setAttribute('aria-current', isActive ? 'page' : 'false')
      button.addEventListener('click', () => selectFamily(family.id))
      item.appendChild(button)
      familyList.appendChild(item)
    }

    familyToggle.appendChild(familyHeadingLabel)
    familyToggle.appendChild(familyChevron)
    familyToggle.addEventListener('click', () => {
      const expanded = familyToggle.getAttribute('aria-expanded') !== 'true'
      familyToggle.setAttribute('aria-expanded', String(expanded))
      familyList.hidden = !expanded
    })
    familyHeading.appendChild(familyToggle)
    familySection.appendChild(familyHeading)
    familySection.appendChild(familyList)
    sidebar.insertBefore(familySection, searchActions ?? sidebarItems)
    if (versionSelector) {
      versionSelector.classList.add('scalar-api-version')
      versionSelector.insertBefore(versionHeading, versionSelector.firstChild)
      sidebar.insertBefore(versionSelector, searchActions ?? sidebarItems)
    } else {
      sidebar.insertBefore(versionHeading, searchActions ?? sidebarItems)
    }

    if (activeFamily !== 'registry') {
      requestAnimationFrame(() => {
        for (const tagLink of sidebarItems.querySelectorAll('a[href*="/tag/"]')) {
          const tagItem = tagLink.closest('li')
          const toggle = tagItem?.querySelector<HTMLButtonElement>(
            'button[aria-expanded="false"]',
          )

          toggle?.click()
        }
      })
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

const installVersionOptionLabelFix = () => {
  const createCheckmark = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')

    svg.dataset.saanseoiVersionCheck = 'true'
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('height', '12')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '12')
    path.setAttribute('d', 'm19.75 7.018l-9.257 9.257a1 1 0 0 1-1.414 0L4.25 11.446')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    path.setAttribute('stroke-width', '1.5')
    svg.appendChild(path)

    return svg
  }

  const applyDimensions = () => {
    for (const label of document.querySelectorAll<HTMLElement>(
      '[role="listbox"] > [role="option"] > span.inline-block.min-w-0.flex-1.truncate, [role="listbox"] > [role="option"] > span[data-saanseoi-version-option-label]',
    )) {
      const option = label.parentElement
      const listbox = option?.parentElement
      const indicator = option?.firstElementChild

      if (!option || !listbox || !(indicator instanceof HTMLElement)) {
        continue
      }

      label.dataset.saanseoiVersionOptionLabel = 'true'
      label.classList.remove('inline-block', 'truncate')
      label.style.setProperty('display', 'block', 'important')
      label.style.setProperty('flex', '1 1 auto', 'important')
      label.style.setProperty('font-family', 'var(--font-mono)', 'important')
      label.style.setProperty('font-size', '0.75rem', 'important')
      label.style.setProperty('font-weight', '500', 'important')
      label.style.setProperty('height', '1.25rem', 'important')
      label.style.setProperty('letter-spacing', '0.04em', 'important')
      label.style.setProperty('min-width', '8rem', 'important')
      label.style.setProperty('text-transform', 'uppercase', 'important')
      label.style.setProperty('width', 'auto', 'important')
      listbox.dataset.saanseoiVersionListbox = 'true'
      option.dataset.saanseoiVersionOption = 'true'
      option.style.setProperty('font-family', 'var(--font-mono)', 'important')
      option.style.setProperty('font-size', '0.75rem', 'important')
      option.style.setProperty('letter-spacing', '0.04em', 'important')
      option.style.setProperty('text-transform', 'uppercase', 'important')
      indicator.style.setProperty('flex', '0 0 1rem', 'important')

      if (option.getAttribute('aria-selected') === 'true') {
        if (!indicator.querySelector('[data-saanseoi-version-check]')) {
          indicator.replaceChildren(createCheckmark())
        }
        indicator.dataset.saanseoiVersionCheckmark = 'true'
        indicator.className = 'flex size-4 shrink-0 items-center justify-center'
        indicator.style.setProperty('color', 'var(--secondary)', 'important')
      } else if (indicator.dataset.saanseoiVersionCheckmark === 'true') {
        indicator.className =
          'flex size-4 items-center justify-center p-0.75 text-transparent shadow-border rounded-full'
        indicator.replaceChildren()
        indicator.style.removeProperty('color')
        delete indicator.dataset.saanseoiVersionCheckmark
      }
    }
  }

  const observer = new MutationObserver(applyDimensions)
  observer.observe(document.body, {
    attributeFilter: ['aria-selected'],
    attributes: true,
    childList: true,
    subtree: true,
  })
  applyDimensions()

  return () => observer.disconnect()
}

onMount(() => {
  let scalarReference: ReturnType<typeof createScalarApiReference> | null = null
  let createReference: typeof createScalarApiReference | null = null
  const selectedFamily = new URLSearchParams(window.location.search).get('family')
  const removeVersionOptionLabelFix = installVersionOptionLabelFix()
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
    url.hash = ''
    void goto(`${url.pathname}${url.search}`, { replace: true, reset: false }).then(
      () => mountScalar(resolveTheme()),
    )
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
    removeVersionOptionLabelFix()
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
  margin: 0;
}

:global(.atlas-api-reference .scalar-api-families__toggle) {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--scalar-sidebar-color-1);
  column-gap: 0.5rem;
  cursor: pointer;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  padding: 0;
  text-align: left;
  width: 100%;
}

:global(.atlas-api-reference .scalar-api-families__heading-label) {
  font-family: var(--scalar-font);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:global(.atlas-api-reference .scalar-api-families__chevron) {
  font-size: 0.875rem;
  line-height: 1;
  transition: transform 150ms ease;
}

:global(
  .atlas-api-reference
    .scalar-api-families__toggle[aria-expanded="true"]
    .scalar-api-families__chevron
) {
  transform: rotate(180deg);
}

:global(.atlas-api-reference .scalar-api-version__heading) {
  margin: 0;
  flex: none;
  padding: 0;
  color: var(--scalar-sidebar-color-1);
  font-family: var(--scalar-font);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

:global(.atlas-api-reference .scalar-api-version) {
  align-items: center;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 0.5rem;
  margin-bottom: -1rem;
  padding: 0.75rem;
  width: 100%;
}

:global(.atlas-api-reference .scalar-api-version .contents) {
  align-self: stretch;
  display: block;
  min-width: 0;
  width: 100%;
}

:global(.atlas-api-reference .scalar-api-version button[aria-haspopup="listbox"]) {
  display: flex;
  font-family: var(--font-mono);
  justify-content: center;
  line-height: 1.25rem;
  min-height: 1.25rem;
  min-width: 0;
  position: relative;
  text-transform: uppercase;
  width: 100%;
}

:global(.atlas-api-reference .scalar-api-version button[aria-haspopup="listbox"] svg) {
  position: absolute;
  right: 0;
}

:global(.atlas-api-reference .scalar-mcp-layer) {
  display: none;
}

:global(.atlas-api-reference .scalar-api-families__list) {
  display: grid;
  gap: 0.125rem;
  list-style: none;
  margin: 0.5rem 0 0;
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
  font-family: var(--scalar-font);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1rem;
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
