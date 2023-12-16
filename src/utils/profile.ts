import { getOwnedNftImageUrl } from "../chains";
import { Env, ProfileNft, ProfileNftWithImage } from "../types";

export const EMPTY_PROFILE = {
  nonce: 0,
  name: null,
  nft: null,
};

export const getProfileKey = (publicKey: string) => `profile:${publicKey}`;

// Map name to public key to map to profile and check if name is taken.
export const getPublicKeyForNameTakenKey = (name: string) =>
  `nameTaken:${name.toLowerCase()}`;

// Map bech32 hash (hex string) to public key to map to profile.
export const getPublicKeyForBech32HashKey = (bech32Hash: string) => `publicKeyForBech32Hash:${bech32Hash}`;

export const getOwnedNftWithImage = async (
  env: Env,
  publicKey: string,
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
  );

  return imageUrl
    ? {
        chainId: nft.chainId,
        collectionAddress: nft.collectionAddress,
        tokenId: nft.tokenId,
        imageUrl,
      }
    : null;
};