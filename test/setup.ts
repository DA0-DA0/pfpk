import { beforeAll, vi } from 'vitest'

import { resetTestDb } from './utils'

// Suppress console.error output.
vi.spyOn(console, 'error').mockImplementation(() => {})

beforeAll(async () => {
  await resetTestDb()
})
