import { RequestHandler } from 'itty-router'

import { AuthorizedRequest, InvalidateTokensRequest } from '../types'
import {
  cleanUpExpiredTokens,
  removeAllTokensFromProfile,
  removeTokenIdFromProfile,
} from '../utils'

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
  // Remove specific tokens or all tokens if none are provided.
  if (tokens?.length) {
    await Promise.all(
      tokens?.map((tokenUuid) =>
        removeTokenIdFromProfile(env, {
          profileId: profile.id,
          tokenUuid,
        })
      ) ?? []
    )

    // Clean up expired tokens as well.
    await cleanUpExpiredTokens(env, profile.id)
  } else {
    await removeAllTokensFromProfile(env, profile.id)
  }

  return new Response(null, { status: 204 })
}
