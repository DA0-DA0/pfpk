import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { fetchProfileViaPublicKey, unregisterPublicKeys } from './routes'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { INITIAL_NONCE } from '../../src/utils'
import { TestUser } from '../TestUser'

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('POST /unregister', () => {
  it('returns 204 and unregisters public keys', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({ chainId: 'neutron-1' })
    await user.registerPublicKeys({ chainIds })
    const { uuid } = await user.fetchProfile()

    // Unregister public key for cosmoshub-4, which is the same as neutron-1.
    // Only phoenix-1 should remain.
    const { response } = await unregisterPublicKeys(
      await user.signRequestBody({
        publicKeys: [
          {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('cosmoshub-4'),
          },
        ],
      })
    )
    expect(response.status).toBe(204)

    // phoenix-1 public key should still resolve.
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('phoenix-1'))).body
    ).toEqual({
      uuid,
      nonce: INITIAL_NONCE + 2,
      name: null,
      nft: null,
      chains: {
        'phoenix-1': {
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('phoenix-1'),
          },
          address: user.getAddress('phoenix-1'),
        },
      },
    })

    // neutron-1 and cosmoshub-4 should be an empty profile.
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('neutron-1'))).body
    ).toEqual({
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('cosmoshub-4'))).body
    ).toEqual({
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
  })

  it('returns 204 and unregisters public keys with JWT auth admin token', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({ chainId: 'neutron-1' })
    await user.registerPublicKeys({ chainIds })
    const { uuid } = await user.fetchProfile()

    // Unregister public key for cosmoshub-4, which is the same as neutron-1.
    // Only phoenix-1 should remain.
    const { response } = await unregisterPublicKeys(
      {
        data: {
          publicKeys: [
            {
              type: CosmosSecp256k1PublicKey.type,
              hex: user.getPublicKey('cosmoshub-4'),
            },
          ],
        },
      },
      user.tokens.admin
    )
    expect(response.status).toBe(204)

    // phoenix-1 public key should still resolve.
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('phoenix-1'))).body
    ).toEqual({
      uuid,
      nonce: INITIAL_NONCE + 1,
      name: null,
      nft: null,
      chains: {
        'phoenix-1': {
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('phoenix-1'),
          },
          address: user.getAddress('phoenix-1'),
        },
      },
    })

    // neutron-1 and cosmoshub-4 should be an empty profile.
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('neutron-1'))).body
    ).toEqual({
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
    expect(
      (await fetchProfileViaPublicKey(user.getPublicKey('cosmoshub-4'))).body
    ).toEqual({
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    })
  })

  it('returns 401 if public keys are not attached to the profile', async () => {
    const user = await TestUser.create('neutron-1', 'phoenix-1')
    await user.createTokens({
      chainId: 'neutron-1',
    })

    // Unregister public key for phoenix-1, which is not attached to the
    // neutron-1 profile, since the public keys are different.
    const { response, error } = await unregisterPublicKeys(
      await user.signRequestBody({
        publicKeys: [
          {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('phoenix-1'),
          },
        ],
      })
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Not all public keys are attached to this profile.')
  })

  it('deletes profile if all public keys are unregistered', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens()
    await user.registerPublicKeys({ chainIds })

    // Unregister all public keys.
    const { response } = await unregisterPublicKeys(
      await user.signRequestBody({
        publicKeys: [
          {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('cosmoshub-4'),
          },
          {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('phoenix-1'),
          },
        ],
      })
    )
    expect(response.status).toBe(204)

    // Profile DB should be empty.
    expect(
      (await env.DB.prepare('SELECT COUNT(*) as count FROM profiles').all())
        .results[0].count
    ).toBe(0)

    // Profile should be empty for all chains.
    for (const chainId of chainIds) {
      expect(
        (await fetchProfileViaPublicKey(user.getPublicKey(chainId))).body
      ).toEqual({
        uuid: '',
        nonce: INITIAL_NONCE,
        name: null,
        nft: null,
        chains: {},
      })
    }
  })

  it('returns 401 for non-admin token', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({ chainId: 'neutron-1' })
    await user.registerPublicKeys({ chainIds })

    // Unregister public key for cosmoshub-4, which is the same as neutron-1.
    // Only phoenix-1 should remain.
    const { response, error } = await unregisterPublicKeys(
      {
        data: {
          publicKeys: [
            {
              type: CosmosSecp256k1PublicKey.type,
              hex: user.getPublicKey('cosmoshub-4'),
            },
          ],
        },
      },
      user.tokens.notAdmin
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid auth data.')
  })
})
