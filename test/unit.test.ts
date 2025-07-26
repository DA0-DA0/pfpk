import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test'
import { beforeEach, describe, expect, it } from 'vitest'

import worker from '../src'
import { ErrorResponse } from '../src/types'

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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'DELETE'
      )
    })
  })

  describe('Authentication middleware', () => {
    describe('POST /token (signature auth)', () => {
      it('returns 400 for missing body', async () => {
        const response = await fetch('/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        expect(response.status).toBe(400)
        const data = await response.json<ErrorResponse>()
        expect(data.error).toBe('Invalid request body.')
      })

      it('returns 400 for invalid auth data structure', async () => {
        const response = await fetch('/token', {
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
        const response = await fetch('/me', {
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
      const response = await fetch('/token', {
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
