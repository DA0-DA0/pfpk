import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'

export default defineWorkersConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/*.test.ts'],
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['libsodium-wrappers-sumo', 'secp256k1', '@cosmjs/encoding'],
        },
      },
    },
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
})
