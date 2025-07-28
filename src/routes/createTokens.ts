import { RequestHandler } from 'itty-router'

import {
  AuthorizedRequest,
  CreateTokensRequest,
  CreateTokensResponse,
} from '../types'
import {
  cleanUpExpiredTokens,
  createJwtSet,
  saveTokensToProfile,
} from '../utils'

export const createTokens: RequestHandler<
  AuthorizedRequest<CreateTokensRequest>
> = async (
  {
    profile,
    validatedBody: {
      data: { tokens },
    },
  },
  env
): Promise<CreateTokensResponse> => {
  // If no tokens are provided, create a single token.
  if (!tokens?.length) {
    tokens = [{}]
  }

  // Clean up expired tokens for the profile before creating a new one.
  await cleanUpExpiredTokens(env, profile.id)

  // Create new tokens for the profile.
  const issuedAt = new Date()
  const createdTokens = await Promise.all(
    tokens.map(async ({ name, audience, role }) => {
      const {
        uuid: tokenUuid,
        expiresAt,
        token,
      } = await createJwtSet(env, {
        profileUuid: profile.uuid,
        audience,
        role,
        expiresInSeconds: 60 * 60 * 24 * 14, // 2 weeks
        issuedAt,
      })

      return {
        profileId: profile.id,
        tokenUuid,
        name,
        audience,
        role,
        expiresAt,
        issuedAt: issuedAt.getTime(),
        token,
      }
    })
  )

  // Save tokens in the DB so they can be listed or invalidated later.
  await saveTokensToProfile(env, createdTokens)

  return {
    tokens: createdTokens.map(
      ({
        tokenUuid,
        name = null,
        audience = null,
        role = null,
        issuedAt,
        expiresAt,
        token,
      }) => ({
        id: tokenUuid,
        token,
        name,
        audience,
        role,
        issuedAt,
        expiresAt,
      })
    ),
  }
}
