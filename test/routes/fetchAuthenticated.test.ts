import { describe, expect, it, vi } from 'vitest'

import { fetchAuthenticated } from './routes'
import { TestUser } from './TestUser'

describe('GET /auth', () => {
  it('returns 204 if authenticated', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // both tokens should be valid
    expect((await fetchAuthenticated(user.tokens.admin)).response.status).toBe(
      204
    )
    expect((await fetchAuthenticated(user.tokens.verify)).response.status).toBe(
      204
    )
  })

  it('returns 204 if token has audiences but none are required', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate({
      audience: ['pfpk.test', 'daodao.zone'],
    })

    // both tokens should be valid
    expect((await fetchAuthenticated(user.tokens.admin)).response.status).toBe(
      204
    )
    expect((await fetchAuthenticated(user.tokens.verify)).response.status).toBe(
      204
    )
  })

  it('returns 204 with matching audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate({
      audience: ['pfpk.test', 'daodao.zone'],
    })

    expect(
      (
        await fetchAuthenticated(user.tokens.admin, {
          query: {
            audience: 'pfpk.test',
          },
        })
      ).response.status
    ).toBe(204)

    expect(
      (
        await fetchAuthenticated(user.tokens.verify, {
          query: {
            audience: 'daodao.zone',
          },
        })
      ).response.status
    ).toBe(204)

    expect(
      (
        await fetchAuthenticated(user.tokens.verify, {
          query: [
            ['audience', 'pfpk.test'],
            ['audience', 'daodao.zone'],
          ],
        })
      ).response.status
    ).toBe(204)

    expect(
      (
        await fetchAuthenticated(user.tokens.verify, {
          query: [
            ['audience', 'invalid.audience'],
            ['audience', 'pfpk.test'],
          ],
        })
      ).response.status
    ).toBe(204)
  })

  it('returns 401 with mismatched audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate({
      audience: ['pfpk.test', 'daodao.zone'],
    })

    const { response, error } = await fetchAuthenticated(user.tokens.verify, {
      query: {
        audience: 'pf.pk',
      },
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid audience.')
  })

  it('returns 401 with no audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated(user.tokens.verify, {
      query: {
        audience: 'pf.pk',
      },
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid audience.')
  })

  it('returns 401 if no Authorization header', async () => {
    const { response, error } = await fetchAuthenticated()
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No authorization header.')
  })

  it('returns 401 if not Bearer type', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await fetchAuthenticated(undefined, {
      headers: {
        Authorization: 'Basic ' + user.tokens.verify,
      },
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token type, expected `Bearer`.')
  })

  it('returns 401 if no token', async () => {
    const { response, error } = await fetchAuthenticated(undefined, {
      headers: {
        Authorization: 'Bearer ',
      },
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No token provided.')
  })

  it('returns 401 if invalid token', async () => {
    const { response, error } = await fetchAuthenticated('invalid')
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

    // tokens should still be valid
    expect((await fetchAuthenticated(user.tokens.verify)).response.status).toBe(
      204
    )
    expect((await fetchAuthenticated(user.tokens.admin)).response.status).toBe(
      204
    )

    // advance time by 2 seconds
    vi.advanceTimersByTime(2 * 1000)

    // verify token should be expired
    const { response: invalidResponse, error } = await fetchAuthenticated(
      user.tokens.verify
    )
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Token expired.')

    // admin token should be expired
    const { response: invalidResponse2, error: error2 } =
      await fetchAuthenticated(user.tokens.admin)
    expect(invalidResponse2.status).toBe(401)
    expect(error2).toBe('Unauthorized: Token expired.')
  })

  it('returns 404 if no profile found for valid token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // remove a profile by removing its only public key
    await user.unregisterPublicKeys({
      chainIds: 'neutron-1',
    })

    const { response, error } = await fetchAuthenticated(user.tokens.verify)
    expect(response.status).toBe(404)
    expect(error).toBe('Profile not found.')

    const { response: response2, error: error2 } = await fetchAuthenticated(
      user.tokens.admin
    )
    expect(response2.status).toBe(404)
    expect(error2).toBe('Profile not found.')
  })
})
