import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  fetchProfileViaAddress,
  fetchProfileViaAddressHex,
  fetchProfileViaPublicKey,
  fetchProfileViaUuid,
} from './routes'
import * as chains from '../../src/chains'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { NotOwnerError } from '../../src/utils'
import * as chainUtils from '../../src/utils/chain'
import { TestUser } from '../TestUser'

const mockGetOwnedNftImageUrl = vi.fn()

const mockMustGetChain = vi.fn()
const originalMustGetChain = chainUtils.mustGetChain

beforeEach(() => {
  // Reset and set up default mock implementation
  vi.spyOn(chains, 'getOwnedNftImageUrl').mockImplementation(
    mockGetOwnedNftImageUrl
  )
  mockGetOwnedNftImageUrl.mockReset()
  mockGetOwnedNftImageUrl.mockResolvedValue('https://daodao.zone/daodao.png')

  vi.spyOn(chainUtils, 'mustGetChain').mockImplementation(mockMustGetChain)
  mockMustGetChain.mockReset()
  // Default to the original implementation.
  mockMustGetChain.mockImplementation(originalMustGetChain)
})

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('GET /:publicKey', () => {
  it('returns 200 with empty profile for non-existent public key', async () => {
    const user = await TestUser.create(...chainIds)
    const { response, body } = await fetchProfileViaPublicKey(
      user.getPublicKey(chainIds[0])
    )

    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid: '',
      name: null,
      nft: null,
      chains: {},
      createdAt: -1,
      updatedAt: -1,
    })
  })

  it('returns 200 with profile for existing public key', async () => {
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
    const { uuid } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaPublicKey(
        user.getPublicKey(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        name: 'test',
        nft: {
          chainId: 'neutron-1',
          collectionAddress: 'neutron123',
          tokenId: '123',
          imageUrl: 'https://daodao.zone/daodao.png',
        },
        chains: Object.fromEntries(
          chainIds.map((chainId) => [
            chainId,
            {
              publicKey: {
                hex: user.getPublicKey(chainId),
                type: CosmosSecp256k1PublicKey.type,
              },
              address: user.getAddress(chainId),
            },
          ])
        ),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
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
    const { uuid } = await user.fetchProfile()

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    const { response, body } = await fetchProfileViaPublicKey(
      user.getPublicKey('neutron-1')
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: 'test',
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

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response: response2, body: body2 } = await fetchProfileViaPublicKey(
      user.getPublicKey('neutron-1')
    )
    expect(response2.status).toBe(200)
    expect(body2).toEqual(body)
  })

  it('returns 200 with profile, ignoring chains that are unknown', async () => {
    const user = await TestUser.create(...chainIds)
    await user.registerPublicKeys({
      chainIds,
    })
    const { uuid } = await user.fetchProfile()

    // Pretend cosmoshub-4 is unknown after registration. It's needed during
    // test user creation to prepare the user public keys, but in practice,
    // someone can register any public key from any chain, but if we don't have
    // the chain's info, we can't generate their address when fetched.
    mockMustGetChain.mockImplementation((chainId: string) => {
      if (chainId === 'cosmoshub-4') {
        throw new Error(`Unknown chain: ${chainId}.`)
      }
      return originalMustGetChain(chainId)
    })

    const { response, body } = await fetchProfileViaPublicKey(
      user.getPublicKey('neutron-1')
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: null,
      nft: null,
      chains: Object.fromEntries(
        chainIds
          .filter((chainId) => chainId !== 'cosmoshub-4')
          .map((chainId) => [
            chainId,
            {
              publicKey: {
                hex: user.getPublicKey(chainId),
                type: CosmosSecp256k1PublicKey.type,
              },
              address: user.getAddress(chainId),
            },
          ])
      ),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
  })

  it('returns 200 with UUID only for existing public key', async () => {
    const user = await TestUser.create(...chainIds)
    const { uuid } = await user.fetchProfile()

    const { response, body } = await fetchProfileViaPublicKey(
      user.getPublicKey('neutron-1'),
      true
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
    })
  })
})

