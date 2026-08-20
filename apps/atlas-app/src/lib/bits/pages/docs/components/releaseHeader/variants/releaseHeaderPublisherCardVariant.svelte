<script lang="ts">
import { m, selectLocalisedRow, type AppLocale } from '#lib/bits/internal/i18n.js'
import { normaliseExternalUrl } from '#lib/externalUrl.js'
import { getPublisherLogo } from '#lib/registry/publisherLogo.js'
import type { RegistryPublisher } from '#lib/registry/types.js'

import * as ReleaseHeader from '../components/index.js'

type Props = {
  publisher: RegistryPublisher
  locale: AppLocale
  showTitle?: boolean
}

let { publisher, locale, showTitle = true }: Props = $props()
let localisedPublisher = $derived(selectLocalisedRow(publisher.publisherI18n, locale))
let publisherUrl = $derived(normaliseExternalUrl(publisher.url))
let publisherContactUrl = $derived(normaliseExternalUrl(publisher.contactUrl))
let primaryLinks = $derived.by(() => {
  if (publisherContactUrl) {
    return [
      {
        href: publisherContactUrl,
        icon: 'ion:chatbubble-outline',
        isExternal: true,
        label: m.source_contact(),
      },
    ]
  }

  return [
    ...(publisher.contactEmail
      ? [
          {
            href: `mailto:${publisher.contactEmail}`,
            icon: 'ion:mail-outline',
            label: publisher.contactEmail,
          },
        ]
      : []),
    ...(publisher.contactPhone
      ? [
          {
            href: `tel:${publisher.contactPhone}`,
            icon: 'ion:call-outline',
            label: publisher.contactPhone,
          },
        ]
      : []),
  ]
})
let secondaryLinks = $derived(
  publisherUrl
    ? [
        {
          href: publisherUrl,
          icon: 'ion:link-outline',
          isExternal: true,
          label: m.source_official_site(),
        },
      ]
    : [],
)
</script>

<ReleaseHeader.Card
  title={showTitle ? m.source_publisher() : undefined}
  name={localisedPublisher?.name ?? publisher.code}
  href={`/publishers/${publisher.code}`}
  imageSrc={getPublisherLogo(publisher.code)}
  description={localisedPublisher?.description}
  {primaryLinks}
  {secondaryLinks}
  showArrow={false}
/>
