import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const apps = ['main', 'script-editor', 'wallpaper', 'searchbar'];

// One dev server and one build for all windows; each app keeps its own folder (spec §8.3).
export default defineConfig({
  root: resolve(root, 'apps'),
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: Object.fromEntries(apps.map((a) => [a, resolve(root, 'apps', a, 'index.html')])),
    },
  },
});
