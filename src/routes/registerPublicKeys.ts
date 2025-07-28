import { RequestHandler } from 'itty-router'

import { PublicKeyBase, makePublicKey } from '../publicKeys'
import { AuthorizedRequest, RegisterPublicKeysRequest } from '../types'
import { KnownError, addProfilePublicKey, getProfilePublicKeys } from '../utils'
import { verifyRequestBodyAndGetPublicKey } from '../utils/auth'

export const registerPublicKeys: RequestHandler<
  AuthorizedRequest<RegisterPublicKeysRequest>
> = async (
  {
    validatedBody: {
      data: { publicKeys: toRegister },
    },
    profile,
  },
  env: Env
) => {
  // Get all public keys in the profile.
  const profilePublicKeys = await getProfilePublicKeys(env, profile.id)

  // Only validate public keys that do not already exist in the profile.
  const toValidate = toRegister.filter(
    (newKey) =>
      !profilePublicKeys.some(
        ({ publicKey }) =>
          newKey.data.auth &&
          PublicKeyBase.equal(publicKey, newKey.data.auth.publicKey)
      )
  )

  try {
    await Promise.all(
      toValidate.map((key) => verifyRequestBodyAndGetPublicKey(key))
    )
  } catch (err) {
    if (err instanceof KnownError) {
      throw err
    }

    throw new KnownError(500, 'Failed to validate public keys', err)
  }

  // Validate that all public keys being registered allow this profile to
  // register them.
  if (
    !toValidate.every((newKey) =>
      'uuid' in newKey.data.allow
        ? newKey.data.allow.uuid === profile.uuid
        : profilePublicKeys.some(
            ({ publicKey }) =>
              'publicKey' in newKey.data.allow &&
              PublicKeyBase.equal(publicKey, newKey.data.allow.publicKey)
          )
    )
  ) {
    throw new KnownError(
      401,
      'Unauthorized',
      `Invalid allowed profile, expected UUID: ${profile.uuid}.`
    )
  }

  // Validate all nonces match the profile to prevent replay attacks.
  if (toValidate.some((newKey) => newKey.data.auth.nonce !== profile.nonce)) {
    throw new KnownError(
      401,
      'Unauthorized',
      `Invalid nonce, expected: ${profile.nonce}.`
    )
  }

  // Combine chain ID lists for same public keys
  const publicKeysToAdd = Object.entries(
    toRegister.reduce(
      (acc, { data }) => {
        const key = `${data.auth.publicKey.type}:${data.auth.publicKey.hex}`
        const existing = acc[key] || new Set<string>()

        // If no chains passed, default to the chain used to sign.
        ;(data.chainIds || [data.auth.chainId]).forEach((chainId) => {
          if (!existing.has(chainId)) {
            existing.add(chainId)
          }
        })

        acc[key] = existing
        return acc
      },
      {} as Record<string, Set<string>>
    )
  )

  // Add public keys to profile.
  try {
    await Promise.all(
      publicKeysToAdd.map(([publicKey, chainIds]) => {
        const [type, publicKeyHex] = publicKey.split(':')

        return addProfilePublicKey(
          env,
          profile.id,
          makePublicKey(type, publicKeyHex),
          Array.from(chainIds)
        )
      })
    )
  } catch (err) {
    if (err instanceof KnownError) {
      throw err
    }

    console.error('Profile public key registration', profile.uuid, err)
    throw new KnownError(500, 'Failed to register profile public keys', err)
  }

  return new Response(null, { status: 204 })
}
