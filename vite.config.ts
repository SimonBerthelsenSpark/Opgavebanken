import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** `vite --mode e2e` swaps the Firestore store for an in-memory one (automated browser test only). */
function fakeStore(): Plugin {
  const fake = fileURLToPath(new URL('./src/client/store.fake.ts', import.meta.url))
  return {
    name: 'fake-store',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.includes('/src/client/') && /(^|\/)store$/.test(source)) return fake
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'e2e' ? [fakeStore()] : [])],
  server: {
    port: 5173,
    strictPort: true,
    // only used with scripts/local-api.ts; under `netlify dev` the CLI routes /api itself
    proxy: process.env.LOCAL_API ? { '/api': 'http://127.0.0.1:8787' } : undefined,
  },
  test: { include: ['tests/**/*.test.ts'] },
}))
