import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { SearchProfilesResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /search/:chainId/:namePrefix', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (chainId: string, namePrefix: string) => {
    const request = new Request(
      `https://pfpk.test/search/${chainId}/${namePrefix}`,
      {
        method: 'GET',
      }
    )
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<SearchProfilesResponse>(),
    }
  }
})
