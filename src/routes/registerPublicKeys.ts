import {
  AuthorizedRequest,
  Env,
  ProfileWithId,
  RegisterPublicKeyRequest,
  RegisterPublicKeyResponse,
} from '../types'
import {
  KnownError,
  addProfilePublicKey,
  getProfileFromPublicKey,
  incrementProfileNonce,
} from '../utils'
import { verifyRequestBody } from '../utils/auth'

export const registerPublicKeys = async (
  request: AuthorizedRequest<RegisterPublicKeyRequest>,
  env: Env
) => {
  const respond = (status: number, response: RegisterPublicKeyResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  const {
    auth: { publicKey },
    publicKeys,
  } = request.parsedBody.data

  // Validate all keys inside.
  try {
    await Promise.all(publicKeys.map((key) => verifyRequestBody(key)))
  } catch (err) {
    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson)
    }

    return respond(400, {
      error:
        'Failed to validate public keys: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Validate all keys inside are different from each other.
  const keySet = new Set(publicKeys.map((key) => key.data.auth.publicKey))
  if (keySet.size !== publicKeys.length) {
    return respond(400, {
      error: 'Keys must be unique.',
    })
  }

  // Validate all keys inside allowed this public key to register them.
  if (publicKeys.some((key) => key.data.allow !== publicKey)) {
    return respond(401, {
      error: `Invalid allowed public key. Expected: ${publicKey}`,
    })
  }

  // Get existing profile.
  let profile: ProfileWithId | undefined
  try {
    profile = await getProfileFromPublicKey(env, publicKey)
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  if (!profile) {
    return respond(404, {
      error: 'Profile not found.',
    })
  }

  // Validate all nonces to prevent replay attacks.
  if (
    request.parsedBody.data.auth.nonce !== profile.nonce ||
    publicKeys.some((key) => key.data.auth.nonce !== profile!.nonce)
  ) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${profile.nonce}`,
    })
  }

  // Increment nonce to prevent replay attacks.
  try {
    await incrementProfileNonce(env, profile.id)
  } catch (err) {
    console.error('Profile nonce increment', err)

    return respond(500, {
      error:
        'Failed to increment profile nonce: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Add public keys to profile.
  try {
    await Promise.all(
      publicKeys.map((key) =>
        addProfilePublicKey(
          env,
          profile!.id,
          key.data.auth.publicKey,
          // If no chains passed, default to the chain used to sign.
          key.data.chainIds || [key.data.auth.chainId]
        )
      )
    )
  } catch (err) {
    console.error('Profile public key add', err)

    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson)
    }

    return respond(500, {
      error:
        'Failed to add profile public keys: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  return respond(200, { success: true })
}
