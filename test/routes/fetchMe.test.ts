import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { FetchProfileResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /me', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (token: string) => {
    const request = new Request('https://pfpk.test/me', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<FetchProfileResponse>(),
    }
  }
})
