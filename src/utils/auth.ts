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
import { makePublicKey } from '../publicKeys'
import { AuthorizedRequest, PublicKey, RequestBody } from '../types'

export const INITIAL_NONCE = 0

/**
 * Middleware to protect routes via JWT token authorization. If it does not
 * throw an error, the request is authorized. If successful, the `validatedBody`
 * field will be set on the request object, accessible by successive middleware
 * and route handlers.
 *
 * @param request - The request to authenticate.
 */
export const jwtAuthMiddleware: RequestHandler<AuthorizedRequest> = async (
  request,
  env: Env
) => {
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

  const { sub: uuid, jti: tokenId } = await verifyJwt(env, token)
  const profile = await getProfileFromUuid(env, uuid)
  if (!profile) {
    throw new KnownError(404, 'Profile not found.')
  }

  // Validate token exists and is still valid for profile.
  const dbToken = await getTokenForProfile(env, profile.id, tokenId)
  // If token not found in DB, it must have been invalidated. Expiration was
  // checked in verifyJwt above, so we should only get here if the token is
  // valid but was manually invalidated.
  if (!dbToken) {
    throw new KnownError(401, 'Unauthorized', 'Token invalidated.')
  }
  // Should never happen since JWT verification above also checks expiration.
  if (dbToken.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new KnownError(401, 'Unauthorized', 'Token expired.')
  }

  const body: RequestBody = request.body
    ? await request.json<RequestBody>().catch(() => {
        throw new KnownError(400, 'Invalid request body.')
      })
    : // If no body, use empty object for data and no signature.
      {
        data: {},
      }

  // If auth is provided, validate that it matches the profile. If it does not
  // match, strip it since it is untrusted.
  if (body.data.auth) {
    const profileForPublicKey = await getProfileFromPublicKeyHex(
      env,
      body.data.auth.publicKeyHex
    )

    if (profileForPublicKey?.id === profile.id) {
      // If auth matches the profile, validate public key and add to request.
      request.publicKey = makePublicKey(
        body.data.auth.publicKeyType,
        body.data.auth.publicKeyHex
      )
    } else {
      // If public key auth does not match the profile, error.
      throw new KnownError(
        401,
        'Unauthorized',
        'Mismatched token and public key auth.'
      )
    }
  }

  // If all is valid, add validated body and profile to request.
  request.validatedBody = body
  request.profile = profile
}

/**
 * Middleware to protect routes via wallet signature authorization. If it does
 * not throw an error, the request is authorized. If successful, the
 * `validatedBody` field will be set on the request object, accessible by
 * successive middleware and route handlers.
 *
 * Creates a new profile for the public key if one does not exist.
 *
 * @param request - The request to authenticate.
 */
export const signatureAuthMiddleware: RequestHandler<
  AuthorizedRequest
> = async (request, env: Env) => {
  const body = await request.json<RequestBody>?.().catch(() => {
    throw new KnownError(400, 'Invalid request body.')
  })

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

    request.profile = await saveProfile(
      env,
      {
        // Increment nonce to prevent replay attacks.
        nonce: INITIAL_NONCE + 1,
      },
      {
        publicKey: request.publicKey,
        // Create with the current chain preference.
        chainIds: [body.data.auth.chainId],
      }
    )
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

    request.profile = await saveProfile(
      env,
      {
        // Increment nonce to prevent replay attacks.
        nonce: existingProfile.nonce + 1,
      },
      {
        publicKey: request.publicKey,
      }
    )
  }

  // Decrement nonce to match for the request handler.
  request.profile.nonce--

  // If all is valid, add validated body to request.
  request.validatedBody = body
}

/**
 * Middleware to protect routes via JWT token or wallet signature authorization.
 * If it does not throw an error, the request is authorized. If successful, the
 * `validatedBody` field will be set on the request object, accessible by
 * successive middleware and route handlers.
 *
 * @param request - The request to authenticate.
 */
export const jwtOrSignatureAuthMiddleware: RequestHandler<
  AuthorizedRequest
> = async (...params) => {
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
          type: {},
          nonce: {},
          chainId: {},
          chainFeeDenom: {},
          chainBech32Prefix: {},
          publicKeyType: {},
          publicKeyHex: {},
          timestamp: {},
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
  const publicKey = makePublicKey(
    body.data.auth.publicKeyType,
    body.data.auth.publicKeyHex
  )

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
