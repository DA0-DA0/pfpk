import { Request, RouteHandler } from 'itty-router'

import { Env, ResolvedProfile, SearchProfilesResponse } from '../types'
import {
  bech32HashToAddress,
  getChain,
  getOwnedNftWithImage,
  getPreferredProfilePublicKey,
  getProfilesWithNamePrefix,
} from '../utils'

export const searchProfiles: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: SearchProfilesResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  const chainId = request.params?.chainId?.trim()
  if (!chainId) {
    return respond(400, {
      error: 'Missing chainId.',
    })
  }

  const namePrefix = request.params?.namePrefix?.trim()
  if (!namePrefix) {
    return respond(400, {
      error: 'Missing namePrefix.',
    })
  }
  if (namePrefix.length < 3) {
    return respond(400, {
      error: 'Name prefix must be at least 3 characters.',
    })
  }

  const chain = await getChain(chainId)
  if (!chain) {
    return respond(400, {
      error: 'Unknown chainId.',
    })
  }

  try {
    const potentialProfiles = await getProfilesWithNamePrefix(
      env,
      namePrefix,
      chainId
    )

    const profiles = (
      await Promise.all(
        potentialProfiles.map(
          async ({
            id,
            uuid,
            publicKey,
            bech32Hash,
            name,
            nftChainId,
            nftCollectionAddress,
            nftTokenId,
          }): Promise<ResolvedProfile> => {
            let nft: ResolvedProfile['nft'] = null
            if (nftChainId && nftCollectionAddress && nftTokenId) {
              try {
                // Get profile's public key for the NFT's chain, falling back to
                // the current public key in case no public key has been added
                // for that chain.
                const nftPublicKey =
                  (await getPreferredProfilePublicKey(env, id, nftChainId))
                    ?.publicKey || publicKey

                nft = await getOwnedNftWithImage(env, nftPublicKey, {
                  chainId: nftChainId,
                  collectionAddress: nftCollectionAddress,
                  tokenId: nftTokenId,
                })
              } catch (err) {
                console.error('Profile search NFT retrieval', err)
              }
            }

            return {
              uuid,
              publicKey,
              address: bech32HashToAddress(bech32Hash, chain.bech32_prefix),
              name,
              nft,
            }
          }
        )
      )
    ).filter((profile): profile is ResolvedProfile => !!profile)

    return respond(200, {
      profiles,
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
