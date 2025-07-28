import { describe, expect, it, vi } from 'vitest'

import { fetchTokens } from './routes'
import { TestUser } from '../TestUser'

describe('GET /tokens', () => {
  it('returns 200 with tokens', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens({
      tokens: [
        {
          name: 'test token 1',
          audience: ['pfpk'],
          role: 'admin',
        },
      ],
    })

    // fetchTokens should return token via JWT token auth
    const { response, body } = await fetchTokens(user.tokens.admin)
    expect(response.status).toBe(200)
    expect(body.tokens.length).toBe(1)
    expect(body.tokens).toEqual([
      {
        id: expect.any(String),
        name: 'test token 1',
        audience: ['pfpk'],
        role: 'admin',
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])

    // create another token
    await user.createTokens({
      tokens: [
        {
          name: 'test token 2',
        },
      ],
    })

    // fetchTokens should return both tokens
    const { response: response2, body: body2 } = await fetchTokens(
      user.tokens.admin
    )
    expect(response2.status).toBe(200)
    expect(body2.tokens.length).toBe(2)
    expect(body2.tokens).toEqual([
      {
        id: expect.any(String),
        name: 'test token 1',
        audience: ['pfpk'],
        role: 'admin',
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: expect.any(String),
        name: 'test token 2',
        audience: null,
        role: null,
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])
  })

  it('returns 401 for non-admin token', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    const { response, error } = await fetchTokens(user.tokens.notAdmin)
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid token role.')
  })

  it('does not return expired tokens', async () => {
    const user = await TestUser.create('neutron-1')

    // create 3 tokens
    await user.createTokens({
      tokens: [{}, {}, {}],
    })

    // advance time by 14 days minus 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 - 1000)

    // create 1 more token, admin so we can fetch tokens
    await user.createTokens({ tokens: [{ audience: ['pfpk'], role: 'admin' }] })

    // should have 4 tokens
    let tokens = await user.fetchTokens()
    expect(tokens.length).toBe(4)

    // advance time by 2 seconds, expiring the original 3 tokens
    vi.advanceTimersByTime(2000)

    // should only return the 1 valid token
    tokens = await user.fetchTokens()
    expect(tokens.length).toBe(1)
  })

  it('returns 401 if no auth token provided', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    const { response, error } = await fetchTokens()
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No authorization header.')
  })
})
