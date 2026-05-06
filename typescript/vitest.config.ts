import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        execArgv: ['--experimental-wasm-jspi'],
      },
      threads: {
        execArgv: ['--experimental-wasm-jspi'],
      },
    },
  },
})
