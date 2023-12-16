import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../utils/error";
import { getOwnedNftImageUrl as stargaze } from "./stargaze";
import { getOwnedNftImageUrl as juno } from "./juno";
import { getOwnedNftImageUrl as osmosis } from "./osmosis";
import { getOwnedNftImageUrl as neutron } from "./neutron";

export const CHAINS: Record<string, GetOwnedNftImageUrlFunction | undefined> = {
  ["stargaze-1"]: stargaze,
  ["juno-1"]: juno,
  ["osmosis-1"]: osmosis,
  ["neutron-1"]: neutron,
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
