import { RequestHandler } from 'itty-router'

import { ResolveProfileResponse, ResolvedProfile } from '../types'
import {
  KnownError,
  getChain,
  getOwnedNftWithImage,
  getPreferredProfilePublicKey,
  getProfileFromName,
} from '../utils'

export const resolveProfile: RequestHandler = async (
  request,
  env: Env
): Promise<ResolveProfileResponse> => {
  const chainId = request.params?.chainId?.trim()
  if (!chainId) {
    throw new KnownError(400, 'Missing chainId.')
  }

  const name = request.params?.name?.trim()
  if (!name) {
    throw new KnownError(400, 'Missing name.')
  }

  const chain = await getChain(chainId)
  if (!chain) {
    throw new KnownError(400, 'Unknown chainId.')
  }

  try {
    const profile = await getProfileFromName(env, name)
    const publicKey =
      profile && (await getPreferredProfilePublicKey(env, profile.id, chainId))

    if (!profile || !publicKey) {
      throw new KnownError(404, 'Profile not found.')
    }

    const address = await publicKey.getBech32Address(chain.bech32_prefix)

    let nft: ResolvedProfile['nft'] = null
    if (
      profile.nftChainId &&
      profile.nftCollectionAddress &&
      profile.nftTokenId
    ) {
      try {
        // Get profile's public key for the NFT's chain, falling back to the
        // current public key in case no public key has been added for that
        // chain.
        const nftPublicKey =
          (await getPreferredProfilePublicKey(
            env,
            profile.id,
            profile.nftChainId
          )) || publicKey

        nft = await getOwnedNftWithImage(env, nftPublicKey, {
          chainId: profile.nftChainId,
          collectionAddress: profile.nftCollectionAddress,
          tokenId: profile.nftTokenId,
        })
      } catch (err) {
        console.error('Profile resolution NFT retrieval', err)
      }
    }

    return {
      resolved: {
        uuid: profile.uuid,
        publicKey: publicKey.json,
        address,
        name: profile.name,
        nft,
      },
    }
  } catch (err) {
    console.error('Profile resolution', err)
    throw new KnownError(500, 'Failed to resolve profile', err)
  }
}
