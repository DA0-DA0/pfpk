import { PublicKeyBase, makePublicKeyFromJson } from '../publicKeys'
import {
  AuthorizedRequest,
  DbRowProfile,
  Env,
  UnregisterPublicKeyRequest,
  UnregisterPublicKeyResponse,
} from '../types'
import {
  KnownError,
  getProfileFromPublicKeyHex,
  getProfilePublicKeys,
  incrementProfileNonce,
  removeProfilePublicKeys,
} from '../utils'

export const unregisterPublicKeys = async (
  {
    parsedBody: {
      data: { auth, publicKeys: publicKeyJsons },
    },
    publicKey,
  }: AuthorizedRequest<UnregisterPublicKeyRequest>,
  env: Env
) => {
  const respond = (status: number, response: UnregisterPublicKeyResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  // Get existing profile.
  let profile: DbRowProfile | null
  try {
    profile = await getProfileFromPublicKeyHex(env, publicKey.hex)
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

  const publicKeys = publicKeyJsons.map((json) => makePublicKeyFromJson(json))

  // Validate that all public keys are attached to this profile.
  const profilePublicKeys = await getProfilePublicKeys(env, profile.id)
  if (
    publicKeys.some(
      (key) =>
        !profilePublicKeys.some(({ publicKey }) =>
          PublicKeyBase.publicKeysEqual(publicKey, key)
        )
    )
  ) {
    return respond(401, {
      error: 'Not all public keys are attached to this profile.',
    })
  }

  // Validate nonce to prevent replay attacks.
  if (auth.nonce !== profile.nonce) {
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

  // Remove public keys from profile.
  try {
    await removeProfilePublicKeys(env, profile.id, publicKeys)
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
