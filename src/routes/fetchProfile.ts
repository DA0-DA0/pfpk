import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request, RouteHandler } from 'itty-router'

import { Env, FetchProfileResponse, ProfileWithId } from '../types'
import {
  EMPTY_PROFILE,
  getOwnedNftWithImage,
  getPreferredProfilePublicKey,
  getProfileFromBech32Hash,
  getProfileFromPublicKey,
  getProfilePublicKeyPerChain,
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

  let profile: ProfileWithId
  try {
    // If no public key nor bech32 hash is set, get bech32 hash from address.
    if (!publicKey && !bech32Hash && bech32Address) {
      bech32Hash = toHex(fromBech32(bech32Address).data)
    }

    let _profile: ProfileWithId | undefined
    if (publicKey) {
      _profile = await getProfileFromPublicKey(env, publicKey)
    } else if (bech32Hash) {
      _profile = await getProfileFromBech32Hash(env, bech32Hash)
    } else {
      return respond(400, {
        error: 'Failed to resolve public key or bech32 hash.',
      })
    }

    if (!_profile) {
      return respond(200, EMPTY_PROFILE)
    }

    profile = _profile
  } catch (err) {
    console.error('Profile retrieval', err)

    return respond(500, {
      error:
        'Failed to retrieve profile: ' +
        (err instanceof Error ? err.message : `${err}`),
    })
  }

  // Response object for mutating with NFT if present.
  const response: FetchProfileResponse = {
    nonce: profile.nonce,
    name: profile.name?.trim() || null,
    nft: null,
  }

  // Get NFT from stored profile data.
  const { nft } = profile
  // If no NFT, respond with name potentially set.
  if (!nft) {
    return respond(200, response)
  }

  // Verify selected NFT still belongs to the public key before responding with
  // it. On error, just ignore it and return no NFT.
  try {
    // Get profile's public key for the NFT's chain.
    const publicKey = (
      await getPreferredProfilePublicKey(env, profile.id, nft.chainId)
    )?.publicKey
    if (publicKey) {
      response.nft = await getOwnedNftWithImage(env, publicKey, nft)
    }
  } catch (err) {
    console.error('Failed to get NFT image', err)
  }

  // Add chains.
  try {
    response.chains = Object.fromEntries(
      (await getProfilePublicKeyPerChain(env, profile.id)).map(
        ({ chainId, publicKey }) => [chainId, publicKey]
      )
    )
  } catch (err) {
    console.error('Failed to get profile chains', err)
  }

  return respond(200, response)
}
