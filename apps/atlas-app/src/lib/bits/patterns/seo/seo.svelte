<script lang="ts">
import { page } from '$app/state'

type JsonLd = Record<string, unknown>

type Props = {
  title: string
  description: string
  image?: string
  publishedTime?: string
  modifiedTime?: string
  type?: 'article' | 'website'
  noindex?: boolean
  structuredData?: JsonLd
}

const siteName = '山水 | SaanSeoi'
const siteUrl = 'https://saanseoi.hk'

let {
  title,
  description,
  image,
  publishedTime,
  modifiedTime,
  type = 'website',
  noindex = false,
  structuredData,
}: Props = $props()

let canonicalUrl = $derived(`${siteUrl}${page.url.pathname}`)
let imageUrl = $derived(image ? new URL(image, siteUrl).toString() : undefined)
let robots = $derived(noindex ? 'noindex, follow' : 'index, follow')
let schema = $derived(
  structuredData ?? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonicalUrl,
    isPartOf: {
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
    },
  },
)
let serialisedSchema = $derived(JSON.stringify(schema).replaceAll('<', '\\u003c'))
</script>

<svelte:head>
  <title>{title} | {siteName}</title>
  <meta name="description" content={description}>
  <meta name="robots" content={robots}>
  <link rel="canonical" href={canonicalUrl}>

  <meta property="og:type" content={type}>
  <meta property="og:site_name" content={siteName}>
  <meta property="og:title" content={title}>
  <meta property="og:description" content={description}>
  <meta property="og:url" content={canonicalUrl}>
  {#if imageUrl}
    <meta property="og:image" content={imageUrl}>
  {/if}
  {#if publishedTime}
    <meta property="article:published_time" content={publishedTime}>
  {/if}
  {#if modifiedTime}
    <meta property="article:modified_time" content={modifiedTime}>
  {/if}

  <meta name="twitter:card" content={imageUrl ? 'summary_large_image' : 'summary'}>
  <meta name="twitter:title" content={title}>
  <meta name="twitter:description" content={description}>
  {#if imageUrl}
    <meta name="twitter:image" content={imageUrl}>
  {/if}

  {@html `<script type="application/ld+json">${serialisedSchema}</script>`}
</svelte:head>
