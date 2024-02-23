import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from './cw721'
import { GetOwnedNftImageUrlFunction } from '../types'
import { KnownError, getChain } from '../utils'

export const makeGetOwnedNftImageUrl =
  (chainId: string): GetOwnedNftImageUrlFunction =>
  async (env, publicKey, collectionAddress, tokenId) => {
    const chain = await getChain(chainId)
    if (!chain) {
      throw new KnownError(400, 'Unknown chainId.')
    }

    return await makeCw721GetOwnedNftImageUrl(chain, publicKey)(
      env,
      publicKey,
      collectionAddress,
      tokenId
    )
  }
