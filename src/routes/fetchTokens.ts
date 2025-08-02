import { RequestHandler } from 'itty-router'

import {
  AuthorizedRequest,
  FetchTokensResponse,
  TokenJsonNoToken,
} from '../types'
import { getValidTokensForProfile } from '../utils'

export const fetchTokens: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<FetchTokensResponse> => {
  const tokens = await getValidTokensForProfile(env, profile.id)
  return {
    tokens: tokens.map(
      ({
        uuid,
        name,
        audience,
        scope,
        role,
        createdAt,
        expiresAt,
      }): TokenJsonNoToken => ({
        id: uuid,
        name,
        audience: audience ? JSON.parse(audience) : null,
        // Scope is a space-separated string according to the spec:
        // https://datatracker.ietf.org/doc/html/rfc8693#name-scope-scopes-claim
        scopes: scope ? scope.split(' ') : null,
        role,
        issuedAt: createdAt,
        expiresAt,
      })
    ),
  }
}
