<script lang="ts">
  import { SearchField } from '@bv/ui';
  import { search } from './search.svelte';
</script>

{#if search.open && search.view}
  <div class="overlay">
    <SearchField view={search.view} oninput={(t) => search.input(t)} onkey={(k) => search.key(k)} />
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    left: 50%;
    bottom: 8%;
    transform: translateX(-50%);
    z-index: 55;
  }
</style>
