import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const JUNO_RPC = "https://rpc.juno.strange.love:443";

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  publicKey,
  collectionAddress,
  tokenId
) => {
  let junoAddress;
  try {
    junoAddress = secp256k1PublicKeyToBech32Address(publicKey, "juno");
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  return await makeCw721GetOwnedNftImageUrl(JUNO_RPC, junoAddress)(
    publicKey,
    collectionAddress,
    tokenId
  );
};
