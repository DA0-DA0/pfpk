import { describe, expect, it } from 'vitest'

import { fetchMe } from './routes'
import { TestUser } from './TestUser'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { INITIAL_NONCE } from '../../src/utils'

describe('GET /me', () => {
  it('returns 200 for valid public key', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, body } = await fetchMe(user.token)
    expect(response.status).toBe(200)
    expect(body.uuid.length).toBeGreaterThan(0)
    expect(body.nonce).toBe(INITIAL_NONCE + 1)
    expect(body.name).toBeNull()
    expect(body.nft).toBeNull()
    expect(body.chains).toEqual({
      'neutron-1': {
        publicKey: {
          hex: user.getPublicKey('neutron-1'),
          type: CosmosSecp256k1PublicKey.type,
        },
        address: user.getAddress('neutron-1'),
      },
    })
  })

  it('returns 401 if no token', async () => {
    const { response, error } = await fetchMe('')
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: No token provided.')
  })
})
