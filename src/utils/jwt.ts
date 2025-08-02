import jwt from '@tsndr/cloudflare-worker-jwt'

import { KnownError } from './error'
import { objectMatchesStructure } from './objectMatchesStructure'
import { JwtPayload } from '../types'

/**
 * Create a JWT token.
 *
 * @param env - The environment.
 * @param options - The options to create the JWT token.
 * @returns The signed JWT tokens, token UUID, issued at timestamp, and
 * expiration timestamp.
 */
export const createJwt = async (
  env: Env,
  {
    profileUuid,
    audience,
    scope,
    role,
    expiresInSeconds,
    issuedAtDate = new Date(),
  }: {
    /**
     * UUID of the profile.
     */
    profileUuid: string
    /**
     * Optional audience.
     */
    audience?: string[]
    /**
     * Optional scope.
     */
    scope?: string
    /**
     * Optional role.
     */
    role?: string
    /**
     * Expires in seconds.
     */
    expiresInSeconds: number
    /**
     * Optionally set issuedAt timestamp. Defaults to now.
     */
    issuedAtDate?: Date
  }
): Promise<{
  uuid: string
  issuedAt: number
  expiresAt: number
  token: string
}> => {
  const issuedAt = Math.floor(issuedAtDate.getTime() / 1000)
  const uuid = await crypto.randomUUID()
  const expiresAt = issuedAt + expiresInSeconds

  const token = await jwt.sign(
    {
      sub: profileUuid,
      ...(audience?.length && { aud: audience }),
      exp: expiresAt,
      iat: issuedAt,
      jti: uuid,
      ...(scope && { scope }),
      ...(role && { role }),
    } satisfies JwtPayload,
    env.JWT_SECRET
  )

  return {
    uuid,
    issuedAt,
    expiresAt,
    token,
  }
}

/**
 * Verify a JWT token and return the UUID of the profile.
 *
 * @param env - The environment.
 * @param token - The JWT token to verify.
 * @returns The UUID of the profile.
 */
export const verifyJwt = async (
  env: Env,
  token: string
): Promise<JwtPayload> => {
  const verified = await jwt
    .verify<JwtPayload>(token, env.JWT_SECRET, {
      throwError: true,
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : `${err}`
      throw new KnownError(
        401,
        'Unauthorized',
        message === 'EXPIRED'
          ? 'Token expired.'
          : `Invalid token. Error: ${message}`
      )
    })

  // Should never happen since errors are thrown above.
  if (
    !verified?.payload ||
    !objectMatchesStructure(verified.payload, {
      sub: {},
      exp: {},
      iat: {},
      jti: {},
    })
  ) {
    throw new KnownError(401, 'Unauthorized', 'Invalid token.')
  }

  return verified.payload
}
