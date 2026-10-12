import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// Unit tests run in plain Node, not in a Nuxt environment, so the Nuxt alias that app code
// must use for shared/ is mapped here. A relative import into shared/ from app/ passes in
// dev but breaks `nuxt build`.
export default defineConfig({
  resolve: {
    alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
})
