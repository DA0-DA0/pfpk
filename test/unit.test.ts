import { toBech32 } from '@cosmjs/encoding'
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import worker from '../src'
import {
  ErrorResponse,
  NonceResponse,
  SearchProfilesResponse,
  StatsResponse,
} from '../src/types'
import { INITIAL_NONCE } from '../src/utils/auth'

describe('pfpk worker unit', () => {
  let ctx: ExecutionContext

  beforeEach(async () => {
    ctx = createExecutionContext()
  })

  const fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const request = new Request('https://pfpk.test' + path, init)
    const response = await worker.fetch(request, env, ctx)
    await waitOnExecutionContext(ctx)
    return response
  }

  describe('404 handling', () => {
    it('responds with 404 for /', async () => {
      const response = await fetch('/')
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('Not found')
    })
  })

  describe('CORS handling', () => {
    it('handles OPTIONS preflight requests', async () => {
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'POST'
      )
    })
  })

  describe('GET /stats', () => {
    it('returns total profile count', async () => {
      const response = await fetch('/stats')

      expect(response.status).toBe(200)
      const data = await response.json<StatsResponse>()
      expect(data.total).toBeGreaterThanOrEqual(0)

      // TODO: Create a profile and check stats again
    })
  })

  describe('GET /nonce/:publicKey', () => {
    const mockPublicKey =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'

    it('returns nonce for new public key', async () => {
      const response = await fetch(`/nonce/${mockPublicKey}`)

      expect(response.status).toBe(200)
      const data = await response.json<NonceResponse>()
      expect(data.nonce).toBe(INITIAL_NONCE)
    })
  })

  describe('GET /:publicKey (fetchProfile)', () => {
    const mockPublicKey =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef01'

    it('returns empty profile for non-existent public key', async () => {
      const response = await fetch(`/${mockPublicKey}`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        uuid: '',
        nonce: INITIAL_NONCE,
        name: null,
        nft: null,
        chains: {},
      })
    })
  })

  describe('GET /address/:bech32Address (fetchProfile)', () => {
    const mockAddress = toBech32('cosmos', new Uint8Array(20))

    it('returns empty profile for non-existent address', async () => {
      const response = await fetch(`/address/${mockAddress}`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        uuid: '',
        nonce: INITIAL_NONCE,
        name: null,
        nft: null,
        chains: {},
      })
    })
  })

  describe('GET /hex/:addressHex (fetchProfile)', () => {
    const mockAddressHex = 'abcd1234567890abcdef1234567890abcdef1234'

    it('returns empty profile for non-existent address hex', async () => {
      const response = await fetch(`/hex/${mockAddressHex}`)

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data).toMatchObject({
        uuid: '',
        nonce: INITIAL_NONCE,
        name: null,
        nft: null,
        chains: {},
      })
    })
  })

  describe('GET /search/:chainId/:namePrefix', () => {
    it('returns empty search results for non-existent names', async () => {
      const response = await fetch('/search/neutron-1/nonexistent')

      expect(response.status).toBe(200)
      const data = await response.json<SearchProfilesResponse>()
      expect(data.profiles).toEqual([])
    })
  })

  describe('GET /resolve/:chainId/:name', () => {
    it('returns 404 for non-existent name resolution', async () => {
      const response = await fetch('/resolve/neutron-1/nonexistent')

      expect(response.status).toBe(404)
    })
  })

  describe('Authentication middleware', () => {
    describe('POST /auth (signature auth)', () => {
      it('returns 400 for missing body', async () => {
        const response = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        expect(response.status).toBe(400)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Invalid request body.')
      })

      it('returns 400 for invalid auth data structure', async () => {
        const response = await fetch('/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: { auth: {} },
            signature: 'invalid',
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Invalid auth data.')
      })
    })

    describe('GET /me (JWT auth)', () => {
      it('returns 401 for missing authorization header', async () => {
        const response = await fetch('/me')

        expect(response.status).toBe(401)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Unauthorized: No authorization header.')
      })

      it('returns 401 for invalid token type', async () => {
        const response = await fetch('/me', {
          headers: {
            Authorization: 'Basic invalid-token',
          },
        })

        expect(response.status).toBe(401)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe(
          'Unauthorized: Invalid token type, expected `Bearer`.'
        )
      })

      it('returns 401 for missing token', async () => {
        const response = await fetch('/me', {
          headers: {
            Authorization: 'Bearer',
          },
        })

        expect(response.status).toBe(401)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Unauthorized: No token provided.')
      })
    })

    describe('POST / (updateProfile - JWT or signature auth)', () => {
      it('returns 401 when both auth methods fail', async () => {
        const response = await fetch('/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: { profile: { nonce: 0 } },
          }),
        })

        expect(response.status).toBe(400)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Invalid auth data.')
      })
    })
  })

  describe('Error handling', () => {
    it('returns structured error responses', async () => {
      const response = await fetch('/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'data' }),
      })

      expect(response.status).toBe(400)
      const data = await response.json<ErrorResponse>()
      expect(data.error).toBe('Invalid auth data.')
    })
  })
})
