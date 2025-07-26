import { RequestHandler } from 'itty-router'

import { getOwnedNftImageUrl } from '../chains'
import {
  AuthorizedRequest,
  ProfileUpdate,
  UpdateProfileRequest,
} from '../types'
import {
  KnownError,
  NotOwnerError,
  getPreferredProfilePublicKey,
  getProfileFromName,
  objectMatchesStructure,
  saveProfile,
} from '../utils'

const ALLOWED_NAME_CHARS = /^[a-zA-Z0-9._]+$/

export const updateProfile: RequestHandler<
  AuthorizedRequest<UpdateProfileRequest>
> = async (
  { validatedBody: { data: body }, publicKey, profile: existingProfile },
  env: Env
) => {
  try {
    // Validate profile exists.
    if (
      !objectMatchesStructure(body, {
        profile: {},
      })
    ) {
      throw new Error('Missing profile update object.')
    }

    // Only validate name if a string, since it can be set to null to clear it.
    if ('name' in body.profile && typeof body.profile.name === 'string') {
      body.profile.name = body.profile.name.trim()

      if (body.profile.name.length === 0) {
        throw new Error('Name cannot be empty.')
      }

      if (body.profile.name.length > 32) {
        throw new Error('Name cannot be longer than 32 characters.')
      }

      if (!ALLOWED_NAME_CHARS.test(body.profile.name)) {
        throw new Error(
          'Name can only contain alphanumeric characters, periods, and underscores.'
        )
      }
    }

    // Only validate NFT properties if present, since it can be set to null to
    // clear it.
    if (
      'nft' in body.profile &&
      body.profile.nft &&
      !objectMatchesStructure(body.profile.nft, {
        chainId: {},
        collectionAddress: {},
        tokenId: {},
      })
    ) {
      throw new Error(
        'Invalid NFT update object. Must have `chainId`, `collectionAddress`, and `tokenId`.'
      )
    }
  } catch (err) {
    throw new KnownError(400, err instanceof Error ? err.message : `${err}`)
  }

  // Validate name and NFT partial updates.
  const { name, nft } = body.profile

  // If setting name, verify unique.
  if (typeof name === 'string') {
    try {
      const namedProfile = await getProfileFromName(env, name)
      // Only error if profile that is not the existing profile has the name.
      if (namedProfile && namedProfile.id !== existingProfile.id) {
        throw new KnownError(400, 'Name already taken.')
      }
    } catch (err) {
      if (err instanceof KnownError) {
        throw err
      }

      console.error('Name uniqueness retrieval', err)
      throw new KnownError(500, 'Failed to check name uniqueness', err)
    }
  }

  // If setting NFT, verify it belongs to the profile's public key.
  if (nft) {
    try {
      // Get public key for the NFT's chain, falling back to the current public
      // key if it's for the same chain.
      const chainPublicKey =
        (await getPreferredProfilePublicKey(
          env,
          existingProfile.id,
          nft.chainId
        )) || publicKey
      if (!chainPublicKey) {
        throw new KnownError(
          405,
          "No public key is associated with the NFT's chain or provided in the request."
        )
      }

      // Will throw error on ownership or image access error.
      const imageUrl = await getOwnedNftImageUrl(
        nft.chainId,
        env,
        chainPublicKey,
        nft.collectionAddress,
        nft.tokenId
      )

      // If image is empty, cannot be used as profile picture.
      if (!imageUrl) {
        throw new KnownError(415, 'Failed to retrieve image from NFT.')
      }
    } catch (err) {
      if (err instanceof KnownError) {
        throw err
      }

      if (err instanceof NotOwnerError) {
        throw new KnownError(401, 'You do not own this NFT.')
      }

      throw new KnownError(500, 'Unexpected ownership verification error', err)
    }
  }

  // Update fields with partial updates if available. Both are nullable, so
  // allow setting to null or new value.
  const profileUpdate: ProfileUpdate = {
    ...(name !== undefined && { name }),
    ...(nft !== undefined && {
      // Explicitly copy over values to prevent the user from setting whatever
      // values they want in this object.
      nft: nft && {
        chainId: nft.chainId,
        collectionAddress: nft.collectionAddress,
        tokenId: nft.tokenId,
      },
    }),
  }

  // Save.
  try {
    await saveProfile(env, profileUpdate, {
      uuid: existingProfile.uuid,
      // If no chains passed, use the current chain used to sign, if any.
      chainIds:
        body.chainIds || (body.auth?.chainId ? [body.auth.chainId] : undefined),
    })
  } catch (err) {
    if (err instanceof KnownError) {
      throw err
    }

    console.error('Profile save', err)
    throw new KnownError(500, 'Failed to save profile', err)
  }

  return new Response(null, { status: 204 })
}
