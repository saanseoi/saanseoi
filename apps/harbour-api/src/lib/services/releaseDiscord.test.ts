import { expect, test } from 'bun:test'

import { buildDiscordReleaseEmbed } from './releaseDiscord'

test('builds a Discord embed with release metadata and a release-log link', () => {
  expect(
    buildDiscordReleaseEmbed(
      {
        apiCatalogRevisionCode: 'catalog-hk-divisions-v0.1-2026-08-14-r0',
        apiFamily: 'divisions',
        apiReleaseSetCode: 'data-hk-divisions-2021--hkgov-pland-new-town',
        cohortKey: '2021',
        description:
          'Explore the geographical and administrative divisions used to describe Hong Kong, including districts, planning units, new towns, boundaries, and areas.',
        domainCode: 'hkgov-pland-new-town',
        domainName: 'New Town',
        publishedAt: '2026-08-14T11:41:57.421Z',
        publisherName: 'Planning Department',
        regionCode: 'hk',
        revision: 0,
      },
      'https://saanseoi.hk',
    ),
  ).toEqual({
    author: { name: 'SaanSeoi API release' },
    color: 0x007c69,
    description:
      'Explore the geographical and administrative divisions used to describe Hong Kong, including districts, planning units, new towns, boundaries, and areas.',
    fields: [
      { inline: true, name: 'Publisher', value: 'Planning Department' },
      { inline: true, name: 'Domain', value: '`hkgov-pland-new-town`' },
      { inline: true, name: 'Cohort', value: '`2021`' },
      { inline: true, name: 'Published', value: '2026-08-14' },
      { inline: true, name: 'Revision', value: '0' },
      {
        inline: true,
        name: 'Catalogue',
        value: '`catalog-hk-divisions-v0.1-2026-08-14-r0`',
      },
    ],
    footer: { text: 'Read the release log' },
    timestamp: '2026-08-14T11:41:57.421Z',
    title: 'HK Divisions | New Town : 2021',
    url: 'https://saanseoi.hk/apis/divisions/data-hk-divisions-2021--hkgov-pland-new-town',
  })
})
