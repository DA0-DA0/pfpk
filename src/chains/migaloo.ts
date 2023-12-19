import { GetOwnedNftImageUrlFunction } from "../types";
import { secp256k1PublicKeyToBech32Address, KnownError } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const MIGALOO_INDEXER = "https://migaloo-mainnet.indexer.zone";
const MIGALOO_RPC = "https://migaloo-rpc.polkachu.com";
const MIGALOO_PREFIX = "migaloo";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  env,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let address;
  try {
    address = secp256k1PublicKeyToBech32Address(publicKey, MIGALOO_PREFIX);
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(
    MIGALOO_INDEXER,
    MIGALOO_RPC,
    address
  )(env, publicKey, collectionAddress, tokenId);
};
