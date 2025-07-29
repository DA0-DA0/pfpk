import { describe, expect, it, vi } from 'vitest'

import { fetchAuthenticated } from './routes'
import { TestUser } from '../TestUser'

describe('GET /auth', () => {
  it('returns 200 for valid tokens', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    // both tokens should be valid
    expect((await fetchAuthenticated(user.tokens.admin)).response.status).toBe(
      200
    )
    expect(
      (await fetchAuthenticated(user.tokens.notAdmin)).response.status
    ).toBe(200)
  })

  it('returns 200 if token has audiences but none are required', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          audience: ['pfpk.test', 'daodao.zone'],
        },
      ],
    })

    // token should be valid
    expect((await fetchAuthenticated(user.tokens.first)).response.status).toBe(
      200
    )
  })

  it('returns 200 with matching audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          audience: ['pfpk.test', 'daodao.zone'],
        },
      ],
    })

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['pfpk.test'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['daodao.zone'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['pfpk.test', 'daodao.zone'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['invalid.audience', 'pfpk.test'],
        })
      ).response.status
    ).toBe(200)
  })

  it('returns 401 with mismatched audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          audience: ['pfpk.test', 'daodao.zone'],
        },
      ],
    })

    const { response, error } = await fetchAuthenticated(user.tokens.first, {
      audience: ['pf.pk'],
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token audience.')
  })

  it('returns 401 with no audience', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({ tokens: [{}] })

    const { response, error } = await fetchAuthenticated(user.tokens.first, {
      audience: ['pf.pk'],
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token audience.')
  })

  it('returns 200 if token has role but none are required', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          role: 'some_role',
        },
      ],
    })

    // token should be valid
    expect((await fetchAuthenticated(user.tokens.first)).response.status).toBe(
      200
    )
  })

  it('returns 200 with matching role', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          role: 'some_role',
        },
      ],
    })

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          role: ['some_role'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          role: ['some_other_role', 'some_role'],
        })
      ).response.status
    ).toBe(200)
  })

  it('returns 401 with mismatched role', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          role: 'some_role',
        },
      ],
    })

    const { response, error } = await fetchAuthenticated(user.tokens.first, {
      role: ['some_other_role'],
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token role.')
  })

  it('returns 401 with no role', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({ tokens: [{}] })

    const { response, error } = await fetchAuthenticated(user.tokens.first, {
      role: ['some_role'],
    })
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token role.')
  })

  it('returns 200 with matching audience and role', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [{ audience: ['pfpk.test'], role: 'some_role' }],
    })

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['pfpk.test', 'daodao.zone'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          role: ['some_role'],
        })
      ).response.status
    ).toBe(200)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['pfpk.test'],
          role: ['some_role'],
        })
      ).response.status
    ).toBe(200)
  })

  it('returns 401 with mismatched audience and role', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [{ audience: ['pfpk.test'], role: 'some_role' }],
    })

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['invalid.audience'],
        })
      ).response.status
    ).toBe(401)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          role: ['invalid_role'],
        })
      ).response.status
    ).toBe(401)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['pfpk.test'],
          role: ['invalid_role'],
        })
      ).response.status
    ).toBe(401)

    expect(
      (
        await fetchAuthenticated(user.tokens.first, {
          audience: ['invalid.audience'],
          role: ['some_role'],
        })
      ).response.status
    ).toBe(401)
  })

  it('returns 401 if no Authorization header nor cookie', async () => {
    const { response, error } = await fetchAuthenticated()
    expect(response.status).toBe(401)
    expect(error).toBe(
      'Unauthorized: No authorization header nor cookie provided.'
    )
  })

  it('returns 401 if not Bearer type', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    const { response, error } = await fetchAuthenticated(undefined, {
      headers: {
        Authorization: 'Basic ' + user.tokens.first,
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
    await user.createTokens()

    // advance time by 1 second less than 14 days
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 - 1000)

    // tokens should still be valid
    expect((await fetchAuthenticated(user.tokens.admin)).response.status).toBe(
      200
    )
    expect(
      (await fetchAuthenticated(user.tokens.notAdmin)).response.status
    ).toBe(200)

    // advance time by 2 seconds
    vi.advanceTimersByTime(2 * 1000)

    // both tokens should be expired
    const { response: invalidResponse, error } = await fetchAuthenticated(
      user.tokens.admin
    )
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Token expired.')

    const { response: invalidResponse2, error: error2 } =
      await fetchAuthenticated(user.tokens.notAdmin)
    expect(invalidResponse2.status).toBe(401)
    expect(error2).toBe('Unauthorized: Token expired.')
  })

  it('returns 404 if no profile found for valid token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    // remove a profile by removing its only public key
    await user.unregisterPublicKeys({
      chainIds: 'neutron-1',
    })

    const { response, error } = await fetchAuthenticated(user.tokens.admin)
    expect(response.status).toBe(404)
    expect(error).toBe('Profile not found.')

    const { response: response2, error: error2 } = await fetchAuthenticated(
      user.tokens.notAdmin
    )
    expect(response2.status).toBe(404)
    expect(error2).toBe('Profile not found.')
  })
})
