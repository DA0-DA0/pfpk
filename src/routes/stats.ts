import { RouteHandler } from 'itty-router'

import { Env } from '../types'
import { respond } from '../utils'

export const stats: RouteHandler<Request> = async (_, env: Env) => {
  const { total } =
    (await env.DB.prepare('SELECT COUNT(*) AS total FROM profiles').first<{
      total: number
    }>()) ?? {}

  if (typeof total !== 'number') {
    return respond(500, {
      error: 'Failed to get stats.',
    })
  }

  return respond(200, {
    total,
  })
}
