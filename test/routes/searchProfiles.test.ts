import { beforeEach, describe, expect, it, vi } from 'vitest'

import { searchProfiles } from './routes'
import * as chains from '../../src/chains'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { NotOwnerError } from '../../src/utils'
import { TestUser } from '../TestUser'

const mockGetOwnedNftImageUrl = vi.fn()

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('GET /search/:chainId/:namePrefix', () => {
  beforeEach(() => {
    // Reset and set up default mock implementation
    vi.spyOn(chains, 'getOwnedNftImageUrl').mockImplementation(
      mockGetOwnedNftImageUrl
    )
    mockGetOwnedNftImageUrl.mockReset()
    mockGetOwnedNftImageUrl.mockResolvedValue('ipfs://b1234567890')
  })

  it('returns 200 with profiles for each chain (case insensitive)', async () => {
    const makeUser = async (name: string) => {
      const user = await TestUser.create(...chainIds)
      await user.updateProfile({
        name,
        nft: {
          chainId: 'neutron-1',
          collectionAddress: 'neutron123',
          tokenId: '123',
        },
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
      makeUser('test8'),
      makeUser('test9'),
      makeUser('testA'),
      makeUser('testB'),
      makeUser('testC'),
      makeUser('testD'),
    ])

    for (const chainId of chainIds) {
      const { response, body } = await searchProfiles(chainId, 'test')
      expect(response.status).toBe(200)
      expect(body).toEqual({
        // Only 10 profiles are returned.
        profiles: users.slice(0, 10).map(({ name, user }) => ({
          uuid: expect.any(String),
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey(chainId),
          },
          address: user.getAddress(chainId),
          name,
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'neutron123',
            tokenId: '123',
            imageUrl: 'ipfs://b1234567890',
          },
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
            nft: {
              chainId: 'neutron-1',
              collectionAddress: 'neutron123',
              tokenId: '123',
              imageUrl: 'ipfs://b1234567890',
            },
          },
        ],
      })
    }
  })

  it("returns 200 with profile, ignoring NFT if image doesn't load", async () => {
    const user = await TestUser.create('neutron-1')
    await user.updateProfile({
      name: 'test',
      nft: {
        chainId: 'neutron-1',
        collectionAddress: 'neutron123',
        tokenId: '123',
      },
    })

    const { response, body } = await searchProfiles('neutron-1', 'test')
    expect(response.status).toBe(200)
    expect(body).toEqual({
      profiles: [
        {
          uuid: expect.any(String),
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          address: user.getAddress('neutron-1'),
          name: 'test',
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'neutron123',
            tokenId: '123',
            imageUrl: 'ipfs://b1234567890',
          },
        },
      ],
    })

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    // NFT should be null since the image wasn't found.
    const { response: response2, body: body2 } = await searchProfiles(
      'neutron-1',
      'test'
    )
    expect(response2.status).toBe(200)
    expect(body2).toEqual({
      profiles: [
        {
          uuid: body.profiles[0].uuid,
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          address: user.getAddress('neutron-1'),
          name: 'test',
          nft: null,
        },
      ],
    })

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    // NFT should be null since the image is no longer owned.
    const { response: response3, body: body3 } = await searchProfiles(
      'neutron-1',
      'test'
    )
    expect(response3.status).toBe(200)
    expect(body3).toEqual({
      profiles: [
        {
          uuid: body.profiles[0].uuid,
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          address: user.getAddress('neutron-1'),
          name: 'test',
          nft: null,
        },
      ],
    })
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
