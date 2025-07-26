import { describe, expect, it, vi } from 'vitest'

import { authenticate, fetchMe } from './routes'
import { TestUser } from './TestUser'
import { INITIAL_NONCE } from '../../src/utils'

describe('POST /auth', () => {
  it('returns 200 with a token', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body: { token },
    } = await authenticate(await user.signRequestBody({}))

    expect(status).toBe(200)
    expect(token).toBeDefined()
    expect(token.length).toBeGreaterThan(0)

    // token should be valid
    const { response: fetchMeResponse } = await fetchMe(token)
    expect(fetchMeResponse.status).toBe(200)
  })

  it('expires after 14 days', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // advance time by 1 second less than 14 days
    vi.useFakeTimers()
    vi.advanceTimersByTime(14 * 24 * 60 * 60 * 1000 - 1000)

    // token should still be valid
    expect((await fetchMe(user.token)).response.status).toBe(200)

    // advance time by 2 seconds
    vi.advanceTimersByTime(2 * 1000)

    // token should be expired
    const { response: invalidResponse, error } = await fetchMe(user.token)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Token expired. Please re-authenticate.')
  })

  it('prevents replay attacks', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody({})
    expect(authBody.data.auth.nonce).toBe(INITIAL_NONCE)

    const { response } = await authenticate(authBody)
    expect(response.status).toBe(200)

    // nonce should be incremented
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 1)

    // should fail with invalid nonce
    const { response: invalidResponse, error } = await authenticate(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe(`Invalid nonce. Expected: ${INITIAL_NONCE + 1}`)

    // successfully authenticate with new nonce
    const { response: successResponse } = await authenticate(
      await user.signRequestBody({}, { nonce: INITIAL_NONCE + 1 })
    )
    expect(successResponse.status).toBe(200)

    // nonce should be incremented again
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 2)
  })

  it('rejects timestamps older than 5 minutes', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody({})

    // advance time by 5 minutes and 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

    // should fail with timestamp too old
    const { response: expiredResponse, error } = await authenticate(authBody)
    expect(expiredResponse.status).toBe(401)
    expect(error).toBe(
      'Unauthorized: Timestamp must be within the past 5 minutes.'
    )
  })

  it('rejects incorrect signatures', async () => {
    const user = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    const authBody = await user.signRequestBody({})
    const authBody2 = await user2.signRequestBody({})
    // replace signature with incorrect signature from another public key
    authBody.signature = authBody2.signature

    // should fail with invalid signature
    const { response: invalidResponse, error } = await authenticate(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid signature.')
  })
})
