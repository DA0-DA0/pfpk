import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { ResolveProfileResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /resolve/:chainId/:name', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (chainId: string, name: string) => {
    const request = new Request(
      `https://pfpk.test/resolve/${chainId}/${name}`,
      {
        method: 'GET',
      }
    )
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<ResolveProfileResponse>(),
    }
  }
})