describe('GET /address/:bech32Address', () => {
  it('returns 200 with empty profile for non-existent address', async () => {
    const user = await TestUser.create(...chainIds)
    const { response, body } = await fetchProfileViaAddress(
      user.getAddress(chainIds[0])
    )

    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid: '',
      name: null,
      nft: null,
      chains: {},
      createdAt: -1,
      updatedAt: -1,
    })
  })

  it('returns 200 with profile for existing address', async () => {
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
    const { uuid } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaAddress(
        user.getAddress(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        name: 'test',
        nft: {
          chainId: 'neutron-1',
          collectionAddress: 'neutron123',
          tokenId: '123',
          imageUrl: 'https://daodao.zone/daodao.png',
        },
        chains: Object.fromEntries(
          chainIds.map((chainId) => [
            chainId,
            {
              publicKey: {
                hex: user.getPublicKey(chainId),
                type: CosmosSecp256k1PublicKey.type,
              },
              address: user.getAddress(chainId),
            },
          ])
        ),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
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
    const { uuid } = await user.fetchProfile()

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    const { response, body } = await fetchProfileViaAddress(
      user.getAddress('neutron-1')
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: 'test',
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

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response: response2, body: body2 } = await fetchProfileViaAddress(
      user.getAddress('neutron-1')
    )
    expect(response2.status).toBe(200)
    expect(body2).toEqual(body)
  })

  it('returns 200 with UUID only for existing address', async () => {
    const user = await TestUser.create(...chainIds)
    const { uuid } = await user.fetchProfile()

    const { response, body } = await fetchProfileViaAddress(
      user.getAddress('neutron-1'),
      true
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
    })
  })

  it('returns 400 for invalid bech32 address', async () => {
    const { response, error } = await fetchProfileViaAddress('neutron123')
    expect(response.status).toBe(400)
    expect(error).toBe('Invalid bech32 address: Data too short')
  })
})

describe('GET /hex/:addressHex', () => {
  it('returns 200 with empty profile for non-existent address hex', async () => {
    const user = await TestUser.create(...chainIds)
    const { response, body } = await fetchProfileViaAddressHex(
      user.getAddressHex(chainIds[0])
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid: '',
      name: null,
      nft: null,
      chains: {},
      createdAt: -1,
      updatedAt: -1,
    })
  })

  it('returns 200 with profile for existing address hex', async () => {
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
    const { uuid } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaAddressHex(
        user.getAddressHex(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        name: 'test',
        nft: {
          chainId: 'neutron-1',
          collectionAddress: 'neutron123',
          tokenId: '123',
          imageUrl: 'https://daodao.zone/daodao.png',
        },
        chains: Object.fromEntries(
          chainIds.map((chainId) => [
            chainId,
            {
              publicKey: {
                hex: user.getPublicKey(chainId),
                type: CosmosSecp256k1PublicKey.type,
              },
              address: user.getAddress(chainId),
            },
          ])
        ),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
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
    const { uuid } = await user.fetchProfile()

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    const { response, body } = await fetchProfileViaAddressHex(
      user.getAddressHex('neutron-1')
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: 'test',
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

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response: response2, body: body2 } =
      await fetchProfileViaAddressHex(user.getAddressHex('neutron-1'))
    expect(response2.status).toBe(200)
    expect(body2).toEqual(body)
  })

  it('returns 200 with UUID only for existing address hex', async () => {
    const user = await TestUser.create(...chainIds)
    const { uuid } = await user.fetchProfile()

    const { response, body } = await fetchProfileViaAddressHex(
      user.getAddressHex('neutron-1'),
      true
    )
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
    })
  })
})

describe('GET /uuid/:uuid', () => {
  it('returns 200 with profile for existing UUID', async () => {
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
    const { uuid } = await user.fetchProfile(chainIds[0])

    const { response, body } = await fetchProfileViaUuid(uuid)
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: 'test',
      nft: {
        chainId: 'neutron-1',
        collectionAddress: 'neutron123',
        tokenId: '123',
        imageUrl: 'https://daodao.zone/daodao.png',
      },
      chains: Object.fromEntries(
        chainIds.map((chainId) => [
          chainId,
          {
            publicKey: {
              hex: user.getPublicKey(chainId),
              type: CosmosSecp256k1PublicKey.type,
            },
            address: user.getAddress(chainId),
          },
        ])
      ),
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
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
    const { uuid } = await user.fetchProfile()

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(null)

    const { response, body } = await fetchProfileViaUuid(uuid)
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
      name: 'test',
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

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response: response2, body: body2 } = await fetchProfileViaUuid(uuid)
    expect(response2.status).toBe(200)
    expect(body2).toEqual(body)
  })

  it('returns 404 with empty profile for non-existent uuid', async () => {
    const { response, body } = await fetchProfileViaUuid('non_existent_uuid')
    expect(response.status).toBe(404)
    expect(body).toEqual({
      error: 'Profile not found for UUID: non_existent_uuid',
    })
  })

  it('returns 200 with UUID only for existing UUID', async () => {
    const user = await TestUser.create(...chainIds)
    const { uuid } = await user.fetchProfile()

    const { response, body } = await fetchProfileViaUuid(uuid, true)
    expect(response.status).toBe(200)
    expect(body).toEqual({
      uuid,
    })
  })
})
