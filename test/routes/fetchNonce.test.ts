import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { NonceResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /nonce/:publicKey', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (publicKey: string) => {
    const request = new Request(`https://pfpk.test/nonce/${publicKey}`, {
      method: 'GET',
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<NonceResponse>(),
    }
  }
})
