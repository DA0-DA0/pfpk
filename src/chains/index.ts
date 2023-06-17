import { JUNO_CHAIN_ID, STARGAZE_CHAIN_ID, OSMOSIS_CHAIN_ID } from "../constants";
import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { getOwnedNftImageUrl as stargaze } from "./stargaze";
import { getOwnedNftImageUrl as juno } from "./juno";
import { getOwnedNftImageUrl as osmosis } from "./osmosis";

export const CHAINS: Record<string, GetOwnedNftImageUrlFunction | undefined> = {
  [STARGAZE_CHAIN_ID]: stargaze,
  [JUNO_CHAIN_ID]: juno,
  [OSMOSIS_CHAIN_ID]: osmosis,
};

export const getOwnedNftImageUrl = async (
  chainId: string,
  ...params: Parameters<GetOwnedNftImageUrlFunction>
): ReturnType<GetOwnedNftImageUrlFunction> => {
  const fn = CHAINS[chainId];
  if (!fn) {
    throw new KnownError(
      400,
      "Invalid chain ID",
      `Chain ID must be one of: ${Object.keys(CHAINS).join(", ")}`
    );
  }

  return await fn(...params);
};
