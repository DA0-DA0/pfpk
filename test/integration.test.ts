import { toBech32 } from '@cosmjs/encoding'
import { SELF } from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetTestDb } from './utils'
import {
  ErrorResponse,
  FetchProfileResponse,
  NonceResponse,
  SearchProfilesResponse,
  StatsResponse,
} from '../src/types'
import { INITIAL_NONCE } from '../src/utils'

describe('pfpk worker integration', () => {
  beforeEach(async () => {
    await resetTestDb()
  })

  const fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const request = new Request('https://pfpk.test' + path, init)
    return await SELF.fetch(request)
  }

  describe('Public endpoints', () => {
    it('responds with 404 for root path', async () => {
      const response = await fetch('/')

      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not found')
    })

    it('serves stats endpoint', async () => {
      const response = await fetch('/stats')

      expect(response.status).toBe(200)
      const data = await response.json<StatsResponse>()
      expect(data.total).toBe(0)
    })

    it('serves nonce endpoint for any public key', async () => {
      const mockPublicKey =
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'
      const response = await fetch(`/nonce/${mockPublicKey}`)

      expect(response.status).toBe(200)
      const data = await response.json<NonceResponse>()
      expect(data.nonce).toBe(INITIAL_NONCE)
    })
  })

  describe('Profile fetching', () => {
    it('returns empty profile for non-existent public key', async () => {
      const mockPublicKey =
        'nonexistent123456789abcdef123456789abcdef123456789abcdef123456789abc'
      const response = await fetch(`/${mockPublicKey}`)

      expect(response.status).toBe(200)
      const data = await response.json<FetchProfileResponse>()
      expect(data).toMatchObject({
        uuid: '',
        nonce: INITIAL_NONCE,
        name: null,
        nft: null,
        chains: {},
      })
    })

    it('handles bech32 address lookup', async () => {
      const mockAddress = toBech32('cosmos', new Uint8Array(20))
      const response = await fetch(`/address/${mockAddress}`)

      expect(response.status).toBe(200)
      const data = await response.json<FetchProfileResponse>()
      expect(data.uuid).toBe('')
      expect(data.nonce).toBe(INITIAL_NONCE)
      expect(data.chains).toEqual({})
    })

    it('handles hex address lookup', async () => {
      const mockAddressHex = 'abcd1234567890abcdef1234567890abcdef1234'
      const response = await fetch(`/hex/${mockAddressHex}`)

      expect(response.status).toBe(200)
      const data = await response.json<FetchProfileResponse>()
      expect(data.uuid).toBe('')
      expect(data.nonce).toBe(INITIAL_NONCE)
      expect(data.chains).toEqual({})
    })
  })

  describe('Search and resolution', () => {
    it('handles profile search with empty results', async () => {
      const response = await fetch('/search/cosmoshub-4/nonexistentname')

      expect(response.status).toBe(200)
      const data = await response.json<SearchProfilesResponse>()
      expect(data.profiles).toEqual([])
    })

    it('handles name resolution with 404', async () => {
      const response = await fetch('/resolve/cosmoshub-4/nonexistentname')

      expect(response.status).toBe(404)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Profile not found.')
    })
  })

  describe('CORS support', () => {
    it('includes CORS headers in responses', async () => {
      const response = await fetch('/stats', {
        headers: {
          Origin: 'http://localhost:3000',
        },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeTruthy()
    })

    it('handles preflight requests', async () => {
      const response = await fetch('/stats', {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'GET',
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'GET'
      )
    })
  })

  describe('Authentication endpoints', () => {
    it('rejects authentication with missing data', async () => {
      const response = await fetch('/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })

    it('rejects JWT endpoint without authorization', async () => {
      const response = await fetch('/me')

      expect(response.status).toBe(401)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Unauthorized: No authorization header.')
    })

    it('rejects profile updates without proper auth', async () => {
      const response = await fetch('/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            profile: {
              nonce: INITIAL_NONCE,
              name: 'testuser',
            },
          },
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })

    it('rejects public key registration without auth', async () => {
      const response = await fetch('/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            publicKeys: [],
          },
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })

    it('rejects public key unregistration without auth', async () => {
      const response = await fetch('/unregister', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            publicKeys: [],
          },
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })
  })

  describe('Error handling', () => {
    it('returns structured error responses', async () => {
      const response = await fetch('/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invalid: 'request' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })

    it('handles malformed JSON gracefully', async () => {
      const response = await fetch('/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid request body.')
    })
  })

  describe('HTTP methods', () => {
    it('only allows GET and POST methods', async () => {
      const response = await fetch('/stats', {
        method: 'PUT',
      })
      expect(response.status).toBe(404) // Router doesn't handle PUT
    })

    it('correctly routes POST requests', async () => {
      const response = await fetch('/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })
  })
})
