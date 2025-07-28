import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, FetchTokensResponse, TokenJson } from '../types'
import { getValidTokensForProfile } from '../utils'

export const fetchTokens: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<FetchTokensResponse> => {
  const tokens = await getValidTokensForProfile(env, profile.id)
  return {
    tokens: tokens.map(
      ({ uuid, name, audience, role, createdAt, expiresAt }): TokenJson => ({
        id: uuid,
        name,
        audience: audience ? JSON.parse(audience) : null,
        role,
        issuedAt: createdAt,
        expiresAt,
      })
    ),
  }
}
