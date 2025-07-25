import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('pfpk worker', () => {
  it('responds with 404 for /', async () => {
    const response = await SELF.fetch('http://example.com/')
    expect(await response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})
