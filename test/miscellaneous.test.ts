import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('integration', () => {
  const fetch = async (path: string, init?: RequestInit): Promise<Response> => {
    const request = new Request('https://pfpk.test' + path, init)
    return await SELF.fetch(request)
  }

  it('responds with 404 for root path', async () => {
    const response = await fetch('/')

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
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
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'POST'
      )
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'DELETE'
      )
    })
  })
})
