import {
  AuthorizedRequest,
  DbRowProfile,
  Env,
  RegisterPublicKeyRequest,
  RegisterPublicKeyResponse,
} from '../types'
import {
  INITIAL_NONCE,
  KnownError,
  addProfilePublicKey,
  getProfileFromPublicKey,
  incrementProfileNonce,
  saveProfile,
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

  // Validate all keys inside that are not the same as the public key performing
  // the registration (since it already belongs to the profile, and its
  // signature wrapping the entire message was validated in middleware).
  try {
    await Promise.all(
      publicKeys
        .filter((key) => key.data.auth.publicKey !== publicKey)
        .map((key) => verifyRequestBody(key))
    )
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

  // Validate all keys inside allowed this public key to register them.
  if (publicKeys.some((key) => key.data.allow !== publicKey)) {
    return respond(401, {
      error: `Invalid allowed public key. Expected: ${publicKey}`,
    })
  }

  // Find or create profile.
  let profile: DbRowProfile
  try {
    let _profile: DbRowProfile | null = await getProfileFromPublicKey(
      env,
      publicKey
    )

    // If no profile exists, create one.
    if (!_profile) {
      _profile = await saveProfile(
        env,
        publicKey,
        {
          nonce: INITIAL_NONCE,
          name: null,
          nft: null,
        },
        // Create with the current chain preference.
        [request.parsedBody.data.auth.chainId]
      )
    }

    profile = _profile
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
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

  // Combine chain ID lists for same public keys
  const publicKeysToAdd = Object.entries(
    publicKeys.reduce(
      (acc, { data }) => {
        const existing = acc[data.auth.publicKey] || new Set<string>()

        // If no chains passed, default to the chain used to sign.
        ;(data.chainIds || [data.auth.chainId]).forEach((chainId) => {
          if (!existing.has(chainId)) {
            existing.add(chainId)
          }
        })

        acc[data.auth.publicKey] = existing
        return acc
      },
      {} as Record<string, Set<string>>
    )
  )

  // Add public keys to profile.
  try {
    await Promise.all(
      publicKeysToAdd.map(([publicKey, chainIds]) =>
        addProfilePublicKey(env, profile!.id, publicKey, Array.from(chainIds))
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
