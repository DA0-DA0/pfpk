import { chains as chainRegistryChains } from 'chain-registry'

export type Chain = {
  chain_id: string
  bech32_prefix: string
}

const validChains = chainRegistryChains.flatMap((c): Chain | [] =>
  c.chain_id && c.bech32_prefix
    ? { chain_id: c.chain_id, bech32_prefix: c.bech32_prefix }
    : []
)

const chains: Chain[] = [
  ...validChains,

  // Custom chains not in chain registry.
  {
    chain_id: 'bobnet',
    bech32_prefix: validChains.find((c) => c.chain_id === 'bitsong-2b')!
      .bech32_prefix,
  },
  {
    chain_id: 'flixnet-4',
    bech32_prefix: validChains.find((c) => c.chain_id === 'omniflixhub-1')!
      .bech32_prefix,
  },
]

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
