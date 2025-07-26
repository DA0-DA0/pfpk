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

  it('returns 401 if no Authorization header', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated()
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No authorization header.')
  })

  it('returns 401 if not Bearer type', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated(user.token, {
      Authorization: 'Basic ' + user.token,
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token type, expected `Bearer`.')
  })

  it('returns 401 if no token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated(undefined, {
      Authorization: 'Bearer',
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No token provided.')
  })

  it('returns 401 if invalid token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated(undefined, {
      Authorization: 'Bearer invalid',
    })
    expect(response.status).toBe(401)
    expect(error).toBe(
      'Unauthorized: Invalid token. Error: token must consist of 2 or more parts'
    )
  })

  it('returns 401 if token expired after 14 days', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // advance time by 1 second less than 14 days
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 - 1000)

    // token should still be valid
    expect((await fetchAuthenticated(user.token)).response.status).toBe(204)

    // advance time by 2 seconds
    vi.advanceTimersByTime(2 * 1000)

    // token should be expired
    const { response: invalidResponse, error } = await fetchAuthenticated(
      user.token
    )
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Token expired.')
  })

  it('returns 404 if no profile found for valid token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // remove a profile by removing its only public key
    await user.unregisterPublicKeys({
      chainIds: 'neutron-1',
    })

    const { response, error } = await fetchAuthenticated(user.token)
    expect(response.status).toBe(404)
    expect(error).toBe('Profile not found.')
  })
})
