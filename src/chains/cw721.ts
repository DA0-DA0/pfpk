import { GetOwnedNftImageUrlFunction, PublicKey } from '../types'
import { Chain, Cw721, KnownError, NotOwnerError } from '../utils'

export const getOwnedNftImageUrl =
  (
    { chain_id: chainId, bech32_prefix: bech32Prefix }: Chain,
    publicKey: PublicKey
  ): GetOwnedNftImageUrlFunction =>
  async (_, _publicKey, collectionAddress, tokenId) => {
    let walletAddress
    try {
      walletAddress = await publicKey.getBech32Address(bech32Prefix)
    } catch (err) {
      console.error('PK to Address', err)
      throw new KnownError(400, 'Invalid public key', err)
    }

    try {
      const { imageUrl, owner, staker } = await Cw721.getImageAndOwner(
        chainId,
        collectionAddress,
        tokenId
      )

      // If wallet does not directly own NFT, check if staked with a DAO voting
      // module.
      if (owner !== walletAddress && staker !== walletAddress) {
        throw new NotOwnerError()
      }

      return imageUrl
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
  }
