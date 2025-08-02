import { fromBech32, toHex } from '@cosmjs/encoding'
import { RequestHandler } from 'itty-router'

import { DbRowProfile, FetchProfileResponse } from '../types'
import {
  KnownError,
  getFetchedProfileJsonForProfile,
  getProfileFromAddressHex,
  getProfileFromPublicKeyHex,
  getProfileFromUuid,
} from '../utils'

/**
 * Fetch a profile by public key, address hex, bech32 address, or UUID.
 */
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
  // via uuid
  const uuid = request.params?.uuid?.trim()

  let profileRow: DbRowProfile | null = null
  try {
    if (publicKey) {
      profileRow = await getProfileFromPublicKeyHex(env, publicKey)
    } else if (addressHex) {
      profileRow = await getProfileFromAddressHex(env, addressHex)
    } else if (bech32Address) {
      try {
        addressHex = toHex(fromBech32(bech32Address).data)
      } catch (err) {
        throw new KnownError(400, 'Invalid bech32 address', err)
      }

      profileRow = await getProfileFromAddressHex(env, addressHex)
    } else if (uuid) {
      profileRow = await getProfileFromUuid(env, uuid)
      // Return an error instead of the empty profile if the specified UUID
      // isn't found.
      if (!profileRow) {
        throw new KnownError(404, `Profile not found for UUID: ${uuid}`)
      }
    } else {
      throw new KnownError(400, 'No profile identifier provided')
    }
  } catch (err) {
    if (err instanceof KnownError) {
      throw err
    }

    console.error('Profile retrieval', err)
    throw new KnownError(500, 'Failed to retrieve profile', err)
  }

  if (profileRow) {
    return await getFetchedProfileJsonForProfile(env, profileRow)
  } else {
    // Default to the empty profile.
    return {
      uuid: '',
      name: null,
      nft: null,
      chains: {},
      createdAt: -1,
      updatedAt: -1,
    }
  }
}
