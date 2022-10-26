import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError, NotOwnerError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import * as Cw721 from "../cw721";

export const getOwnedNftImageUrl = (rpc: string, walletAddress: string): GetOwnedNftImageUrlFunction => async (
  publicKey,
  collectionAddress,
  tokenId
) => {
  let imageUrl: string | undefined;
  try {
    const client = await CosmWasmClient.connect(rpc);

    const owner = await Cw721.getOwner(client, collectionAddress, tokenId);
    // If does not own NFT, throw error.
    if (owner.owner !== walletAddress) {
      throw new NotOwnerError();
    }

    imageUrl = await Cw721.getImageUrl(client, collectionAddress, tokenId);
  } catch (err) {
    // If error already handled, pass up the chain.
    if (err instanceof KnownError || err instanceof NotOwnerError) {
      throw err;
    }

    console.error(err);
    throw new KnownError(
      500,
      "Unexpected error retrieving NFT info from chain",
      err
    );
  }

  return imageUrl;
};
