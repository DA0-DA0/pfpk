import { beforeAll } from 'vitest'

import { resetTestDb } from './utils'

beforeAll(async () => {
  await resetTestDb()
})
