import { KnownError } from './error'

export const getImageAndOwner = async (
  chainId: string,
  collectionAddress: string,
  tokenId: string
): Promise<{
  imageUrl: string
  owner: string
  /**
   * If NFT staked in a DAO, `owner` is a dao-voting-cw721-staked address and
   * `staker` is the address that staked the NFT.
   */
  staker?: string
}> => {
  try {
    const res = await fetch(
      `https://snapper.daodao.zone/q/nft-image-and-owner?chainId=${chainId}&collectionAddress=${collectionAddress}&tokenId=${tokenId}`
    )

    if (!res.ok) {
      throw new Error(await res.text().catch(() => 'Unknown error.'))
    }

    return await res.json()
  } catch (err) {
    console.error(err)
    throw new KnownError(500, 'Failed to get NFT image and owner.', err)
  }
}
