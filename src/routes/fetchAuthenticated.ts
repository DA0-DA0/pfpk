import { RequestHandler } from 'itty-router'

import { AuthorizedRequest } from '../types'

export const fetchAuthenticated: RequestHandler<AuthorizedRequest> = () =>
  new Response(null, { status: 204 })
