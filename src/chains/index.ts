import { JUNO_CHAIN_ID, STARGAZE_CHAIN_ID } from "../constants";
import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { getOwnedNftImageUrl as stargaze } from "./stargaze";
import { getOwnedNftImageUrl as juno } from "./juno";

export const CHAINS: Record<string, GetOwnedNftImageUrlFunction | undefined> = {
  [STARGAZE_CHAIN_ID]: stargaze,
  [JUNO_CHAIN_ID]: juno,
};

export const getOwnedNftImageUrl = async (
  chainId: string,
  ...params: Parameters<GetOwnedNftImageUrlFunction>
): ReturnType<GetOwnedNftImageUrlFunction> => {
  const fn = CHAINS[chainId];
  if (!fn) {
    throw new KnownError(400, "Invalid chain ID.");
  }

  return await fn(...params);
};
