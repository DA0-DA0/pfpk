import { describe, expect, it } from 'vitest'

import { fetchNonce } from './routes'
import { TestUser } from './TestUser'

describe('GET /nonce/:publicKey', () => {
  it('returns 200 for valid public key', async () => {
    const user = await TestUser.create('neutron-1')
    const { response } = await fetchNonce(user.getPublicKey('neutron-1'))
    expect(response.status).toBe(200)
  })
})
