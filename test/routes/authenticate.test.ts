import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { AuthenticateResponse, RequestBody } from '../../src/types'
import { resetTestDb } from '../utils'

describe('POST /auth', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (data: RequestBody<{}, true>) => {
    const request = new Request('https://pfpk.test/auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<AuthenticateResponse>(),
    }
  }
})
