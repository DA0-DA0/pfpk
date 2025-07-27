import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, CreateTokenResponse } from '../types'
import { cleanUpExpiredTokens, createJwt, saveTokenIdToProfile } from '../utils'

export const createToken: RequestHandler<AuthorizedRequest> = async (
  { profile },
  env: Env
): Promise<CreateTokenResponse> => {
  // Clean up expired tokens for the profile before creating a new one.
  await cleanUpExpiredTokens(env, profile.id)

  // Create a new token for the profile.
  const {
    uuid: tokenUuid,
    issuedAt,
    expiresAt,
    tokens,
  } = await createJwt(env, {
    profileUuid: profile.uuid,
    expiresIn: 60 * 60 * 24 * 14, // 2 weeks
  })

  // Save token ID for the profile so it can be invalidated later.
  await saveTokenIdToProfile(env, {
    profileId: profile.id,
    tokenUuid,
    expiresAt,
    issuedAt,
  })

  return {
    id: tokenUuid,
    expiresAt,
    tokens,
  }
}
