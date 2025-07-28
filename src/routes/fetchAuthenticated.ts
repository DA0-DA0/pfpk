import { RequestHandler } from 'itty-router'

import { AuthorizedRequest } from '../types'
import { KnownError } from '../utils'

export const fetchAuthenticated: RequestHandler<AuthorizedRequest> = ({
  query: { audience },
  jwtPayload,
}) => {
  // One or more audiences can be provided in the query.
  const queryAudiences = audience?.length ? [audience].flat() : []

  // If audience(s) provided, verify that the token has at least one of them.
  if (
    queryAudiences.length &&
    (!jwtPayload?.aud ||
      !queryAudiences.some((aud) => jwtPayload?.aud?.includes(aud)))
  ) {
    throw new KnownError(401, 'Unauthorized', 'Invalid audience.')
  }

  return new Response(null, { status: 204 })
}
