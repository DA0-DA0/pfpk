import { beforeEach, describe, expect, it, vi } from 'vitest'

import { updateProfile } from './routes'
import { TestUser } from './TestUser'
import * as chains from '../../src/chains'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { INITIAL_NONCE, NotOwnerError } from '../../src/utils'

const mockGetOwnedNftImageUrl = vi.fn()

describe('POST /me', () => {
  beforeEach(() => {
    // Reset and set up default mock implementation
    vi.spyOn(chains, 'getOwnedNftImageUrl').mockImplementation(
      mockGetOwnedNftImageUrl
    )
    mockGetOwnedNftImageUrl.mockReset()
    mockGetOwnedNftImageUrl.mockResolvedValue('https://daodao.zone/daodao.png')
  })

  it('returns 204 and updates profile', async () => {
    const user = await TestUser.create('neutron-1')

    // starts with empty profile
    const defaultProfile = await user.fetchProfile()
    expect(defaultProfile).toEqual({
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })

    const { response } = await updateProfile(
      await user.signRequestBody({
        profile: {
          name: 'test',
        },
      })
    )
    expect(response.status).toBe(204)

    // profile should be updated with name and chain (automatically attached)
    const profile2 = await user.fetchProfile()
    expect(profile2.uuid.length).toBeGreaterThan(0)
    expect(profile2).toEqual({
      uuid: expect.any(String),
      nonce: defaultProfile.nonce + 1,
      name: 'test',
      nft: null,
      chains: {
        'neutron-1': {
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          address: user.getAddress('neutron-1'),
        },
      },
    })
  })

  it('returns 204 and sets chain preferences for new profile', async () => {
    const user = await TestUser.create('neutron-1', 'cosmoshub-4')

    const { response } = await updateProfile(
      await user.signRequestBody(
        {
          profile: { name: 'test' },
          chainIds: ['neutron-1', 'cosmoshub-4'],
        },
        {
          // Use neutron-1 chain for signing.
          chainId: 'neutron-1',
        }
      )
    )
    expect(response.status).toBe(204)

    const profile = await user.fetchProfile()
    expect(profile.chains).toEqual({
      'neutron-1': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
      },
      'cosmoshub-4': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('cosmoshub-4'),
        },
        address: user.getAddress('cosmoshub-4'),
      },
    })
  })

  it('returns 204 and sets chain preferences for existing profile', async () => {
    const user = await TestUser.create('neutron-1', 'cosmoshub-4')
    await user.authenticate()

    const { response } = await updateProfile(
      await user.signRequestBody(
        {
          profile: { name: 'test' },
          chainIds: ['neutron-1', 'cosmoshub-4'],
        },
        {
          // Use neutron-1 chain for signing.
          chainId: 'neutron-1',
        }
      )
    )
    expect(response.status).toBe(204)

    const profile = await user.fetchProfile()
    expect(profile.chains).toEqual({
      'neutron-1': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
      },
      'cosmoshub-4': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('cosmoshub-4'),
        },
        address: user.getAddress('cosmoshub-4'),
      },
    })
  })

  it('returns 400 if chains are provided but no public key auth is provided', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    const { response, error } = await updateProfile(
      {
        data: {
          profile: { name: 'test' },
          chainIds: ['neutron-1'],
        },
      },
      user.tokens.admin
    )
    expect(response.status).toBe(400)
    expect(error).toBe(
      'Public key authorization required when setting chain preferences.'
    )
  })

  it('returns 400 if missing profile object', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await updateProfile(
      await user.signRequestBody({} as any)
    )
    expect(response.status).toBe(400)
    expect(error).toBe('Missing profile update object.')
  })

  it('returns 400 if name is empty', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await updateProfile(
      await user.signRequestBody({ profile: { name: '' } })
    )
    expect(response.status).toBe(400)
    expect(error).toBe('Name cannot be empty.')
  })

  it('returns 400 if name is longer than 32 characters', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await updateProfile(
      await user.signRequestBody({ profile: { name: 'a'.repeat(33) } })
    )
    expect(response.status).toBe(400)
    expect(error).toBe('Name cannot be longer than 32 characters.')
  })

  it('returns 400 if name contains invalid characters', async () => {
    const user = await TestUser.create('neutron-1')

    const invalidCharacters = [
      '@',
      '!',
      '?',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '`',
      '~',
      '|',
      '\\',
      '/',
      ':',
      ';',
      '"',
      "'",
      '<',
      '>',
      '=',
      '+',
      '-',
      // hair space
      '\u200a',
      // zero-width space
      '\u200b',
      // zero-width non-joiner
      '\u200c',
      // zero-width joiner
      '\u200d',
    ]

    for (const invalidCharacter of invalidCharacters) {
      const { response, error } = await updateProfile(
        await user.signRequestBody({
          profile: { name: 'test' + invalidCharacter + 'test' },
        })
      )
      expect(response.status).toBe(400)
      expect(error).toBe(
        'Name can only contain alphanumeric characters, periods, and underscores.'
      )
    }
  })

  it('returns 400 if NFT object is invalid', async () => {
    const user = await TestUser.create('neutron-1')

    const { response, error } = await updateProfile(
      await user.signRequestBody({
        profile: { nft: { chainId: 'test' } },
      } as any)
    )
    expect(response.status).toBe(400)
    expect(error).toBe(
      'Invalid NFT update object. Must have `chainId`, `collectionAddress`, and `tokenId`.'
    )
  })

  it('returns 400 if name is already taken', async () => {
    const user1 = await TestUser.create('neutron-1')
    const user2 = await TestUser.create('neutron-1')

    await user1.updateProfile({ name: 'test' })

    const { response, error } = await updateProfile(
      await user2.signRequestBody({ profile: { name: 'test' } })
    )
    expect(response.status).toBe(400)
    expect(error).toBe('Name already taken.')
  })

  it('returns 405 if no public key for the NFT chain is provided', async () => {
    const user = await TestUser.create('neutron-1')
    await user.authenticate()

    // use auth token, providing no public key in auth data
    const { response, error } = await updateProfile(
      {
        data: {
          profile: {
            nft: {
              chainId: 'cosmoshub-4',
              collectionAddress: 'test',
              tokenId: 'test',
            },
          },
        },
      },
      user.tokens.admin
    )
    expect(response.status).toBe(405)
    expect(error).toBe(
      "No public key is associated with the NFT's chain or provided in the request."
    )
  })

  it('returns 415 if NFT image is not found', async () => {
    const user = await TestUser.create('neutron-1')

    mockGetOwnedNftImageUrl.mockResolvedValueOnce(undefined)

    const { response, error } = await updateProfile(
      await user.signRequestBody({
        profile: {
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'test',
            tokenId: 'test',
          },
        },
      })
    )
    expect(response.status).toBe(415)
    expect(error).toBe('Failed to retrieve image from NFT.')
  })

  it('returns 401 if user does not own the NFT', async () => {
    const user = await TestUser.create('neutron-1')

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new NotOwnerError())

    const { response, error } = await updateProfile(
      await user.signRequestBody({
        profile: {
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'test',
            tokenId: 'test',
          },
        },
      })
    )
    expect(response.status).toBe(401)
    expect(error).toBe('You do not own this NFT.')
  })

  it('returns 500 if NFT image access fails', async () => {
    const user = await TestUser.create('neutron-1')

    mockGetOwnedNftImageUrl.mockRejectedValueOnce(new Error('test'))

    const { response, error } = await updateProfile(
      await user.signRequestBody({
        profile: {
          nft: {
            chainId: 'neutron-1',
            collectionAddress: 'test',
            tokenId: 'test',
          },
        },
      })
    )
    expect(response.status).toBe(500)
    expect(error).toBe('Unexpected ownership verification error: test')
  })
})
