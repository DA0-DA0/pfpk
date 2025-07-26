import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, FetchTokensResponse } from '../types'
import { getValidTokensForProfile } from '../utils'

export const fetchTokens: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<FetchTokensResponse> => {
  const tokens = await getValidTokensForProfile(env, profile.id)
  return {
    tokens: tokens.map(({ uuid, expiresAt, createdAt }) => ({
      id: uuid,
      issuedAt: createdAt,
      expiresAt,
    })),
  }
}
