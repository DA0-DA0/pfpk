import { RequestHandler } from 'itty-router'

import {
  AuthorizedRequest,
  CreateTokenRequest,
  CreateTokenResponse,
} from '../types'
import { cleanUpExpiredTokens, createJwt, saveTokenIdToProfile } from '../utils'

export const createToken: RequestHandler<
  AuthorizedRequest<CreateTokenRequest>
> = async (
  {
    profile,
    validatedBody: {
      data: { name, audience },
    },
  },
  env
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
    audience,
    expiresIn: 60 * 60 * 24 * 14, // 2 weeks
  })

  // Save token in the DB so it can be listed or invalidated later.
  await saveTokenIdToProfile(env, {
    profileId: profile.id,
    tokenUuid,
    name,
    audience,
    expiresAt,
    issuedAt,
  })

  return {
    id: tokenUuid,
    expiresAt,
    tokens,
  }
}
