import { describe, expect, it } from 'vitest'

import { resolveProfile } from './routes'
import { TestUser } from './TestUser'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('GET /resolve/:chainId/:name', () => {
  it('returns 200 with resolved profile for each chain', async () => {
    const user = await TestUser.create(...chainIds)
    await user.updateProfile({
      name: 'test',
    })
    await user.registerPublicKeys({
      chainIds,
    })
    const profile = await user.fetchProfile()

    for (const chainId of chainIds) {
      const { response, body } = await resolveProfile(chainId, 'test')
      expect(response.status).toBe(200)
      expect(body).toEqual({
        resolved: {
          uuid: profile.uuid,
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey(chainId),
          },
          address: user.getAddress(chainId),
          name: 'test',
          nft: null,
        },
      })
    }
  })

  it('returns 400 for unknown chainId', async () => {
    const { response, error } = await resolveProfile('unknown-chain', 'test')
    expect(response.status).toBe(400)
    expect(error).toBe('Unknown chainId.')
  })

  it('returns 404 for non-existent profile', async () => {
    const { response, error } = await resolveProfile(chainIds[0], 'nonexistent')
    expect(response.status).toBe(404)
    expect(error).toBe('Profile not found.')
  })
})
