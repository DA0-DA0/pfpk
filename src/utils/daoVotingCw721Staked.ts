import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

type InfoResponse = {
  info: {
    contract: string
    version: string
  }
}

export const isContract = async (
  indexer: string | undefined,
  client: CosmWasmClient,
  contractAddress: string
): Promise<boolean> => {
  let info: InfoResponse['info'] | undefined
  // Query indexer.
  if (indexer) {
    try {
      info = (await (
        await fetch(indexer + `/contract/${contractAddress}/info`)
      ).json()) as InfoResponse['info']
    } catch (err) {
      console.error(err)
    }
  }

  // Fallback to chain.
  if (!info) {
    try {
      info = (
        (await client.queryContractSmart(contractAddress, {
          info: {},
        })) as InfoResponse
      ).info
    } catch (err) {
      console.error(err)
    }
  }

  return (
    !!info &&
    'contract' in info &&
    info.contract === 'crates.io:dao-voting-cw721-staked'
  )
}

// Get all NFTs an address has staked and check if the token ID is in the list.
const LIMIT = 30
export const addressStakedToken = async (
  indexer: string | undefined,
  client: CosmWasmClient,
  contractAddress: string,
  address: string,
  tokenId: string
): Promise<boolean> => {
  let tokens: string[] | undefined
  // Query indexer.
  if (indexer) {
    try {
      tokens = await (
        await fetch(
          indexer +
            `/contract/${contractAddress}/daoVotingCw721Staked/stakedNfts?address=${address}`
        )
      ).json()
    } catch (err) {
      console.error(err)
    }
  }

  // Fallback to chain.
  if (!tokens) {
    tokens = []

    while (true) {
      const response: string[] = await client.queryContractSmart(
        contractAddress,
        {
          staked_nfts: {
            address,
            start_after: tokens[tokens.length - 1],
            limit: LIMIT,
          },
        }
      )

      if (!response?.length) {
        break
      }

      tokens.push(...response)

      // If we have less than the limit of items, we've exhausted them.
      if (response.length < LIMIT) {
        break
      }
    }
  }

  return tokens.includes(tokenId)
}
