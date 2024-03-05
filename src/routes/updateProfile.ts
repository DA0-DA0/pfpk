import { getOwnedNftImageUrl } from '../chains'
import {
  AuthorizedRequest,
  Env,
  UpdateProfile,
  UpdateProfileRequest,
  UpdateProfileResponse,
} from '../types'
import {
  KnownError,
  NotOwnerError,
  getPreferredProfilePublicKey,
  getProfileFromName,
  getProfileFromPublicKey,
  saveProfile,
} from '../utils'

const ALLOWED_NAME_CHARS = /^[a-zA-Z0-9._]+$/

export const updateProfile = async (
  request: AuthorizedRequest<UpdateProfileRequest>,
  env: Env
) => {
  const respond = (status: number, response: UpdateProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  const {
    auth: { publicKey },
    ...requestBody
  } = request.parsedBody.data
  try {
    // Validate body.
    if (!requestBody) {
      throw new Error('Missing.')
    }
    if (!('profile' in requestBody) || !requestBody.profile) {
      throw new Error('Missing profile.')
    }
    if (
      !('nonce' in requestBody.profile) ||
      typeof requestBody.profile.nonce !== 'number'
    ) {
      throw new Error('Missing profile.nonce.')
    }
    // Only validate name if truthy, since it can be set to null to clear it.
    if (
      'name' in requestBody.profile &&
      typeof requestBody.profile.name === 'string'
    ) {
      requestBody.profile.name = requestBody.profile.name.trim()

      if (requestBody.profile.name.length === 0) {
        throw new Error('Name cannot be empty.')
      }

      if (requestBody.profile.name.length > 32) {
        throw new Error('Name cannot be longer than 32 characters.')
      }

      if (!ALLOWED_NAME_CHARS.test(requestBody.profile.name)) {
        throw new Error(
          'Name can only contain alphanumeric characters, periods, and underscores.'
        )
      }
    }
    // Only validate NFT properties if truthy, since it can be set to null to
    // clear it.
    if (
      'nft' in requestBody.profile &&
      requestBody.profile.nft &&
      (!('chainId' in requestBody.profile.nft) ||
        !requestBody.profile.nft.chainId ||
        !('collectionAddress' in requestBody.profile.nft) ||
        !requestBody.profile.nft.collectionAddress ||
        !('tokenId' in requestBody.profile.nft) ||
        // tokenId could be an empty string, so only perform a typecheck here.
        typeof requestBody.profile.nft.tokenId !== 'string')
    ) {
      throw new Error('NFT needs chainId, collectionAddress, and tokenId.')
    }
  } catch (err) {
    console.error('Parsing request body', err)

    return respond(400, {
      error: err instanceof Error ? err.message : `${err}`,
    })
  }

  // Get existing profile. Initialize with defaults in case no profile found.
  let existingProfileId: number | undefined
  let profile: UpdateProfile = {
    nonce: 0,
    name: null,
    nft: null,
  }

  try {
    const profileRow = await getProfileFromPublicKey(env, publicKey)
    if (profileRow) {
      existingProfileId = profileRow.id
      profile = {
        nonce: profileRow.nonce,
        name: profileRow.name,
        nft:
          profileRow.nftChainId &&
          profileRow.nftCollectionAddress &&
          profileRow.nftTokenId
            ? {
                chainId: profileRow.nftChainId,
                collectionAddress: profileRow.nftCollectionAddress,
                tokenId: profileRow.nftTokenId,
              }
            : null,
      }
    }
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve existing profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Validate nonce to prevent replay attacks.
  if (requestBody.profile.nonce !== profile.nonce) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${profile.nonce}`,
    })
  }

  // Validate name and NFT partial updates.
  const { name, nft } = requestBody.profile

  // If setting name, verify unique.
  if (typeof name === 'string') {
    try {
      const namedProfile = await getProfileFromName(env, name)
      // Only error if profile that is not the existing profile has the name.
      if (namedProfile && namedProfile.id !== existingProfileId) {
        return respond(400, {
          error: 'Name already taken.',
        })
      }
    } catch (err) {
      console.error('Name uniqueness retrieval', err)

      return respond(500, {
        error:
          'Failed to check name uniqueness: ' +
          (err instanceof Error ? err.message : `${err}`),
      })
    }
  }

  // If setting NFT, verify it belongs to the profile's public key.
  if (nft) {
    try {
      // If profile exists, get public key for the NFT's chain, falling back to
      // the current public key in case no public key has been added for that
      // chain..
      const chainPublicKey = existingProfileId
        ? (
            await getPreferredProfilePublicKey(
              env,
              existingProfileId,
              nft.chainId
            )
          )?.publicKey || publicKey
        : // If profile doesn't exist yet, but the NFT is on a chain being registered for this public key right now, use the current public key. `getPreferredProfilePublicKey` will fail if no profile exists, but the profile is about to exist.
          (
              request.parsedBody.data.chainIds
                ? request.parsedBody.data.chainIds.includes(nft.chainId)
                : request.parsedBody.data.auth.chainId === nft.chainId
            )
          ? publicKey
          : undefined
      if (!chainPublicKey) {
        throw new KnownError(
          405,
          "No public key is associated with the NFT's chain."
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
      if (err instanceof NotOwnerError) {
        return respond(401, {
          error: 'You do not own this NFT.',
        })
      }

      // If already handled, respond with specific error.
      if (err instanceof KnownError) {
        return respond(err.statusCode, err.responseJson)
      }

      return respond(500, {
        error:
          'Unexpected ownership verification error: ' +
          (err instanceof Error ? err.message : `${err}`),
      })
    }
  }

  // Update fields with partial updates if available. Both are nullable, so
  // allow setting to null or new value.

  if (name !== undefined) {
    profile.name = name
  }
  if (nft !== undefined) {
    // Explicitly copy over values to prevent the user from setting whatever
    // values they want in this object.
    profile.nft = nft && {
      chainId: nft.chainId,
      collectionAddress: nft.collectionAddress,
      tokenId: nft.tokenId,
    }
  }

  // Increment nonce to prevent replay attacks.
  profile.nonce++

  // Save.
  try {
    await saveProfile(
      env,
      publicKey,
      profile,
      // If no chains passed, default to the current chain used to sign.
      request.parsedBody.data.chainIds || [request.parsedBody.data.auth.chainId]
    )
  } catch (err) {
    console.error('Profile save', err)

    return respond(500, {
      error:
        'Failed to save profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  return respond(200, { success: true })
}
