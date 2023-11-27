import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const NEUTRON_INDEXER = "https://neutron-mainnet.indexer.zone";
const NEUTRON_RPC = "https://rpc-kralum.neutron-1.neutron.org";
const NEUTRON_PREFIX = "neutron";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  env,
  publicKey,
  collectionAddress,
  tokenId
) => {
  let address;
  try {
    address = secp256k1PublicKeyToBech32Address(publicKey, NEUTRON_PREFIX);
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(env.INDEXER_API_KEY ? NEUTRON_INDEXER + env.INDEXER_API_KEY : undefined, NEUTRON_RPC, address)(
    env,
    publicKey,
    collectionAddress,
    tokenId
  );
};
