import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'

import { fetchAuthenticated, invalidateTokens } from './routes'
import { TestUser } from '../TestUser'

describe('DELETE /tokens', () => {
  it('returns 204 and deletes provided tokens', async () => {
    const user = await TestUser.create('neutron-1')

    // create 2 tokens
    const [tokenToDelete, adminToken] = await user.createTokens({
      tokens: [{}, { audience: ['pfpk'], role: 'admin' }],
    })

    // should have 2 tokens
    let tokens = await user.fetchTokens()
    expect(tokens.length).toBe(2)

    // delete first token via signature auth
    const { response } = await invalidateTokens(
      await user.signRequestBody({
        tokens: [tokenToDelete.id],
      })
    )
    expect(response.status).toBe(204)

    // should have 1 token
    tokens = await user.fetchTokens()
    expect(tokens.length).toBe(1)

    // deleted token should no longer be valid
    const { response: invalidResponse, error: invalidError } =
      await fetchAuthenticated(tokenToDelete.token)
    expect(invalidResponse.status).toBe(401)
    expect(invalidError).toBe('Unauthorized: Token invalidated.')

    // delete remaining token via JWT auth
    const { response: response2 } = await invalidateTokens(
      await user.signRequestBody({
        tokens: [tokens[0].id],
      }),
      adminToken.token
    )
    expect(response2.status).toBe(204)
  })

  it('returns 204 and deletes expired tokens', async () => {
    const user = await TestUser.create('neutron-1')

    // create 3 tokens, one as admin so we can fetch tokens
    await user.createTokens({
      tokens: [{ audience: ['pfpk'], role: 'admin' }, {}, {}],
    })

    // should have 3 tokens
    let tokens = await user.fetchTokens()
    expect(tokens.length).toBe(3)

    // advance time by 14 days and 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 + 1000)

    // DB should have 3 tokens in it
    let count = (
      await env.DB.prepare('SELECT COUNT(*) as count FROM profile_tokens').all()
    ).results[0].count
    expect(count).toBe(3)

    // invalidate expired tokens even when no tokens are provided in the body
    const { response } = await invalidateTokens(await user.signRequestBody({}))
    expect(response.status).toBe(204)

    // DB should have 0 tokens in it
    count = (
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
