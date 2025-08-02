import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { registerPublicKeys } from './routes'
import { CosmosSecp256k1PublicKey } from '../../src/publicKeys/CosmosSecp256k1PublicKey'
import { TestUser } from '../TestUser'

// neutron-1 and cosmoshub-4 have the same coin type and public key, phoenix-1
// has a different coin type and public key.
const chainIds = ['neutron-1', 'cosmoshub-4', 'phoenix-1']

describe('POST /register', () => {
  it('returns 204 and registers public keys via UUID allow', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({
      chainId: chainIds[0],
    })
    const { uuid } = await user.fetchProfile()

    const { response } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: [chainIds[1]],
              },
              {
                chainId: chainIds[1],
                nonce: await user.fetchNonce(chainIds[1]),
              }
            ),
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: [chainIds[2]],
              },
              {
                chainId: chainIds[2],
                nonce: await user.fetchNonce(chainIds[2]),
              }
            ),
          ],
        },
        {
          chainId: chainIds[0],
          nonce: await user.fetchNonce(chainIds[0]),
        }
      )
    )
    expect(response.status).toBe(204)

    const profile = await user.fetchProfile()
    expect(profile.chains).toEqual(
      Object.fromEntries(
        chainIds.map((chainId) => [
          chainId,
          {
            publicKey: {
              type: CosmosSecp256k1PublicKey.type,
              hex: user.getPublicKey(chainId),
            },
            address: user.getAddress(chainId),
          },
        ])
      )
    )
  })

  it('returns 204 and registers public keys via public key allow', async () => {
    const user = await TestUser.create(...chainIds)
    const nonce = await user.fetchNonce()

    const { response } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: {
                  publicKey: {
                    type: CosmosSecp256k1PublicKey.type,
                    hex: user.getPublicKey(chainIds[0]),
                  },
                },
                chainIds: [chainIds[1]],
              },
              {
                chainId: chainIds[1],
                nonce,
              }
            ),
            await user.signRequestBody(
              {
                allow: {
                  publicKey: {
                    type: CosmosSecp256k1PublicKey.type,
                    hex: user.getPublicKey(chainIds[0]),
                  },
                },
                chainIds: [chainIds[2]],
              },
              {
                chainId: chainIds[2],
                nonce,
              }
            ),
          ],
        },
        {
          chainId: chainIds[0],
          nonce,
        }
      )
    )
    expect(response.status).toBe(204)

    const profile = await user.fetchProfile()
    expect(profile.chains).toEqual(
      Object.fromEntries(
        chainIds.map((chainId) => [
          chainId,
          {
            publicKey: {
              type: CosmosSecp256k1PublicKey.type,
              hex: user.getPublicKey(chainId),
            },
            address: user.getAddress(chainId),
          },
        ])
      )
    )
  })

  it('returns 204 with JWT auth admin token', async () => {
    const user = await TestUser.create('neutron-1', 'phoenix-1')
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid } = await user.fetchProfile()
    const phoenixNonce = await user.fetchNonce('phoenix-1')

    const { response } = await registerPublicKeys(
      {
        data: {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce: phoenixNonce,
              }
            ),
          ],
        },
      },
      user.tokens.admin
    )
    expect(response.status).toBe(204)

    // profile should have both chains
    const profile = await user.fetchProfile('phoenix-1')
    expect(profile.chains).toEqual({
      'neutron-1': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
      },
      'phoenix-1': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('phoenix-1'),
        },
        address: user.getAddress('phoenix-1'),
      },
    })
  })

  it('removes public keys from other profiles', async () => {
    const user = await TestUser.create(...chainIds)

    // Create tokens with different public keys to create two different
    // profiles, without merging them.
    await user.createTokens({
      chainId: 'neutron-1',
    })
    await user.createTokens({
      chainId: 'phoenix-1',
    })

    const { uuid: neutronUuid } = await user.fetchProfile('neutron-1')
    const { uuid: phoenixUuid } = await user.fetchProfile('phoenix-1')

    expect(neutronUuid).not.toBe(phoenixUuid)

    // Profile DB should have two profiles.
    expect(
      (await env.DB.prepare('SELECT COUNT(*) as count FROM profiles').all())
        .results[0].count
    ).toBe(2)

    // Register public key for phoenix-1 by neutron-1 profile.
    const { response } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                // Allow neutron-1 profile to register this public key.
                allow: { uuid: neutronUuid },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce: await user.fetchNonce('phoenix-1'),
              }
            ),
          ],
        },
        {
          chainId: 'neutron-1',
          nonce: await user.fetchNonce('neutron-1'),
        }
      )
    )
    expect(response.status).toBe(204)

    // phoenix-1 profile should now be the same as the neutron-1 profile.
    const newPhoenixProfile = await user.fetchProfile('phoenix-1')
    expect(newPhoenixProfile).toEqual({
      uuid: neutronUuid,
      name: null,
      nft: null,
      chains: {
        'neutron-1': {
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('neutron-1'),
          },
          address: user.getAddress('neutron-1'),
        },
        'phoenix-1': {
          publicKey: {
            type: CosmosSecp256k1PublicKey.type,
            hex: user.getPublicKey('phoenix-1'),
          },
          address: user.getAddress('phoenix-1'),
        },
      },
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })

    // Profile DB should have one profile.
    expect(
      (await env.DB.prepare('SELECT COUNT(*) as count FROM profiles').all())
        .results[0].count
    ).toBe(1)
  })

  it('does not need internal signature if registering already-registered public keys', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid, chains } = await user.fetchProfile()
    const nonce = await user.fetchNonce()

    expect(chains).toEqual({
      'neutron-1': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('neutron-1'),
        },
        address: user.getAddress('neutron-1'),
      },
    })

    const { response } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: ['cosmoshub-4'],
              },
              {
                chainId: 'cosmoshub-4',
                nonce,
                // Create auth body for cosmoshub-4 without signature since its
                // public key is already registered via neutron-1 and thus no
                // need to sign it. This is just a chain preference setting
                // since the public key is already registered.
                noSign: true,
              }
            ),
          ],
        },
        {
          chainId: 'neutron-1',
          nonce,
        }
      )
    )
    expect(response.status).toBe(204)

    // Profile should now have cosmoshub-4 chain preference.
    const newProfile = await user.fetchProfile()
    expect(newProfile.chains).toEqual({
      ...chains,
      'cosmoshub-4': {
        publicKey: {
          type: CosmosSecp256k1PublicKey.type,
          hex: user.getPublicKey('cosmoshub-4'),
        },
        address: user.getAddress('cosmoshub-4'),
      },
    })
  })

  it('returns 401 for non-admin token', async () => {
    const user = await TestUser.create('neutron-1', 'phoenix-1')
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid } = await user.fetchProfile()
    const nonce = await user.fetchNonce()

    const { response, error } = await registerPublicKeys(
      {
        data: {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce,
              }
            ),
          ],
        },
      },
      user.tokens.notAdmin
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid auth data.')
  })

  it('returns 401 if new public key nested auth is invalid', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid } = await user.fetchProfile()
    const nonce = await user.fetchNonce()

    const { response, error } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            {
              ...(await user.signRequestBody(
                {
                  allow: { uuid },
                  chainIds: ['phoenix-1'],
                },
                {
                  chainId: 'phoenix-1',
                  nonce,
                }
              )),
              signature: 'invalid',
            },
          ],
        },
        {
          chainId: 'neutron-1',
          nonce,
        }
      )
    )
    expect(response.status).toBe(401)
    expect(error).toBe('Unauthorized: Invalid signature.')
  })

  it('returns 401 if allow UUID is invalid', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid } = await user.fetchProfile()
    const nonce = await user.fetchNonce()

    const { response, error } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid: 'invalid' },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce,
              }
            ),
          ],
        },
        {
          chainId: 'neutron-1',
          nonce,
        }
      )
    )
    expect(response.status).toBe(401)
    expect(error).toBe(
      `Unauthorized: Invalid allowed profile, expected UUID: ${uuid}.`
    )
  })

  it('returns 401 if allow public key is invalid', async () => {
    const user = await TestUser.create(...chainIds)
    const nonce = await user.fetchNonce()

    const { response, error } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: {
                  publicKey: {
                    type: CosmosSecp256k1PublicKey.type,
                    hex: 'invalid',
                  },
                },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce,
              }
            ),
          ],
        },
        {
          chainId: 'neutron-1',
          nonce,
        }
      )
    )
    expect(response.status).toBe(401)
    expect(
      error?.startsWith(
        'Unauthorized: Invalid allowed profile, expected UUID: '
      )
    ).toBe(true)
  })

  it('returns 401 if nonce is invalid', async () => {
    const user = await TestUser.create(...chainIds)
    await user.createTokens({
      chainId: 'neutron-1',
    })
    const { uuid } = await user.fetchProfile()
    const nonce = await user.fetchNonce()
    const phoenixNonce = await user.fetchNonce('phoenix-1')

    const { response, error } = await registerPublicKeys(
      await user.signRequestBody(
        {
          publicKeys: [
            await user.signRequestBody(
              {
                allow: { uuid },
                chainIds: ['phoenix-1'],
              },
              {
                chainId: 'phoenix-1',
                nonce: nonce + 99,
              }
            ),
          ],
        },
        {
          chainId: 'neutron-1',
          nonce,
        }
      )
    )
    expect(response.status).toBe(401)
    expect(error).toBe(`Unauthorized: Invalid nonce. Expected: ${phoenixNonce}`)
  })
})
