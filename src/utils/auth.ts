import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { RequestHandler } from 'itty-router'

import {
  getNonce,
  getProfileFromPublicKeyHex,
  getProfileFromUuid,
  getTokenForProfile,
  incrementNonce,
  saveProfile,
} from './db'
import { KnownError } from './error'
import { verifyJwt } from './jwt'
import { objectMatchesStructure } from './objectMatchesStructure'
import { makePublicKeyFromJson } from '../publicKeys'
import {
  AuthorizedRequest,
  DbRowProfile,
  JwtTokenRequirements,
  PublicKey,
  RequestBody,
} from '../types'

export const INITIAL_NONCE = 0

/**
 * Middleware to protect routes via JWT token authorization. If it does not
 * throw an error, the request is authorized. If successful, the `validatedBody`
 * field will be set on the request object, accessible by successive middleware
 * and route handlers.
 *
 * @param request - The request to authenticate.
 */
export const makeJwtAuthMiddleware =
  ({
    audience,
    scopes,
    role,
  }: JwtTokenRequirements = {}): RequestHandler<AuthorizedRequest> =>
  async (request, env: Env) => {
    // If JWT token is provided, verify it.
    const authHeader = request.headers.get('Authorization')
    if (!authHeader) {
      throw new KnownError(401, 'Unauthorized', 'No authorization header.')
    }

    const [type, token] = authHeader.split(' ')

    if (type !== 'Bearer') {
      throw new KnownError(
        401,
        'Unauthorized',
        'Invalid token type, expected `Bearer`.'
      )
    }

    if (!token) {
      throw new KnownError(401, 'Unauthorized', 'No token provided.')
    }

    const jwtPayload = await verifyJwt(env, token)

    // Verify audience if provided.
    const hostname = new URL(request.url).hostname
    if (
      audience?.length &&
      (!jwtPayload.aud ||
        !(audience === 'current'
          ? jwtPayload.aud.includes(hostname)
          : jwtPayload.aud.some((a) => audience?.includes(a))))
    ) {
      throw new KnownError(401, 'Unauthorized', 'Invalid token audience.')
    }

    // Verify scope if provided.
    const tokenScopes = jwtPayload.scope?.split(' ')
    if (
      scopes?.length &&
      (!tokenScopes || !scopes.every((s) => tokenScopes.includes(s)))
    ) {
      throw new KnownError(401, 'Unauthorized', 'Invalid token scope.')
    }

    // Verify role if provided.
    if (role?.length && (!jwtPayload.role || !role.includes(jwtPayload.role))) {
      throw new KnownError(401, 'Unauthorized', 'Invalid token role.')
    }

    request.jwtPayload = jwtPayload

    const profile = await getProfileFromUuid(env, request.jwtPayload.sub)
    if (!profile) {
      throw new KnownError(404, 'Profile not found.')
    }
    request.profile = profile

    // Verify token exists in DB. If not, it must have been invalidated.
    // Expiration was checked in verifyJwt above, so we should only get here if
    // the token is valid but was manually invalidated.
    const dbToken = await getTokenForProfile(env, profile.id, jwtPayload.jti)
    if (!dbToken) {
      throw new KnownError(401, 'Unauthorized', 'Token invalidated.')
    }

    // Don't parse the body again if it was already parsed.
    if (!request.validatedBody) {
      request.validatedBody = request.body
        ? await request.json<RequestBody>().catch((err) => {
            // Cannot parse body twice, and signature auth needs a valid body,
            // so if JSON parsing fails, return a fatal error and stop early.
            throw new KnownError(400, 'Invalid request body', err, true)
          })
        : // If no body, use empty object for data and no signature.
          {
            data: {},
          }
    }
    const body = request.validatedBody

    // If auth is provided, validate that it matches the profile. If it doesn't
    // match, strip it since it's untrusted.
    if (body.data.auth) {
      const profileForPublicKey = await getProfileFromPublicKeyHex(
        env,
        body.data.auth.publicKey.hex
      )

      if (profileForPublicKey?.id === profile.id) {
        // If auth matches the profile, validate public key and add to request.
        request.publicKey = makePublicKeyFromJson(body.data.auth.publicKey)
        request.profilePublicKeyRowId = profileForPublicKey.profilePublicKeyId
      } else {
        // If public key auth does not match the profile, error.
        throw new KnownError(
          401,
          'Unauthorized',
          'Mismatched token and public key auth.',
          true
        )
      }
    }
  }

/**
 * Middleware to protect routes via wallet signature authorization. If it does
 * not throw an error, the request is authorized. If successful, the
 * `validatedBody` field will be set on the request object, accessible by
 * successive middleware and route handlers.
 *
 * Notes:
 * - Creates a new profile for the public key if one does not exist.
 * - Increments nonce to prevent replay attacks.
 *
 * @param request - The request to authenticate.
 */
export const signatureAuthMiddleware: RequestHandler<
  AuthorizedRequest
