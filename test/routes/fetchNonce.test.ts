import { describe, expect, it } from 'vitest'

import { fetchNonce } from './routes'
import { INITIAL_NONCE } from '../../src/utils/auth'
import { TestUser } from '../TestUser'

describe('GET /nonce/:publicKey', () => {
  it('returns 200 for valid public key', async () => {
    const user = await TestUser.create('neutron-1')
    const { response, body } = await fetchNonce(user.getPublicKey('neutron-1'))

    expect(response.status).toBe(200)
    expect(body.nonce).toBe(INITIAL_NONCE)
  })

  it('auto-increments nonce for signature auth', async () => {
    const user = await TestUser.create('neutron-1')
    const nonce = await user.fetchNonce()
    expect(nonce).toBe(INITIAL_NONCE)

    // increment nonce by updating profile with signature auth
    await user.updateProfile({ name: 'test' }, { withToken: false })

    // nonce should be incremented
    const nonce2 = await user.fetchNonce()
    expect(nonce2).toBe(nonce + 1)

    // create token with signature auth, incrementing nonce
    await user.createTokens()

    // nonce should be incremented again
    const nonce3 = await user.fetchNonce()
    expect(nonce3).toBe(nonce2 + 1)

    // update profile with token auth, nonce should NOT be incremented
    await user.updateProfile({ name: 'test' }, { withToken: true })
    const nonce4 = await user.fetchNonce()
    expect(nonce4).toBe(nonce3)
  })
})
