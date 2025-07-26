import { describe, expect, it } from 'vitest'

import {
  fetchProfileViaAddress,
  fetchProfileViaAddressHex,
  fetchProfileViaPublicKey,
} from './routes'
import { TestUser } from './TestUser'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { INITIAL_NONCE } from '../../src/utils'

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
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
  })

  it('returns 200 with profile for existing public key', async () => {
    const user = await TestUser.create(...chainIds)
    await user.updateProfile({
      name: 'test',
    })
    await user.registerPublicKeys({
      chainIds,
    })
    const { uuid, nonce } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaPublicKey(
        user.getPublicKey(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        nonce: nonce,
        name: 'test',
        nft: null,
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
      })
    }
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
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
  })

  it('returns 200 with profile for existing address', async () => {
    const user = await TestUser.create(...chainIds)
    await user.updateProfile({
      name: 'test',
    })
    await user.registerPublicKeys({
      chainIds,
    })
    const { uuid, nonce } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaAddress(
        user.getAddress(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        nonce: nonce,
        name: 'test',
        nft: null,
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
      })
    }
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
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
  })

  it('returns 200 with profile for existing address hex', async () => {
    const user = await TestUser.create(...chainIds)
    await user.updateProfile({
      name: 'test',
    })
    await user.registerPublicKeys({
      chainIds,
    })
    const { uuid, nonce } = await user.fetchProfile(chainIds[0])

    for (const chainId of chainIds) {
      const { response, body } = await fetchProfileViaAddressHex(
        user.getAddressHex(chainId)
      )
      expect(response.status).toBe(200)
      expect(body).toEqual({
        uuid,
        nonce: nonce,
        name: 'test',
        nft: null,
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
      })
    }
  })
})
