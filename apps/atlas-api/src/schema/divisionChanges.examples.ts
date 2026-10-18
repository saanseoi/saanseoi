export const divisionChangesReleaseExamples = {
  'v0.1': {
    from: 'data-hk-divisions-2026-06-17.0',
    to: 'data-hk-divisions-2026-07-22.0',
    path: '/divisions/v1/changes',
  },
  'v0.2': {
    from: 'data-hk-divisions-2026-09-01.0',
    to: 'data-hk-divisions-2026-10-01.0',
    path: '/divisions/v0.2/changes',
  },
} as const

export function divisionChangesExamplesForVersion(
  version: keyof typeof divisionChangesReleaseExamples,
) {
  const { from, to, path } = divisionChangesReleaseExamples[version]

  return [
    {
      name: 'Compare with the latest published release',
      query: `${path}?fromReleaseSet=${from}`,
    },
    {
      name: 'Compare two specific releases',
      query: `${path}?fromReleaseSet=${from}&toReleaseSet=${to}`,
    },
    {
      name: 'Include before/after membership geometry',
      query: `${path}?fromReleaseSet=${from}&toReleaseSet=${to}&include=geometry`,
    },
    {
      name: 'Request ten changes per page',
      query: `${path}?fromReleaseSet=${from}&toReleaseSet=${to}&page[limit]=10`,
    },
    {
      name: 'Compare in reverse for a rollback',
      query: `${path}?fromReleaseSet=${to}&toReleaseSet=${from}`,
    },
  ] as const
}

export const divisionChangesExamples = divisionChangesExamplesForVersion('v0.1')

export function divisionChangesExamplesDescriptionForVersion(
  version: keyof typeof divisionChangesReleaseExamples,
) {
  return [
    '### Example queries',
    'These release codes must be published and retained in the selected environment. Follow `links.next` to continue a comparison with the same pinned releases.',
    ...divisionChangesExamplesForVersion(version).map(
      example => `**${example.name}**\n\n\`\`\`http\nGET ${example.query}\n\`\`\``,
    ),
  ].join('\n\n')
}

export const divisionChangesExamplesDescription =
  divisionChangesExamplesDescriptionForVersion('v0.1')
