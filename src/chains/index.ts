import { makeGetOwnedNftImageUrl } from './fallback'
import { getOwnedNftImageUrl as stargaze } from './stargaze'
import { GetOwnedNftImageUrlFunction } from '../types'

// Override NFT getter for chains.
export const CHAINS: Record<string, GetOwnedNftImageUrlFunction | undefined> = {
  ['stargaze-1']: stargaze,
}

export const getOwnedNftImageUrl = async (
  chainId: string,
  ...params: Parameters<GetOwnedNftImageUrlFunction>
): ReturnType<GetOwnedNftImageUrlFunction> => {
  const fn = CHAINS[chainId] || makeGetOwnedNftImageUrl(chainId)
  return await fn(...params)
}
