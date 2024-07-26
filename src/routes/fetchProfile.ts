import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request, RouteHandler } from 'itty-router'

import {
  DbRowProfile,
  Env,
  FetchProfileResponse,
  FetchedProfile,
} from '../types'
import {
  INITIAL_NONCE,
  getOwnedNftWithImage,
  getProfileFromBech32Hash,
  getProfileFromPublicKey,
  getProfilePublicKeyPerChain,
  hexPublicKeyToBech32Address,
} from '../utils'

export const fetchProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: FetchProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    })

  // via public key
  let publicKey = request.params?.publicKey?.trim()
  // via bech32 hash
  let bech32Hash = request.params?.bech32Hash?.trim()
  // via bech32 address
  const bech32Address = request.params?.bech32Address?.trim()

  // Fetched profile response. Defaults to the empty profile.
  const profile: FetchedProfile = {
    uuid: '',
    nonce: INITIAL_NONCE,
    name: null,
    nft: null,
    chains: {},
  }

  let profileRow: DbRowProfile | null = null
  try {
    // If no public key nor bech32 hash is set, get bech32 hash from address.
    if (!publicKey && !bech32Hash && bech32Address) {
      bech32Hash = toHex(fromBech32(bech32Address).data)
    }

    if (publicKey) {
      profileRow = await getProfileFromPublicKey(env, publicKey)
    } else if (bech32Hash) {
      profileRow = await getProfileFromBech32Hash(env, bech32Hash)
    }
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // If profile found, load into fetched profile response.
  if (profileRow) {
    profile.uuid = profileRow.uuid
    profile.nonce = profileRow.nonce
    profile.name = profileRow.name?.trim() || null

    // Get chains.
    const accountPerChain = (
      await getProfilePublicKeyPerChain(env, profileRow.id)
    ).map(
      async ({ chainId, publicKey }) =>
        [
          chainId,
          {
            publicKey,
            // Convert public key to bech32 address for given chain.
            address: await hexPublicKeyToBech32Address(chainId, publicKey),
          },
        ] as const
    )

    profile.chains = Object.fromEntries(
      (await Promise.allSettled(accountPerChain)).flatMap((loadable) =>
        loadable.status === 'fulfilled' ? [loadable.value] : []
      )
    )

    // Verify selected NFT still belongs to the public key before responding
    // with it. On error, just ignore and return no NFT.
    if (
      profileRow.nftChainId &&
      profileRow.nftCollectionAddress &&
      profileRow.nftTokenId
    ) {
      try {
        // Get profile's public key for the NFT's chain, and then verify that
        // the NFT is owned by it.
        const publicKey = profile.chains[profileRow.nftChainId]?.publicKey
        if (publicKey) {
          profile.nft = await getOwnedNftWithImage(env, publicKey, {
            chainId: profileRow.nftChainId,
            collectionAddress: profileRow.nftCollectionAddress,
            tokenId: profileRow.nftTokenId,
          })
        }
      } catch (err) {
        console.error('Failed to get NFT image', err)
      }
    }
  }

  return respond(200, profile)
}
