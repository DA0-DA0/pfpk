import {
  VerificationError,
  GetOwnedNftImageUrlFunction,
  NotOwnerError,
} from "../types";
import { secp256k1PublicKeyToBech32Address } from "../utils";

const STARGAZE_API_TEMPLATE =
  "https://nft-api.stargaze-apis.com/api/v1beta/profile/{{address}}/nfts";

// Stargaze API NFT object.
// The Stargaze API returns more data. These are the only fields we care about.
interface StargazeNft {
  image: string;
  tokenId: string;
  collection: {
    contractAddress: string;
  };
}

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  publicKey,
  collectionAddress,
  tokenId
) => {
  let stargazeAddress;
  try {
    stargazeAddress = secp256k1PublicKeyToBech32Address(publicKey, "stars");
  } catch (err) {
    console.error("PK to Address", err);
    throw new VerificationError(400, "Invalid public key.", err);
  }

  // Search Stargaze API for this address's NFTs. If the desired NFT is not
  // present, public key does not own it.
  const stargazeNfts: StargazeNft[] = await (
    await fetch(STARGAZE_API_TEMPLATE.replace("{{address}}", stargazeAddress))
  ).json();

  const stargazeNft = stargazeNfts.find(
    (stargazeNft) =>
      stargazeNft.collection.contractAddress === collectionAddress &&
      stargazeNft.tokenId === tokenId
  );

  // If NFT not found, public key does not own it, so return null.
  if (!stargazeNft) {
    throw new NotOwnerError();
  }

  // If image is empty, cannot be used as profile picture.
  if (!stargazeNft.image) {
    throw new VerificationError(
      415,
      "Invalid NFT data.",
      "Failed to retrieve image data from NFT."
    );
  }

  return stargazeNft.image;
};
