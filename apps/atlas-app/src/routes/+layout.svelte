<script lang="ts">
import './app.css'
import { dev } from '$app/env'
import { page } from '$app/state'
import favicon from '#lib/assets/favicon.svg'
import { SiteHeader } from '#lib/bits/patterns/site-header/index.js'
import { Page } from '#lib/bits/primitives/page/index.js'
let { children, data } = $props()
let hideNav = $derived(page.url.searchParams.has('hideNav'))
let isLandingPage = $derived(page.route.id === '/')
let siteFooter = $derived(
  isLandingPage ? undefined : import('#lib/bits/patterns/site-footer/index.js'),
)
</script>

<svelte:head>
  <title>山水 | SaanSeoi</title>
  <link rel="icon" href={favicon}>

  <link rel="preconnect" href="https://fonts.googleapis.com">

  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">

  <link
    href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Caveat:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap"
    rel="stylesheet"
  >
  {#if !dev}
    <!-- Cloudflare Web Analytics -->
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: '54e4db0c39524c4fbcf35f4d26009910', spa: true })}
    ></script>
  <!-- End Cloudflare Web Analytics -->
  {/if}
</svelte:head>
<Page>
  {#if !hideNav}
    <SiteHeader user={data.user} />
  {/if}
  {@render children()}
  {#if !isLandingPage}
    {#await siteFooter then footer}
      {#if footer}
        {@const SiteFooter = footer.SiteFooter}
        <SiteFooter />
      {/if}
    {/await}
  {/if}
</Page>
