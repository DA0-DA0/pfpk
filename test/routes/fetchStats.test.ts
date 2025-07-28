import { describe, expect, it } from 'vitest'

import { fetchStats } from './routes'
import { TestUser } from '../TestUser'

describe('GET /stats', () => {
  it('returns 200', async () => {
    const { response } = await fetchStats()
    expect(response.status).toBe(200)
  })

  it('should return the correct stats', async () => {
    expect((await fetchStats()).body).toEqual({
      total: 0,
    })

    // create 2 profiles
    const user1 = await TestUser.create('neutron-1')
    await user1.updateProfile({
      name: 'user',
    })

    const user2 = await TestUser.create('neutron-1')
    await user2.updateProfile({
      name: 'user2',
    })

    expect((await fetchStats()).body).toEqual({
      total: 2,
    })

    // remove a profile by removing its only public key
    await user1.unregisterPublicKeys({
      chainIds: 'neutron-1',
    })

    expect((await fetchStats()).body).toEqual({
      total: 1,
    })
  })
})
