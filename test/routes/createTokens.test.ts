import { describe, expect, it, vi } from 'vitest'

import { createTokens, fetchAuthenticated, fetchTokens } from './routes'
import { CreateTokensRequest } from '../../src/types'
import { INITIAL_NONCE } from '../../src/utils'
import { TestUser } from '../TestUser'

describe('POST /tokens', () => {
  it('returns 200 with a valid token set', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body,
    } = await createTokens(
      await user.signRequestBody({
        tokens: [
          {
            name: 'test token',
            audience: ['pfpk.test'],
          },
        ],
      })
    )

    expect(status).toBe(200)
    expect(body.tokens.length).toBe(1)
    expect(body.tokens[0].tokens.admin).toBeTruthy()
    expect(body.tokens[0].tokens.verify).toBeTruthy()

    // both tokens should be valid
    const { response } = await fetchAuthenticated(body.tokens[0].tokens.admin)
    expect(response.status).toBe(204)

    const { response: verifyResponse } = await fetchAuthenticated(
      body.tokens[0].tokens.verify
    )
    expect(verifyResponse.status).toBe(204)

    // check that token shows up in list with correct data
    const {
      body: { tokens },
    } = await fetchTokens(body.tokens[0].tokens.admin)
    expect(tokens.length).toBe(1)
    expect(tokens[0].id).toBe(body.tokens[0].id)
    expect(tokens[0].name).toBe('test token')
    expect(tokens[0].audience).toEqual(['pfpk.test'])
  })

  it('returns 200 with multiple tokens', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body,
    } = await createTokens(
      await user.signRequestBody({
        tokens: [
          {
            name: 'first',
          },
          {},
          {
            audience: ['some.domain'],
          },
        ],
      })
    )

    expect(status).toBe(200)
    expect(body.tokens.length).toBe(3)
    // Different IDs
    expect(body.tokens[0].id).not.toBe(body.tokens[1].id)
    expect(body.tokens[0].id).not.toBe(body.tokens[2].id)
    expect(body.tokens[1].id).not.toBe(body.tokens[2].id)
    // Same expiresAt
    expect(body.tokens[0].expiresAt).toBe(body.tokens[1].expiresAt)
    expect(body.tokens[0].expiresAt).toBe(body.tokens[2].expiresAt)
    // Different tokens
    expect(body.tokens[0].tokens.admin).not.toBe(body.tokens[1].tokens.admin)
    expect(body.tokens[0].tokens.verify).not.toBe(body.tokens[1].tokens.verify)
    expect(body.tokens[0].tokens.verify).not.toBe(body.tokens[2].tokens.verify)
    expect(body.tokens[1].tokens.admin).not.toBe(body.tokens[2].tokens.admin)
    expect(body.tokens[1].tokens.verify).not.toBe(body.tokens[2].tokens.verify)

    // List tokens
    const {
      body: { tokens },
    } = await fetchTokens(body.tokens[0].tokens.admin)
    expect(tokens.length).toBe(3)
    expect(tokens[0].id).toBe(body.tokens[0].id)
    expect(tokens[1].id).toBe(body.tokens[1].id)
    expect(tokens[2].id).toBe(body.tokens[2].id)
    expect(tokens[0].name).toBe('first')
    expect(tokens[1].name).toBeNull()
    expect(tokens[2].name).toBeNull()
    expect(tokens[0].audience).toBeNull()
    expect(tokens[1].audience).toBeNull()
    expect(tokens[2].audience).toEqual(['some.domain'])
  })

  it('returns 400 when missing body', async () => {
    const { response, error } = await createTokens()
    expect(response.status).toBe(400)
    expect(error).toBe('Invalid request body: Unexpected end of JSON input')
  })

  it('returns 401 with invalid auth data', async () => {
    const user = await TestUser.create('neutron-1')
    const body = await user.signRequestBody<CreateTokensRequest>({})

    for (const key of Object.keys(body.data.auth)) {
      const auth: any = { ...body.data.auth }
      delete auth[key]

      const { response, error } = await createTokens({
        ...body,
        data: {
          ...body.data,
          auth,
        },
      })
      expect(response.status).toBe(401)
      expect(error).toBe('Unauthorized: Invalid auth data.')
    }
  })

  it('returns 401 for timestamps older than 5 minutes', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody<CreateTokensRequest>({})

    // advance time by 5 minutes and 1 second
    vi.useFakeTimers()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

    // should fail with timestamp too old
    const { response: expiredResponse, error } = await createTokens(authBody)
    expect(expiredResponse.status).toBe(401)
    expect(error).toBe(
      'Unauthorized: Timestamp must be within the past 5 minutes.'
    )
  })

  it('returns 400 for unsupported public key types', async () => {
    const user = await TestUser.create('neutron-1')
    const authBody = await user.signRequestBody<CreateTokensRequest>({})

    authBody.data.auth.publicKey.type = 'unsupported'

    const { response, error } = await createTokens(authBody)
    expect(response.status).toBe(400)
    expect(error).toBe('Unsupported public key type: unsupported')
  })

  it('returns 401 for invalid signatures', async () => {
    const user = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    const authBody = await user.signRequestBody<CreateTokensRequest>({})
    const authBody2 = await user2.signRequestBody<CreateTokensRequest>({})

    // set empty signature
    authBody.signature = ''

    // should fail with empty signature
    const { response: emptyResponse, error } = await createTokens(authBody)
    expect(emptyResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: No signature provided.')

    // replace signature with incorrect signature from another public key
    authBody.signature = authBody2.signature

    // should fail with invalid signature
    const { response: invalidResponse, error: invalidError } =
      await createTokens(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(invalidError).toBe('Unauthorized: Invalid signature.')
  })

  it('prevents replay attacks by verifying and auto-incrementing nonce', async () => {
    const user = await TestUser.create('neutron-1')
    const nonce = await user.fetchNonce()
    const authBody = await user.signRequestBody<CreateTokensRequest>(
      {},
      { nonce }
    )

    expect(nonce).toBe(INITIAL_NONCE)

    const { response } = await createTokens(authBody)
    expect(response.status).toBe(200)

    // nonce should be incremented
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 1)

    // should fail with invalid nonce
    const { response: invalidResponse, error } = await createTokens(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(error).toBe(`Invalid nonce. Expected: ${INITIAL_NONCE + 1}`)

    // successfully authenticate with new nonce
    const { response: successResponse } = await createTokens(
      await user.signRequestBody({}, { nonce: INITIAL_NONCE + 1 })
    )
    expect(successResponse.status).toBe(200)

    // nonce should be incremented again
    expect(await user.fetchNonce()).toBe(INITIAL_NONCE + 2)
  })

  it('verifies nonce for first request (automatic profile DB row creation)', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await createTokens(
      await user.signRequestBody({}, { nonce: INITIAL_NONCE + 1 })
    )
    expect(response.status).toBe(401)
    expect(error).toBe(`Invalid nonce. Expected: ${INITIAL_NONCE}`)
  })
})
