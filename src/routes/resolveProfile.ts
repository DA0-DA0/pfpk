import { Request, RouteHandler } from 'itty-router'

import { Env, ResolveProfileResponse, ResolvedProfile } from '../types'
import {
  getChain,
  getOwnedNftWithImage,
  getPreferredProfilePublicKey,
  getProfileFromName,
} from '../utils'

export const resolveProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: ResolveProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  const chainId = request.params?.chainId?.trim()
  if (!chainId) {
    return respond(400, {
      error: 'Missing chainId.',
    })
  }

  const name = request.params?.name?.trim()
  if (!name) {
    return respond(400, {
      error: 'Missing name.',
    })
  }

  const chain = await getChain(chainId)
  if (!chain) {
    return respond(400, {
      error: 'Unknown chainId.',
    })
  }

  try {
    const profile = await getProfileFromName(env, name)
    const publicKey =
      profile && (await getPreferredProfilePublicKey(env, profile.id, chainId))

    if (!profile || !publicKey) {
      return respond(404, {
        error: 'Profile not found.',
      })
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

    return respond(200, {
      resolved: {
        uuid: profile.uuid,
        publicKey: publicKey.json,
        address,
        name: profile.name,
        nft,
      },
    })
  } catch (err) {
    console.error('Profile resolution', err)

    return respond(500, {
      error:
        'Failed to resolve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }
}