> = async (request, env: Env) => {
  // JWT auth may have failed after the body was parsed—don't parse it again.
  if (!request.validatedBody) {
    request.validatedBody = await request.json<RequestBody>?.().catch((err) => {
      throw new KnownError(400, 'Invalid request body', err)
    })
  }
  const body = request.validatedBody

  if (!body.data.auth) {
    throw new KnownError(401, 'Unauthorized', 'Invalid auth data.')
  }

  // Verify request body, increment nonce, and add public key to request.
  request.publicKey = await verifyRequestAndIncrementNonce(env, body)

  // Retrieve or create profile for public key.
  let profile: (DbRowProfile & { profilePublicKeyId?: number }) | null = null
  try {
    profile = await getProfileFromPublicKeyHex(env, request.publicKey.hex)
  } catch (err) {
    console.error('Profile retrieval', err)
    throw new KnownError(500, 'Failed to retrieve existing profile', err)
  }

  // If no profile found, create a new one with the public key and a chain
  // preference for the chain used to sign.
  if (!profile) {
    profile = await saveProfile(
      env,
      {},
      {
        publicKey: request.publicKey,
        chainIds: [body.data.auth.chainId],
      }
    )
  }

  // Ensure profile public key exists. This should never happen as it's either
  // created or already exists.
  if (!profile.profilePublicKeyId) {
    throw new KnownError(500, 'Failed to retrieve profile public key from DB.')
  }

  request.profile = profile
  request.profilePublicKeyRowId = profile.profilePublicKeyId
}

/**
 * Middleware to protect routes via JWT token or wallet signature authorization.
 * If it does not throw an error, the request is authorized. If successful, the
 * `validatedBody` field will be set on the request object, accessible by
 * successive middleware and route handlers.
 *
 * @param request - The request to authenticate.
 */
export const makeJwtOrSignatureAuthMiddleware = (
  requirements?: JwtTokenRequirements
): RequestHandler<AuthorizedRequest> => {
  const jwtAuthMiddleware = makeJwtAuthMiddleware(requirements)

  return async (...params) => {
    // Attempt JWT auth first. On success, stop early.
    try {
      await jwtAuthMiddleware(...params)
      return
    } catch (err) {
      // Propagate only fatal JWT auth errors that should not fallback to
      // signature auth.
      if (err instanceof KnownError && err.fatal) {
        throw err
      }
    }

    // Attempt signature auth.
    await signatureAuthMiddleware(...params)
  }
}

/**
 * Perform verification on a parsed request body. Throws error on failure.
 * Returns public key on success.
 */
export const verifyRequestAndIncrementNonce = async (
  env: Env,
  body: RequestBody
): Promise<PublicKey> => {
  if (
    // Validate body has at least the auth fields we need.
    !objectMatchesStructure(body, {
      data: {
        auth: {
          timestamp: {},
          type: {},
          nonce: {},
          chainId: {},
          chainFeeDenom: {},
          chainBech32Prefix: {},
          publicKey: {
            type: {},
            hex: {},
          },
        },
      },
      signature: {},
    }) ||
    !body.data.auth
  ) {
    throw new KnownError(401, 'Unauthorized', 'Invalid auth data.')
  }

  // Validate timestamp is within the last 5 minutes.
  if (body.data.auth.timestamp < Date.now() - 5 * 60 * 1000) {
    throw new KnownError(
      401,
      'Unauthorized',
      'Timestamp must be within the past 5 minutes.'
    )
  }

  // Validate public key.
  const publicKey = makePublicKeyFromJson(body.data.auth.publicKey)

  // Validate signature.
  if (!(await verifySignature(publicKey, body))) {
    throw new KnownError(401, 'Unauthorized', 'Invalid signature.')
  }

  // Validate and increment nonce to prevent replay attacks.
  await validateAndIncrementNonce(env, publicKey, body.data.auth.nonce)

  return publicKey
}

/**
 * Verify signature using ADR-036.
 *
 * https://github.com/cosmos/cosmos-sdk/blob/main/docs/architecture/adr-036-arbitrary-signature.md
 */
export const verifySignature = async (
  publicKey: PublicKey,
  { data, signature }: RequestBody
): Promise<boolean> => {
  if (!signature) {
    throw new KnownError(401, 'Unauthorized', 'No signature provided.')
  }

  // Validate auth data is present.
  if (!data.auth) {
    throw new KnownError(401, 'Unauthorized', 'Invalid auth data.')
  }

  try {
    const signer = publicKey.getBech32Address(data.auth.chainBech32Prefix)

    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: data.auth.type,
            value: {
              signer,
              data: JSON.stringify(data, undefined, 2),
            },
          },
        ],
        {
          gas: '0',
          amount: [
            {
              denom: data.auth.chainFeeDenom,
              amount: '0',
            },
          ],
        },
        data.auth.chainId,
        '',
        0,
        0
      )
    )

    return await publicKey.verifySignature(message, signature)
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}

/**
 * Validate the nonce for a given public key and increment it to prevent replay
 * attacks.
 */
export const validateAndIncrementNonce = async (
  env: Env,
  publicKey: PublicKey,
  checkNonce: number
) => {
  const expectedNonce = await getNonce(env, publicKey)
  if (checkNonce !== expectedNonce) {
    throw new KnownError(
      401,
      'Unauthorized',
      `Invalid nonce. Expected: ${expectedNonce}`
    )
  }
  await incrementNonce(env, publicKey)
}
