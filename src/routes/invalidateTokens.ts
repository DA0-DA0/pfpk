import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, InvalidateTokensRequest } from '../types'
import { cleanUpExpiredTokens, removeTokenIdFromProfile } from '../utils'

export const invalidateTokens: RequestHandler<
  AuthorizedRequest<InvalidateTokensRequest>
> = async (
  {
    profile,
    validatedBody: {
      data: { tokens },
    },
  },
  env: Env
) => {
  // Clean up expired tokens for the profile.
  await cleanUpExpiredTokens(env, profile.id)

  // Invalidate specified tokens.
  await Promise.all(
    tokens?.map((tokenUuid) =>
      removeTokenIdFromProfile(env, {
        profileId: profile.id,
        tokenUuid,
      })
    ) ?? []
  )

  return new Response(null, { status: 204 })
}
