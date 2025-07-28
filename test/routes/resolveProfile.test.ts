import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveProfile } from './routes'
import * as chains from '../../src/chains'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { NotOwnerError } from '../../src/utils'
import { TestUser } from '../TestUser'

const mockGetOwnedNftImageUrl = vi.fn()

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('GET /resolve/:chainId/:name', () => {
  beforeEach(() => {
    // Reset and set up default mock implementation
    vi.spyOn(chains, 'getOwnedNftImageUrl').mockImplementation(
      mockGetOwnedNftImageUrl
    )
    mockGetOwnedNftImageUrl.mockReset()
    mockGetOwnedNftImageUrl.mockResolvedValue('https://daodao.zone/daodao.png')
  })

  it('returns 200 with resolved profile for each chain (case insensitive)', async () => {
    const user = await TestUser.create(...chainIds)
    await user.updateProfile({
      name: 'test',
      nft: {
        chainId: 'neutron-1',
        collectionAddress: 'neutron123',
        tokenId: '123',
      },
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
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'neutron123',
            tokenId: '123',
            imageUrl: 'https://daodao.zone/daodao.png',
          },
        },
      })

      // Case insensitive.
      const { response: response2, body: body2 } = await resolveProfile(
        chainId,
        'TeSt'
      )
      expect(response2.status).toBe(200)
      expect(body2).toEqual(body)
    }
  })

  it("returns 200 with resolved profile, ignoring NFT if image doesn't load", async () => {
    const user = await TestUser.create('neutron-1')
    await user.updateProfile({
      name: 'test',
      nft: {
        chainId: 'neutron-1',
        collectionAddress: 'neutron123',
        tokenId: '123',
      },
    })
    const profile = await user.fetchProfile()

    const { response, body } = await resolveProfile('neutron-1', 'test')
    expect(response.status).toBe(200)
    expect(body).toEqual({
      resolved: {
        uuid: profile.uuid,
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
          imageUrl: 'https://daodao.zone/daodao.png',
        },
      },
    })

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    const { response: response2, body: body2 } = await resolveProfile(
      'neutron-1',
      'test'
    )
    expect(response2.status).toBe(200)
    expect(body2).toEqual({
      resolved: {
        uuid: profile.uuid,
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
        name: 'test',
        nft: null,
      },
    })

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response: response3, body: body3 } = await resolveProfile(
      'neutron-1',
      'test'
    )
    expect(response3.status).toBe(200)
    expect(body3).toEqual({
      resolved: {
        uuid: profile.uuid,
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
        name: 'test',
        nft: null,
      },
    })
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
