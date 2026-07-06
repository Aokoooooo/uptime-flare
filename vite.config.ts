import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      persistState: { path: '.wrangler-local/state' },
    }),
    tanstackStart({
      router: {
        routeFileIgnorePattern: '\\.test\\.[tj]sx?$',
      },
    }),
    react(),
  ],
})
