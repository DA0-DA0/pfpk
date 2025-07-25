import { RequestHandler } from 'itty-router'

import { PublicKeyBase, makePublicKeyFromJson } from '../publicKeys'
import {
  AuthorizedRequest,
  Env,
  UnregisterPublicKeyRequest,
  UnregisterPublicKeyResponse,
} from '../types'
import {
  KnownError,
  getProfilePublicKeys,
  removeProfilePublicKeys,
} from '../utils'

export const unregisterPublicKeys: RequestHandler<
  AuthorizedRequest<UnregisterPublicKeyRequest>
> = async (
  {
    validatedBody: {
      data: { publicKeys: toUnregister },
    },
    profile,
  },
  env: Env
): Promise<UnregisterPublicKeyResponse> => {
  const publicKeys = toUnregister.map((json) => makePublicKeyFromJson(json))

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
    throw new KnownError(
      401,
      'Not all public keys are attached to this profile.'
    )
  }

  // Remove public keys from profile.
  try {
    await removeProfilePublicKeys(env, profile.id, publicKeys)
  } catch (err) {
    if (err instanceof KnownError) {
      throw err
    }

    console.error('Profile public key unregistration', profile.uuid, err)
    throw new KnownError(500, 'Failed to unregister profile public keys', err)
  }

  return { success: true }
}
