import { fromBech32, toHex } from '@cosmjs/encoding'
import { RequestHandler } from 'itty-router'

import { DbRowProfile, FetchProfileResponse } from '../types'
import {
  INITIAL_NONCE,
  KnownError,
  getFetchedProfileJsonForProfile,
  getProfileFromAddressHex,
  getProfileFromPublicKeyHex,
} from '../utils'

export const fetchProfile: RequestHandler = async (
  request,
  env: Env
): Promise<FetchProfileResponse> => {
  // via public key
  let publicKey = request.params?.publicKey?.trim()
  // via address hex
  let addressHex = request.params?.addressHex?.trim()
  // via bech32 address
  const bech32Address = request.params?.bech32Address?.trim()

  let profileRow: DbRowProfile | null = null
  try {
    // If no public key nor address hex is set, get address hex from bech32
    // address.
    if (!publicKey && !addressHex && bech32Address) {
      addressHex = toHex(fromBech32(bech32Address).data)
    }

    if (publicKey) {
      profileRow = await getProfileFromPublicKeyHex(env, publicKey)
    } else if (addressHex) {
      profileRow = await getProfileFromAddressHex(env, addressHex)
    }
  } catch (err) {
    console.error('Profile retrieval', err)

    throw new KnownError(500, 'Failed to retrieve profile', err)
  }

  if (profileRow) {
    return await getFetchedProfileJsonForProfile(env, profileRow)
  } else {
    // Default to the empty profile.
    return {
      uuid: '',
      nonce: INITIAL_NONCE,
      name: null,
      nft: null,
      chains: {},
    }
  }
}
