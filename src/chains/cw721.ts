import { Chain } from '@chain-registry/types'
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate'

import { GetOwnedNftImageUrlFunction } from '../types'
import {
  Cw721,
  DaoVotingCw721Staked,
  KnownError,
  NotOwnerError,
  secp256k1PublicKeyToBech32Address,
} from '../utils'

export const getOwnedNftImageUrl =
  (
    {
      chain_id: chainId,
      chain_name: chainName,
      bech32_prefix: bech32Prefix,
    }: Chain,
    publicKey: string
  ): GetOwnedNftImageUrlFunction =>
  async ({ INDEXER_API_KEY }, _publicKey, collectionAddress, tokenId) => {
    const indexer = `https://indexer.daodao.zone/${chainId}/${INDEXER_API_KEY}`

    let walletAddress
    try {
      walletAddress = secp256k1PublicKeyToBech32Address(publicKey, bech32Prefix)
    } catch (err) {
      console.error('PK to Address', err)
      throw new KnownError(400, 'Invalid public key', err)
    }

    let imageUrl: string | undefined
    try {
      const client = await CosmWasmClient.connect(
        `https://rpc.cosmos.directory/${chainName}`
      )

      const owner = await Cw721.getOwner(
        indexer,
        client,
        collectionAddress,
        tokenId
      )
      // If wallet does not directly own NFT, check if staked with a DAO voting
      // module.
      if (owner !== walletAddress) {
        const isStakingContract = await DaoVotingCw721Staked.isContract(
          indexer,
          client,
          owner
        )
        if (isStakingContract) {
          const addressStakedToken =
            await DaoVotingCw721Staked.addressStakedToken(
              indexer,
              client,
              // Owner is the staking contract.
              owner,
              walletAddress,
              tokenId
            )

          if (!addressStakedToken) {
            throw new NotOwnerError()
          }
        } else {
          throw new NotOwnerError()
        }
      }

      imageUrl = await Cw721.getImageUrl(
        indexer,
        client,
        collectionAddress,
        tokenId
      )
    } catch (err) {
      // If error already handled, pass up the chain.
      if (err instanceof KnownError || err instanceof NotOwnerError) {
        throw err
      }

      console.error(err)
      throw new KnownError(
        500,
        'Unexpected error retrieving NFT info from chain',
        err
      )
    }

    return imageUrl
  }
