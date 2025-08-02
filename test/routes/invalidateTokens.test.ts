import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import { TEST_HOSTNAME, fetchAuthenticated, invalidateTokens } from './routes'
import { TestUser } from '../TestUser'

describe('DELETE /tokens', () => {
  it('returns 204 and deletes provided and expired tokens', async () => {
    const user = await TestUser.create('neutron-1')

    // create 1 admin token
    await user.createTokens({
      tokens: [{ audience: [TEST_HOSTNAME], role: 'admin' }],
    })

    // advance time by 14 days minus 1 second, so the admin token is almost
    // expired but not yet
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 - 1000)

    // create 2 tokens
    const [tokenToDelete, adminToken] = await user.createTokens({
      tokens: [{}, { audience: [TEST_HOSTNAME], role: 'admin' }],
    })

    // should have 3 valid tokens
    let tokens = await user.fetchTokens()
    expect(tokens.length).toBe(3)

    // delete first token via signature auth
    const { response } = await invalidateTokens(
      await user.signRequestBody({
        tokens: [tokenToDelete.id],
      })
    )
    expect(response.status).toBe(204)

    // should have 2 tokens, since the other tokens are still valid
    tokens = await user.fetchTokens()
    expect(tokens.length).toBe(2)

    // deleted token should no longer be valid
    const { response: invalidResponse, error: invalidError } =
      await fetchAuthenticated(tokenToDelete.token)
    expect(invalidResponse.status).toBe(401)
    expect(invalidError).toBe('Unauthorized: Token invalidated.')

    // advance time by 2 seconds, expiring the admin token
    vi.advanceTimersByTime(2000)

    // should have 1 token
    tokens = await user.fetchTokens()
    expect(tokens.length).toBe(1)

    // DB should have 2 rows still since the expired token is not deleted yet
    let count = (
      await env.DB.prepare('SELECT COUNT(*) as count FROM profile_tokens').all()
    ).results[0].count
    expect(count).toBe(2)

    // delete remaining token via JWT auth
    const { response: response2 } = await invalidateTokens(
      await user.signRequestBody({
        tokens: [adminToken.id],
      }),
      adminToken.token
    )
    expect(response2.status).toBe(204)

    // DB should have 0 rows in it
    count = (
      await env.DB.prepare('SELECT COUNT(*) as count FROM profile_tokens').all()
    ).results[0].count
    expect(count).toBe(0)
  })

  it('returns 204 and deletes all tokens when no tokens are provided', async () => {
    const user = await TestUser.create('neutron-1')

    // create 3 tokens, one as admin so we can fetch tokens
    await user.createTokens({
      tokens: [{ audience: [TEST_HOSTNAME], role: 'admin' }, {}, {}],
    })

    // should have 3 tokens
    let tokens = await user.fetchTokens()
    expect(tokens.length).toBe(3)

    // invalidate all tokens even when no tokens are provided in the body
    const { response } = await invalidateTokens(await user.signRequestBody({}))
    expect(response.status).toBe(204)

    // DB should have 0 tokens in it
    const count = (
      await env.DB.prepare('SELECT COUNT(*) as count FROM profile_tokens').all()
    ).results[0].count
    expect(count).toBe(0)
  })

  it("doesn't delete tokens from other profiles", async () => {
    const user1 = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    await user1.createTokens({ tokens: [{}] })
    const [{ id: user2TokenId }] = await user2.createTokens({ tokens: [{}] })

    // both tokens work
    expect(await user1.fetchAuthenticated()).toBe(true)
    expect(await user2.fetchAuthenticated()).toBe(true)

    // attempt to delete token from user2 as user1. doesn't throw an error.
    const { response } = await invalidateTokens(
      await user1.signRequestBody({
        tokens: [user2TokenId],
      })
    )
    expect(response.status).toBe(204)

    // both tokens still work
    expect(await user1.fetchAuthenticated()).toBe(true)
    expect(await user2.fetchAuthenticated()).toBe(true)
  })

  it('returns 401 for non-admin token', async () => {
    const user = await TestUser.create('neutron-1')
    const [{ id }] = await user.createTokens()

    const { response, error } = await invalidateTokens(
      {
        data: {
          tokens: [id],
        },
      },
      user.tokens.notAdmin
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid auth data.')
  })
})
