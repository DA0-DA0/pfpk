import { getOwnedNftImageUrl } from '../chains'
import { Env, ProfileNft, ProfileNftWithImage, PublicKey } from '../types'

export const getOwnedNftWithImage = async (
  env: Env,
  publicKey: PublicKey,
  nft: ProfileNft
): Promise<ProfileNftWithImage | null> => {
  // Verify selected NFT still belongs to the public key before responding with
  // it. If no image, return no NFT, since we can't display without an image.
  const imageUrl = await getOwnedNftImageUrl(
    nft.chainId,
    env,
    publicKey,
    nft.collectionAddress,
    nft.tokenId
  )

  return imageUrl
    ? {
        chainId: nft.chainId,
        collectionAddress: nft.collectionAddress,
        tokenId: nft.tokenId,
        imageUrl,
      }
    : null
}
