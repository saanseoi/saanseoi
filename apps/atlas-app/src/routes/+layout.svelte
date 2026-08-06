<script lang="ts">
import './app.css'
import favicon from '$lib/assets/favicon.svg'
import { SiteHeader, SiteFooter } from '$lib/bits'
import { Page } from '$lib/bits'
let { children, data } = $props()
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
</svelte:head>
<Page>
  <SiteHeader user={data.user} />
  {@render children()}
  <SiteFooter />
</Page>
