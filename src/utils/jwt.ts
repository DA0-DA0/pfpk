import jwt from '@tsndr/cloudflare-worker-jwt'

import { KnownError } from './error'

/**
 * Create a JWT token.
 *
 * @param env - The environment.
 * @param options - The options to create the JWT token.
 * @returns The signed JWT token.
 */
export const createJwt = (
  env: Env,
  {
    uuid,
    expiresIn,
  }: {
    /**
     * UUID of the profile.
     */
    uuid: string
    /**
     * Expires in seconds.
     */
    expiresIn: number
  }
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    {
      sub: uuid,
      exp: now + expiresIn,
      iat: now,
    },
    env.JWT_SECRET
  )
}

/**
 * Verify a JWT token and return the UUID of the profile.
 *
 * @param env - The environment.
 * @param token - The JWT token to verify.
 * @returns The UUID of the profile.
 */
export const verifyJwt = async (env: Env, token: string): Promise<string> => {
  const verified = await jwt
    .verify(token, env.JWT_SECRET, {
      throwError: true,
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : 'Invalid token.'
      throw new KnownError(
        401,
        'Unauthorized',
        message === 'EXPIRED'
          ? 'Token expired. Please re-authenticate.'
          : `Invalid token. Error: ${message}`
      )
    })

  // Should never happen since errors are thrown above.
  if (!verified?.payload?.sub) {
    throw new KnownError(401, 'Unauthorized', 'Invalid token.')
  }

  return verified.payload.sub
}
