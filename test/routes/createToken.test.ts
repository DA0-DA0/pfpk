import { describe, expect, it, vi } from 'vitest'

import { createToken, fetchAuthenticated, fetchTokens } from './routes'
import { INITIAL_NONCE } from '../../src/utils'
import { TestUser } from '../TestUser'

describe('POST /token', () => {
  it('returns 200 with a valid token', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body,
    } = await createToken(
      await user.signRequestBody({
        name: 'test token',
        audience: ['https://pfpk.org'],
      })
    )

    expect(status).toBe(200)
    expect(body.tokens.admin).toBeTruthy()
    expect(body.tokens.verify).toBeTruthy()

    // both tokens should be valid
    const { response } = await fetchAuthenticated(body.tokens.admin)
    expect(response.status).toBe(204)

    const { response: verifyResponse } = await fetchAuthenticated(
      body.tokens.verify
    )
    expect(verifyResponse.status).toBe(204)

    // check that token shows up in list with correct data
    const {
      body: { tokens },
    } = await fetchTokens(body.tokens.admin)
    expect(tokens.length).toBe(1)
    expect(tokens[0].id).toBe(body.id)
    expect(tokens[0].name).toBe('test token')
    expect(tokens[0].audience).toEqual(['https://pfpk.org'])
  })

  it('returns 400 when missing body', async () => {
    const { response, error } = await createToken()
    expect(response.status).toBe(400)
    expect(error).toBe('Invalid request body: Unexpected end of JSON input')
  })

  it('returns 401 with invalid auth data', async () => {
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
      expect(response.status).toBe(401)
      expect(error).toBe('Unauthorized: Invalid auth data.')
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

    authBody.data.auth.publicKey.type = 'unsupported'

    const { response, error } = await createToken(authBody)
    expect(response.status).toBe(400)
    expect(error).toBe('Unsupported public key type: unsupported')
  })

  it('returns 401 for invalid signatures', async () => {
    const user = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    const authBody = await user.signRequestBody({})
    const authBody2 = await user2.signRequestBody({})

    // set empty signature
    authBody.signature = ''

    // should fail with empty signature
    const { response: emptyResponse, error } = await createToken(authBody)
    expect(emptyResponse.status).toBe(401)
    expect(error).toBe('Unauthorized: No signature provided.')

    // replace signature with incorrect signature from another public key
    authBody.signature = authBody2.signature

    // should fail with invalid signature
    const { response: invalidResponse, error: invalidError } =
      await createToken(authBody)
    expect(invalidResponse.status).toBe(401)
    expect(invalidError).toBe('Unauthorized: Invalid signature.')
  })

  it('prevents replay attacks by verifying and auto-incrementing nonce', async () => {
    const user = await TestUser.create('neutron-1')
    const nonce = await user.fetchNonce()
    const authBody = await user.signRequestBody({}, { nonce })

    expect(nonce).toBe(INITIAL_NONCE)

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

  it('verifies nonce for first request (automatic profile DB row creation)', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await createToken(
      await user.signRequestBody({}, { nonce: INITIAL_NONCE + 1 })
    )
    expect(response.status).toBe(401)
    expect(error).toBe(`Invalid nonce. Expected: ${INITIAL_NONCE}`)
  })
})
