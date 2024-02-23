import { Chain } from '@chain-registry/types'
import { chains } from 'chain-registry'

/**
 * Get chain by chain ID.
 */
export const getChain = (chainId: string): Chain | undefined =>
  chains.find(({ chain_id }) => chain_id === chainId)
