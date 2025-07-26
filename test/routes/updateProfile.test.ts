import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import {
  RequestBody,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../../src/types'
import { resetTestDb } from '../utils'

describe('POST /', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (
    data: RequestBody<UpdateProfileRequest>,
    token?: string
  ) => {
    const request = new Request('https://pfpk.test/', {
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
      body: await response.json<UpdateProfileResponse>(),
    }
  }
})
