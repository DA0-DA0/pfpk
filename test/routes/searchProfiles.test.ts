import { describe, expect, it } from 'vitest'

import { searchProfiles } from './routes'
import { TestUser } from './TestUser'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('GET /search/:chainId/:namePrefix', () => {
  it('returns 200 with profiles for each chain (case insensitive)', async () => {
    const makeUser = async (name: string) => {
      const user = await TestUser.create(...chainIds)
      await user.updateProfile({
        name,
      })
      await user.registerPublicKeys({
        chainIds,
      })
      return {
        name,
        user,
      }
    }

    const users = await Promise.all([
      makeUser('test1'),
      makeUser('test2'),
      makeUser('test3'),
      // Case insensitive.
      makeUser('TEst4'),
      // Case insensitive.
      makeUser('teST5'),
      makeUser('test6'),
      makeUser('test7'),
    ])

    for (const chainId of chainIds) {
      const { response, body } = await searchProfiles(chainId, 'test')
      expect(response.status).toBe(200)
      expect(body).toEqual({
        // Only 5 profiles are returned.
        profiles: users.slice(0, 5).map(({ name, user }) => ({
          uuid: expect.any(String),
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey(chainId),
          },
          address: user.getAddress(chainId),
          name,
          nft: null,
        })),
      })

      const { response: response2, body: body2 } = await searchProfiles(
        chainId,
        // Case insensitive.
        users[1].name.toUpperCase()
      )
      expect(response2.status).toBe(200)
      expect(body2).toEqual({
        profiles: [
          {
            uuid: expect.any(String),
            publicKey: {
              type: CosmosSecp256k1PublicKey.type,
              hex: users[1].user.getPublicKey(chainId),
            },
            address: users[1].user.getAddress(chainId),
            name: users[1].name,
            nft: null,
          },
        ],
      })
    }
  })

  it('returns 400 for name prefix too short', async () => {
    const { response, error } = await searchProfiles(chainIds[0], 'te')
    expect(response.status).toBe(400)
    expect(error).toBe('Name prefix must be at least 3 characters.')
  })

  it('returns 400 for unknown chainId', async () => {
    const { response, error } = await searchProfiles('unknown-chain', 'test')
    expect(response.status).toBe(400)
    expect(error).toBe('Unknown chainId.')
  })
})
