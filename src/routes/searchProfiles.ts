import { Request, RouteHandler } from 'itty-router'

import {
  Env,
  Profile,
  ProfileSearchHit,
  SearchProfilesResponse,
} from '../types'
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
          async ({ publicKey, bech32Hash, profileId, profile }) => {
            let nft = null
            if (profile.nft) {
              try {
                // Get profile's public key for the NFT's chain.
                const publicKeyRow =
                  profile &&
                  (await getPreferredProfilePublicKey(
                    env,
                    profileId,
                    profile.nft.chainId
                  ))

                nft = publicKeyRow
                  ? await getOwnedNftWithImage(
                      env,
                      publicKeyRow.publicKey,
                      profile.nft
                    )
                  : null
              } catch (err) {
                console.error('Profile search NFT retrieval', err)
              }
            }

            if (profile && publicKey) {
              const profileWithoutNonce: Omit<Profile, 'nonce'> &
                Pick<Partial<Profile>, 'nonce'> = {
                ...profile,
              }
              delete profileWithoutNonce.nonce

              return {
                publicKey,
                address: bech32HashToAddress(bech32Hash, chain.bech32_prefix),
                profile: {
                  ...profileWithoutNonce,
                  nft,
                },
              }
            }
          }
        )
      )
    ).filter((hit): hit is ProfileSearchHit => !!hit)

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
