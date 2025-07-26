import { describe, expect, it, vi } from 'vitest'

import { createToken, fetchAuthenticated } from './routes'
import { TestUser } from './TestUser'
import { INITIAL_NONCE } from '../../src/utils'

describe('POST /token', () => {
  it('returns 200 with a valid token', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body: { token },
    } = await createToken(await user.signRequestBody({}))

    expect(status).toBe(200)
    expect(token).toBeDefined()
    expect(token.length).toBeGreaterThan(0)

    // token should be valid
    const { response } = await fetchAuthenticated(token)
    expect(response.status).toBe(204)
  })

  it('returns 400 when missing body', async () => {
    const { response, error } = await createToken()
    expect(response.status).toBe(400)
    expect(error).toBe('Invalid request body.')
  })

  it('returns 400 with invalid auth data', async () => {
    const user = await TestUser.create('neutron-1')
    const body = await user.signRequestBody({})

    for (const key of Object.keys(body.data.auth)) {
      const auth: any = { ...body.data.auth }
      delete auth[key]

      const { response, error } = await createToken({
        ...body,
        data: {
          ...body.data,
          auth,
        },
      })
      expect(response.status).toBe(400)
      expect(error).toBe('Invalid auth data.')
    }
  })

  it('returns 401 for timestamps older than 5 minutes', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody({})

    // advance time by 5 minutes and 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

    // should fail with timestamp too old
    const { response: expiredResponse, error } = await createToken(authBody)
    expect(expiredResponse.status).toBe(401)
    expect(error).toBe(
      'Unauthorized: Timestamp must be within the past 5 minutes.'
    )
  })

  it('returns 400 for unsupported public key types', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody({})

    authBody.data.auth.publicKeyType = 'unsupported'

    const { response, error } = await createToken(authBody)
    expect(response.status).toBe(400)
    expect(error).toBe('Unsupported public key type: unsupported')
  })

  it('returns 401 for invalid signatures', async () => {
    const user = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    const authBody = await user.signRequestBody({})
    const authBody2 = await user2.signRequestBody({})
    // replace signature with incorrect signature from another public key
    authBody.signature = authBody2.signature

    // should fail with invalid signature
    const { response: invalidResponse, error } = await createToken(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid signature.')
  })

  it('prevents replay attacks by verifying and auto-incrementing nonce', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody({})
    expect(authBody.data.auth.nonce).toBe(INITIAL_NONCE)

    const { response } = await createToken(authBody)
    expect(response.status).toBe(200)

    // nonce should be incremented
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 1)

    // should fail with invalid nonce
    const { response: invalidResponse, error } = await createToken(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe(`Invalid nonce. Expected: ${INITIAL_NONCE + 1}`)

    // successfully authenticate with new nonce
    const { response: successResponse } = await createToken(
      await user.signRequestBody({}, { nonce: INITIAL_NONCE + 1 })
    )
    expect(successResponse.status).toBe(200)

    // nonce should be incremented again
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 2)
  })
})
