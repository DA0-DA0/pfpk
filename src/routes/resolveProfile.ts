import { Request, RouteHandler } from 'itty-router'

import {
  Env,
  ProfileSearchHit,
  ProfileWithId,
  ResolveProfileResponse,
} from '../types'
import {
  bech32HashToAddress,
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
    let resolved: ProfileSearchHit | null = null

    const profile = await getProfileFromName(env, name)
    const publicKeyRow =
      profile && (await getPreferredProfilePublicKey(env, profile.id, chainId))

    let nft = null
    if (profile?.nft) {
      try {
        // Get profile's public key for the NFT's chain, falling back to the
        // current public key in case no public key has been added for that
        // chain.
        const nftPublicKeyRow =
          (await getPreferredProfilePublicKey(
            env,
            profile.id,
            profile.nft.chainId
          )) || publicKeyRow

        nft = nftPublicKeyRow
          ? await getOwnedNftWithImage(
              env,
              nftPublicKeyRow.publicKey,
              profile.nft
            )
          : null
      } catch (err) {
        console.error('Profile resolution NFT retrieval', err)
      }
    }

    if (profile && publicKeyRow) {
      const profileWithoutNonce: Omit<ProfileWithId, 'id' | 'nonce'> &
        Pick<Partial<ProfileWithId>, 'id' | 'nonce'> = {
        ...profile,
      }
      delete profileWithoutNonce.id
      delete profileWithoutNonce.nonce

      resolved = {
        publicKey: publicKeyRow.publicKey,
        address: bech32HashToAddress(
          publicKeyRow.bech32Hash,
          chain.bech32_prefix
        ),
        profile: {
          ...profileWithoutNonce,
          nft,
        },
      }
    }

    return respond(200, {
      resolved,
    })
  } catch (err) {
    console.error('Profile retrieval for search', err)

    return respond(500, {
      error:
        'Failed to retrieve profile for search: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }
}
