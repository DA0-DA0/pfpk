import { Chain } from '@chain-registry/types'
import { chains } from 'chain-registry'

/**
 * Get chain by chain ID.
 */
export const getChain = (chainId: string): Chain | undefined =>
  chains.find(({ chain_id }) => chain_id === chainId)

/**
 * Get chain by chain ID or throw an error.
 */
export const mustGetChain = (chainId: string): Chain => {
  const chain = getChain(chainId)
  if (!chain) {
    throw new Error(`Unknown chain: ${chainId}.`)
  }
  return chain
}
