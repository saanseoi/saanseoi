const from = 'data-hk-divisions-2026-06-17.0'
const to = 'data-hk-divisions-2026-07-22.0'
const path = '/divisions/v1/changes'

export const divisionChangesExamples = [
  {
    name: 'Compare with the latest published release',
    query: `${path}?fromApiReleaseSet=${from}`,
  },
  {
    name: 'Compare two specific releases',
    query: `${path}?fromApiReleaseSet=${from}&toApiReleaseSet=${to}`,
  },
  {
    name: 'Include before/after membership geometry',
    query: `${path}?fromApiReleaseSet=${from}&toApiReleaseSet=${to}&include=geometry`,
  },
  {
    name: 'Request ten changes per page',
    query: `${path}?fromApiReleaseSet=${from}&toApiReleaseSet=${to}&page[limit]=10`,
  },
  {
    name: 'Compare in reverse for a rollback',
    query: `${path}?fromApiReleaseSet=${to}&toApiReleaseSet=${from}`,
  },
] as const

export const divisionChangesExamplesDescription = [
  '### Example queries',
  'These release codes must be published and retained in the selected environment. Follow `links.next` to continue a comparison with the same pinned releases.',
  ...divisionChangesExamples.map(
    example => `**${example.name}**\n\n\`\`\`http\nGET ${example.query}\n\`\`\``,
  ),
].join('\n\n')
