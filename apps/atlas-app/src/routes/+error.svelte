<script lang="ts">
import ErrorPage from '#lib/bits/pages/error/errorPage.svelte'

let { error } = $props()
</script>

<ErrorPage {error} />
