<script lang="ts">
import { page } from '$app/state'
import ErrorPage from '#lib/bits/pages/error/errorPage.svelte'
</script>

<ErrorPage error={page.error} />
