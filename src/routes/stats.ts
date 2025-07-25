import { RequestHandler } from 'itty-router'

import { Env, StatsResponse } from '../types'
import { KnownError } from '../utils'

export const stats: RequestHandler = async (
  _,
  env: Env
): Promise<StatsResponse> => {
  const { total } =
    (await env.DB.prepare('SELECT COUNT(*) AS total FROM profiles').first<{
      total: number
    }>()) ?? {}

  if (typeof total !== 'number') {
    throw new KnownError(500, 'Failed to get stats.')
  }

  return {
    total,
  }
}
