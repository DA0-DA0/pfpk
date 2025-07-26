import { describe, expect, it, vi } from 'vitest'

import { fetchAuthenticated } from './routes'
import { TestUser } from './TestUser'

describe('GET /authenticated', () => {
  it('returns 204 if authenticated', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // token should be valid
    const { response } = await fetchAuthenticated(user.token)
    expect(response.status).toBe(204)
  })

  it('returns 401 if not authenticated', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // advance time by 14 days and 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 + 1000)

    // token should be expired
    const { response: invalidResponse, error } = await fetchAuthenticated(
      user.token
    )
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Token expired.')
  })
})
