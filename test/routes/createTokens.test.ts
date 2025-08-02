import { describe, expect, it, vi } from 'vitest'

import {
  TEST_HOSTNAME,
  createTokens,
  fetchAuthenticated,
  fetchTokens,
} from './routes'
import { CreateTokensRequest } from '../../src/types'
import { INITIAL_NONCE } from '../../src/utils'
import { TestUser } from '../TestUser'

describe('POST /tokens', () => {
  it('returns 200 with created tokens via wallet signature auth', async () => {
    const user = await TestUser.create('neutron-1')
    const {
      response: { status },
      body: { tokens },
    } = await createTokens(
      await user.signRequestBody({
        tokens: [
          {
            name: 'test token',
            audience: [TEST_HOSTNAME],
            role: 'admin',
          },
          {
            name: 'test token 2',
            scopes: ['scope1', 'scope2'],
          },
        ],
      })
    )

    expect(status).toBe(200)
    expect(tokens).toEqual([
      {
        id: tokens[0].id,
        name: 'test token',
        audience: [TEST_HOSTNAME],
        scopes: null,
        role: 'admin',
        token: expect.any(String),
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: tokens[1].id,
        name: 'test token 2',
        audience: null,
        scopes: ['scope1', 'scope2'],
        role: null,
        token: expect.any(String),
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])

    // admin token should be valid
    expect((await fetchAuthenticated(tokens[0].token)).response.status).toBe(
      200
    )
    expect(
      (
        await fetchAuthenticated(tokens[0].token, {
          audience: [TEST_HOSTNAME],
          role: ['admin'],
        })
      ).response.status
    ).toBe(200)

    // second token should be valid
    expect((await fetchAuthenticated(tokens[1].token)).response.status).toBe(
      200
    )
    // but not if an audience, scope, or role is provided
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          audience: [TEST_HOSTNAME],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          scope: ['scope3'],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          role: ['admin'],
        })
      ).response.status
    ).toBe(401)

    // check that tokens show up in list with correct data
    const {
      body: { tokens: fetchedTokens },
    } = await fetchTokens(tokens[0].token)
    expect(fetchedTokens).toEqual([
      {
        id: tokens[0].id,
        name: 'test token',
        audience: [TEST_HOSTNAME],
        scopes: null,
        role: 'admin',
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: tokens[1].id,
        name: 'test token 2',
        audience: null,
        scopes: ['scope1', 'scope2'],
        role: null,
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])
  })

  it('returns 200 with created tokens via JWT auth', async () => {
    const user = await TestUser.create('neutron-1')
    // create admin token for creating other tokens
    await user.createTokens({
      tokens: [{ audience: [TEST_HOSTNAME], role: 'admin' }],
    })

    const {
      response: { status },
      body: { tokens },
    } = await createTokens(
      {
        data: {
          tokens: [
            {
              name: 'test token',
            },
            {
              name: 'test token 2',
            },
          ],
        },
      },
      user.tokens.admin
    )

    expect(status).toBe(200)
    expect(tokens).toEqual([
      {
        id: tokens[0].id,
        name: 'test token',
        audience: null,
        scopes: null,
        role: null,
        token: expect.any(String),
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: tokens[1].id,
        name: 'test token 2',
        audience: null,
        scopes: null,
        role: null,
        token: expect.any(String),
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])

    // both tokens should be valid
    expect((await fetchAuthenticated(tokens[0].token)).response.status).toBe(
      200
    )
    expect((await fetchAuthenticated(tokens[1].token)).response.status).toBe(
      200
    )

    // but not if an audience, scope, or role is provided
    expect(
      (
        await fetchAuthenticated(tokens[0].token, {
          audience: [TEST_HOSTNAME],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[0].token, {
          scope: ['scope1'],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[0].token, {
          role: ['admin'],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          audience: [TEST_HOSTNAME],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          scope: ['scope1'],
        })
      ).response.status
    ).toBe(401)
    expect(
      (
        await fetchAuthenticated(tokens[1].token, {
          role: ['admin'],
        })
      ).response.status
    ).toBe(401)

    // check that tokens show up in list with correct data
    const {
      body: { tokens: fetchedTokens },
    } = await fetchTokens(user.tokens.admin)
    expect(fetchedTokens).toEqual([
      {
        id: expect.any(String),
        name: null,
        audience: [TEST_HOSTNAME],
        scopes: null,
        role: 'admin',
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: tokens[0].id,
        name: 'test token',
        audience: null,
        scopes: null,
        role: null,
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
      {
        id: tokens[1].id,
        name: 'test token 2',
        audience: null,
        scopes: null,
        role: null,
        issuedAt: expect.any(Number),
        expiresAt: expect.any(Number),
      },
    ])
  })

  it('returns 401 if creating token for auth service with JWT auth', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    const { response, error } = await createTokens(
      {
        data: { tokens: [{ name: 'test token', audience: [TEST_HOSTNAME] }] },
      },
      user.tokens.admin
    )
    expect(response.status).toBe(401)
    expect(error).toBe(
      `Unauthorized: Tokens for ${TEST_HOSTNAME} must be created via signature auth.`
    )

    const { response: response2, error: error2 } = await createTokens(
      {
        data: {
          tokens: [
            {
              name: 'test token',
              audience: [TEST_HOSTNAME, 'another.domain'],
              role: 'admin',
            },
          ],
        },
      },
      user.tokens.admin
    )
    expect(response2.status).toBe(401)
    expect(error2).toBe(
      `Unauthorized: Tokens for ${TEST_HOSTNAME} must be created via signature auth.`
    )
  })

  it('returns 400 when missing body', async () => {
    const { response, error } = await createTokens()
    expect(response.status).toBe(400)
    expect(error).toBe('Invalid request body: Unexpected end of JSON input')
  })

  it('returns 401 for non-admin tokens', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    const { response, error } = await createTokens(
      {
        data: {
          tokens: [{ name: 'test token' }],
        },
      },
      user.tokens.notAdmin
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid auth data.')

    const [{ token: wrongAudienceToken }] = await user.createTokens({
      tokens: [{ name: 'test token', role: 'admin' }],
    })

    // errors if audience is not correct
    const { response: audienceResponse, error: audienceError } =
      await createTokens(
        {
          data: {
            tokens: [{ name: 'test token', audience: [TEST_HOSTNAME] }],
          },
        },
        wrongAudienceToken
      )
    expect(audienceResponse.status).toBe(401)
    expect(audienceError).toBe('Unauthorized: Invalid auth data.')
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
    expect(error).toBe(
      `Unauthorized: Invalid nonce. Expected: ${INITIAL_NONCE + 1}`
    )

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
    expect(error).toBe(
      `Unauthorized: Invalid nonce. Expected: ${INITIAL_NONCE}`
    )
  })
})
