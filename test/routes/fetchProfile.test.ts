import { SELF } from 'cloudflare:test'
import { beforeEach, describe } from 'vitest'

import { FetchProfileResponse } from '../../src/types'
import { resetTestDb } from '../utils'

describe('GET /:publicKey', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (publicKey: string) => {
    const request = new Request(`https://pfpk.test/${publicKey}`, {
      method: 'GET',
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<FetchProfileResponse>(),
    }
  }
})

describe('GET /address/:bech32Address', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (bech32Address: string) => {
    const request = new Request(`https://pfpk.test/address/${bech32Address}`, {
      method: 'GET',
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<FetchProfileResponse>(),
    }
  }
})

describe('GET /hex/:addressHex', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (addressHex: string) => {
    const request = new Request(`https://pfpk.test/hex/${addressHex}`, {
      method: 'GET',
    })
    const response = await SELF.fetch(request)
    return {
      response,
      body: await response.json<FetchProfileResponse>(),
    }
  }
})
