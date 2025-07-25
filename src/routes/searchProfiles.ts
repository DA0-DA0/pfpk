import { RequestHandler } from 'itty-router'

import { makePublicKey } from '../publicKeys'
import { ResolvedProfile, SearchProfilesResponse } from '../types'
import {
  KnownError,
  getChain,
  getOwnedNftWithImage,
  getPreferredProfilePublicKey,
  getProfilesWithNamePrefix,
} from '../utils'

export const searchProfiles: RequestHandler = async (
  request,
  env: Env
): Promise<SearchProfilesResponse> => {
  const chainId = request.params?.chainId?.trim()
  if (!chainId) {
    throw new KnownError(400, 'Missing chainId.')
  }

  const namePrefix = request.params?.namePrefix?.trim()
  if (!namePrefix) {
    throw new KnownError(400, 'Missing namePrefix.')
  }
  if (namePrefix.length < 3) {
    throw new KnownError(400, 'Name prefix must be at least 3 characters.')
  }

  const chain = await getChain(chainId)
  if (!chain) {
    throw new KnownError(400, 'Unknown chainId.')
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
            type,
            publicKeyHex,
            name,
            nftChainId,
            nftCollectionAddress,
            nftTokenId,
          }): Promise<ResolvedProfile> => {
            const publicKey = makePublicKey(type, publicKeyHex)
            const address = await publicKey.getBech32Address(
              chain.bech32_prefix
            )

            let nft: ResolvedProfile['nft'] = null
            if (nftChainId && nftCollectionAddress && nftTokenId) {
              try {
                // Get profile's public key for the NFT's chain, falling back to
                // the current public key in case no public key has been added
                // for that chain.
                const nftPublicKey =
                  (await getPreferredProfilePublicKey(env, id, nftChainId)) ||
                  publicKey

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
              publicKey: publicKey.json,
              address,
              name,
              nft,
            }
          }
        )
      )
    ).filter((profile): profile is ResolvedProfile => !!profile)

    return {
      profiles,
    }
  } catch (err) {
    console.error('Profile retrieval for search', err)
    throw new KnownError(500, 'Failed to retrieve profile for search', err)
  }
}
