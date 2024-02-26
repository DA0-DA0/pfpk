import { GetOwnedNftImageUrlFunction } from "../types";
import { secp256k1PublicKeyToBech32Address, KnownError } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const JUNO_INDEXER = "https://indexer.daodao.zone/juno-1";
const JUNO_RPC = "https://juno-rpc.reece.sh";
const JUNO_PREFIX = "juno";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  env,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let address;
  try {
    address = secp256k1PublicKeyToBech32Address(publicKey, JUNO_PREFIX);
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(JUNO_INDEXER, JUNO_RPC, address)(
    env,
    publicKey,
    collectionAddress,
    tokenId
  );
};
