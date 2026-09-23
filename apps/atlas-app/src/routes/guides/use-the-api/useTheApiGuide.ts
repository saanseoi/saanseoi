import { getMarkdownHeadings } from '#lib/registry/markdown.js'

type ApiRelease = {
  code: string
  createdAt: string
  domainCode?: string | null
  notes?: string | null
  publishedAt?: string | null
  status: string
}

type ApiComposition = {
  apiCompositionMembers?: Array<{ domainCode: string; i18n: DomainI18n[] }>
  status: string
  version: number
}

type ApiFamily = {
  apiComposition?: ApiComposition[]
  familyType: string
  releases?: ApiRelease[]
  status: string
}

type DomainI18n = {
  descriptionShort?: string | null
  description?: string | null
  locale: string
  name: string
}

export type UseTheApiGuideDomain = {
  code: string
  i18n: DomainI18n[]
  latestReleaseCode: string | null
  latestReleaseHref: string | null
}

export type UseTheApiGuideFamily = {
  domains: UseTheApiGuideDomain[]
  familyType: string
}

const publishedReleaseStatuses = new Set(['current', 'archived'])

const getUsingApiHeadingId = (notes: string) =>
  getMarkdownHeadings(notes).find(heading => /^using the .+ api$/i.test(heading.text))
    ?.id

const releaseTimestamp = (release: ApiRelease) =>
  new Date(release.publishedAt ?? release.createdAt).getTime()

const getLatestReleaseByDomain = (familyType: string, releases: ApiRelease[]) => {
  const latestByDomain = new Map<string, ApiRelease>()

  for (const release of releases) {
    if (!publishedReleaseStatuses.has(release.status) || !release.notes?.trim()) {
      continue
    }

    const domainCode = release.domainCode ?? 'default'
    const previous = latestByDomain.get(domainCode)
    if (!previous || releaseTimestamp(release) > releaseTimestamp(previous)) {
      latestByDomain.set(domainCode, release)
    }
  }

  return new Map(
    [...latestByDomain].map(([domainCode, release]) => {
      const headingId = getUsingApiHeadingId(release.notes ?? '')
      const href = `/apis/${encodeURIComponent(familyType)}/${encodeURIComponent(release.code)}${headingId ? `#${headingId}` : ''}`
      return [domainCode, { code: release.code, href }]
    }),
  )
}

export const buildUseTheApiGuideFamilies = (apis: ApiFamily[]) =>
  apis
    .filter(api => api.status !== 'retired')
    .map(api => {
      const composition = [...(api.apiComposition ?? [])]
        .filter(item => item.status === 'current')
        .sort((left, right) => right.version - left.version)[0]
      const domainI18n = Object.fromEntries(
        (composition?.apiCompositionMembers ?? []).map(member => [
          member.domainCode,
          member.i18n,
        ]),
      )
      const latestReleaseByDomain = getLatestReleaseByDomain(
        api.familyType,
        api.releases ?? [],
      )
      const domainCodes = new Set([
        ...Object.keys(domainI18n),
        ...latestReleaseByDomain.keys(),
      ])

      return {
        familyType: api.familyType,
        domains: [...domainCodes]
          .sort((left, right) => left.localeCompare(right))
          .map(code => ({
            code,
            i18n: domainI18n[code] ?? [],
            latestReleaseCode: latestReleaseByDomain.get(code)?.code ?? null,
            latestReleaseHref: latestReleaseByDomain.get(code)?.href ?? null,
          })),
      }
    })
    .filter(family => family.domains.length > 0)
    .sort((left, right) => left.familyType.localeCompare(right.familyType))
