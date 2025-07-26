import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { StatsResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /stats', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async () => {
    const request = new Request('https://pfpk.test/stats', {
      method: 'GET',
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<StatsResponse>(),
    }
  }
})
