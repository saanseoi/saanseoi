<script lang="ts">
import './app.css'
import { dev } from '$app/environment'
import { page } from '$app/state'
import favicon from '$lib/assets/favicon.svg'
import { SiteHeader, SiteFooter } from '$lib/bits'
import { Page } from '$lib/bits'
let { children, data } = $props()
let hideNav = $derived(page.url.searchParams.has('hideNav'))
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
  <SiteFooter />
</Page>
