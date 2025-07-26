import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import {
  RegisterPublicKeyRequest,
  RegisterPublicKeyResponse,
  RequestBody,
} from '../../src/types'
import { resetTestDb } from '../utils'

describe('POST /register', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (
    data: RequestBody<RegisterPublicKeyRequest>,
    token?: string
  ) => {
    const request = new Request('https://pfpk.test/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<RegisterPublicKeyResponse>(),
    }
  }
})
