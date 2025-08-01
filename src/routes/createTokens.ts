import { RequestHandler } from 'itty-router'

import {
  AuthorizedRequest,
  CreateTokensRequest,
  CreateTokensResponse,
} from '../types'
import {
  KnownError,
  cleanUpExpiredTokens,
  createJwt,
  saveTokensToProfile,
} from '../utils'

const EXPIRATION_TIME_SECONDS = 60 * 60 * 24 * 14 // 2 weeks

export const createTokens: RequestHandler<
  AuthorizedRequest<CreateTokensRequest>
> = async (
  {
    url,
    jwtPayload,
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
  const now = new Date()
  const createdTokens = await Promise.all(
    tokens.map(async ({ name, audience, scopes, role }) => {
      // If making a token for the current domain, require that they used wallet
      // signature auth. This forces the user to re-authenticate with their
      // wallet to get a new token for this core auth service, in case their
      // token is exposed. If admin tokens could create new admin tokens, the
      // thief could create new tokens and never lose access to the account.
      // Requiring wallet signature auth minimizes the risk of this happening.
      if (audience?.includes(new URL(url).hostname) && jwtPayload) {
        throw new KnownError(
          401,
          'Unauthorized',
          `Tokens for ${new URL(url).hostname} must be created via signature auth.`
        )
      }

      // Scope should be a space-separated string according to the spec:
      // https://datatracker.ietf.org/doc/html/rfc8693#name-scope-scopes-claim
      const scope = scopes?.join(' ').trim()

      const {
        uuid: tokenUuid,
        issuedAt,
        expiresAt,
        token,
      } = await createJwt(env, {
        profileUuid: profile.uuid,
        audience,
        scope,
        role,
        expiresInSeconds: EXPIRATION_TIME_SECONDS,
        issuedAtDate: now,
      })

      return {
        profileId: profile.id,
        tokenUuid,
        name,
        audience,
        scopes,
        role,
        issuedAt,
        expiresAt,
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
        scopes = null,
        role = null,
        issuedAt,
        expiresAt,
        token,
      }) => ({
        id: tokenUuid,
        token,
        name,
        audience,
        scopes,
        role,
        issuedAt,
        expiresAt,
      })
    ),
  }
}
