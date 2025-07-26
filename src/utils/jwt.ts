import jwt from '@tsndr/cloudflare-worker-jwt'

import { KnownError } from './error'
import { objectMatchesStructure } from './objectMatchesStructure'
import { JwtPayload } from '../types'

/**
 * Create a JWT token.
 *
 * @param env - The environment.
 * @param options - The options to create the JWT token.
 * @returns The signed JWT token, token ID, issued at timestamp, and expiration timestamp.
 */
export const createJwt = async (
  env: Env,
  {
    profileUuid,
    expiresIn,
  }: {
    /**
     * UUID of the profile.
     */
    profileUuid: string
    /**
     * Expires in seconds.
     */
    expiresIn: number
  }
): Promise<{
  uuid: string
  token: string
  issuedAt: number
  expiresAt: number
}> => {
  const issuedAt = Math.floor(Date.now() / 1000)
  const uuid = await crypto.randomUUID()
  const expiresAt = issuedAt + expiresIn
  const token = await jwt.sign(
    {
      sub: profileUuid,
      exp: expiresAt,
      iat: issuedAt,
      jti: uuid,
    },
    env.JWT_SECRET
  )

  return {
    uuid,
    token,
    issuedAt,
    expiresAt,
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
      const message = err instanceof Error ? err.message : 'Invalid token.'
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

/**
 * Decode a JWT token, without verifying it, and return the payload.
 *
 * @param token - The JWT token to decode.
 * @returns The decoded payload.
 */
export const decodeJwt = (token: string): JwtPayload =>
  jwt.decode<JwtPayload>(token).payload
