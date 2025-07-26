import { chains as chainRegistryChains } from 'chain-registry'

export type Chain = {
  chain_id: string
  bech32_prefix: string
  slip44: number
  fee_denom?: string
}

/**
 * Extract chain information we care about from chain registry.
 */
const validChains = chainRegistryChains.flatMap((c): Chain | [] =>
  c.chain_id && c.bech32_prefix
    ? {
        chain_id: c.chain_id,
        bech32_prefix: c.bech32_prefix,
        // default cosmos coin type (slip44) is 118
        slip44: c.slip44 ?? 118,
        fee_denom: c.fees?.fee_tokens[0]?.denom,
      }
    : []
)

const chains: Chain[] = [
  ...validChains,

  // Custom chains not in chain registry.
  {
    ...validChains.find((c) => c.chain_id === 'bitsong-2b')!,
    chain_id: 'bobnet',
  },
  {
    ...validChains.find((c) => c.chain_id === 'omniflixhub-1')!,
    chain_id: 'flixnet-4',
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
