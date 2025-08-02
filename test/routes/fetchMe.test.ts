import { describe, expect, it } from 'vitest'

import { fetchMe } from './routes'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { TestUser } from '../TestUser'

describe('GET /me', () => {
  it('returns 200 for valid public key', async () => {
    const user = await TestUser.create('neutron-1')
    await user.createTokens()

    // admin token should work
    const { response, body } = await fetchMe(user.tokens.admin)
    expect(response.status).toBe(200)
    expect(body.uuid.length).toBeGreaterThan(0)
    expect(body).toEqual({
      uuid: expect.any(String),
      name: null,
      nft: null,
      chains: {
        'neutron-1': {
          publicKey: {
            hex: user.getPublicKey('neutron-1'),
            type: CosmosSecp256k1PublicKey.type,
          },
          address: user.getAddress('neutron-1'),
        },
      },
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })

    // not admin token should work too
    const { response: response2, body: body2 } = await fetchMe(
      user.tokens.notAdmin
    )
    expect(response2.status).toBe(200)
    expect(body2).toEqual(body)
  })

  it('returns 401 if no token', async () => {
    const { response, error } = await fetchMe('')
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No token provided.')
  })
})
