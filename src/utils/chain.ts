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
  {
    chain_id: 'thorchain-stagenet-2',
    bech32_prefix: 'sthor',
    slip44: 931,
    fee_denom: 'rune',
  },
  {
    chain_id: 'luwak-1',
    bech32_prefix: 'kopi',
    slip44: 118,
    fee_denom: 'ukopi',
  },
  {
    chain_id: 'bbn-test-5',
    bech32_prefix: 'bbn',
    slip44: 118,
    fee_denom: 'ubbn',
  },
  {
    chain_id: 'ithaca-1',
    bech32_prefix: 'odiseo',
    slip44: 118,
    fee_denom: 'uodis',
  },
  {
    chain_id: 'regen-upgrade',
    bech32_prefix: 'regen',
    slip44: 118,
    fee_denom: 'uregen',
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
