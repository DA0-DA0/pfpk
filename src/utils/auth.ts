import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { RequestHandler } from 'itty-router'

import {
  getProfileFromPublicKeyHex,
  getProfileFromUuid,
  getTokenForProfile,
  saveProfile,
} from './db'
import { KnownError } from './error'
import { verifyJwt } from './jwt'
import { objectMatchesStructure } from './objectMatchesStructure'
import { makePublicKeyFromJson } from '../publicKeys'
import { AuthorizedRequest, JwtRole, PublicKey, RequestBody } from '../types'

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
  (...roles: JwtRole[]): RequestHandler<AuthorizedRequest> =>
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
    if (!roles.includes(jwtPayload.role)) {
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

    const body: RequestBody = request.body
      ? await request.json<RequestBody>().catch(() => {
          throw new KnownError(400, 'Invalid request body.')
        })
      : // If no body, use empty object for data and no signature.
        {
          data: {},
        }
    request.validatedBody = body

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
          'Mismatched token and public key auth.'
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
 * - Decrements nonce for profile stored in the request object so that the
 *   handlers have access to the nonce when the request was initiated. This is
 *   important when route handlers validate nested auth data inside the request
 *   body, like `registerPublicKeys`. The profile nonce should be the same
 *   regardless of JWT or signature auth.
 *
 * @param request - The request to authenticate.
 */
export const signatureAuthMiddleware: RequestHandler<
  AuthorizedRequest
> = async (request, env: Env) => {
  const body = await request.json<RequestBody>?.().catch(() => {
    throw new KnownError(400, 'Invalid request body.')
  })
  request.validatedBody = body

  // Verify body and add generated public key to request.
  request.publicKey = await verifyRequestBodyAndGetPublicKey(body)

  // Retrieve or create profile for public key.
  let existingProfile
  try {
    existingProfile = await getProfileFromPublicKeyHex(
      env,
      request.publicKey.hex
    )
  } catch (err) {
    console.error('Profile retrieval', err)
    throw new KnownError(500, 'Failed to retrieve existing profile', err)
  }

  // If no profile found, create a new one.
  if (!existingProfile) {
    // Ensure nonce is the initial nonce since this is the first time the user
    // is authenticating. If it's not, they may think they're using an account
    // that already exists.
    if (body.data.auth?.nonce !== INITIAL_NONCE) {
      throw new KnownError(401, `Invalid nonce. Expected: ${INITIAL_NONCE}`)
    }

    const { profilePublicKeyId, ...profile } = await saveProfile(
      env,
      {
        // Increment nonce to prevent replay attacks.
        nonce: INITIAL_NONCE + 1,
      },
      {
        publicKey: request.publicKey,
        // Create chain preference with the current chain used to sign.
        chainIds: [body.data.auth.chainId],
      }
    )
    request.profile = profile
    request.profilePublicKeyRowId = profilePublicKeyId
  }
  // If profile found, validate nonce and save.
  else {
    // Validate nonce to prevent replay attacks.
    if (body.data.auth?.nonce !== existingProfile.nonce) {
      throw new KnownError(
        401,
        `Invalid nonce. Expected: ${existingProfile.nonce}`
      )
    }

    const { profilePublicKeyId, ...profile } = await saveProfile(
      env,
      {
        // Increment nonce to prevent replay attacks.
        nonce: existingProfile.nonce + 1,
      },
      {
        publicKey: request.publicKey,
      }
    )
    request.profile = profile
    request.profilePublicKeyRowId = profilePublicKeyId
  }

  // Ensure profile public key exists. This should never happen.
  if (!request.profilePublicKeyRowId) {
    throw new KnownError(500, 'Failed to retrieve profile public key from DB.')
  }

  // Decrement nonce since the request handler increments it.
  request.profile.nonce--
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
  ...roles: JwtRole[]
): RequestHandler<AuthorizedRequest> => {
  const jwtAuthMiddleware = makeJwtAuthMiddleware(...roles)

  return async (...params) => {
    // Attempt JWT auth first. On success, stop early.
    try {
      await jwtAuthMiddleware(...params)
      return
    } catch {
      // Continue to signature auth.
    }

    // Attempt signature auth.
    await signatureAuthMiddleware(...params)
  }
}

/**
 * Perform verification on a parsed request body. Throws error on failure.
 * Returns public key on success.
 */
export const verifyRequestBodyAndGetPublicKey = async (
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
    throw new KnownError(400, 'Invalid auth data.')
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
  // Signature is required if not using JWT.
  if (!signature) {
    throw new KnownError(401, 'Unauthorized. No signature or token provided.')
  }

  // Validate auth data is present.
  if (!data.auth) {
    throw new KnownError(401, 'Unauthorized. Invalid auth data.')
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
