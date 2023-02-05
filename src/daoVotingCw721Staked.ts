import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";

type InfoResponse = {
  info: {
    contract: string;
    version: string;
  };
};

export const isContract = async (
  client: CosmWasmClient,
  contractAddress: string
): Promise<boolean> => {
  const { info }: InfoResponse = await client.queryContractSmart(
    contractAddress,
    {
      info: {},
    }
  );

  return (
    !!info &&
    "contract" in info &&
    info.contract === "crates.io:dao-voting-cw721-staked"
  );
};

// Get all NFTs an address has staked and check if the token ID is in the list.
const LIMIT = 30;
export const addressStakedToken = async (
  client: CosmWasmClient,
  contractAddress: string,
  address: string,
  tokenId: string
): Promise<boolean> => {
  const tokens: string[] = [];
  while (true) {
    const response: string[] = await client.queryContractSmart(
      contractAddress,
      {
        staked_nfts: {
          address,
          start_after: tokens[tokens.length - 1],
          limit: LIMIT,
        },
      }
    );

    if (!response?.length) {
      break;
    }

    tokens.push(...response);

    // If we have less than the limit of items, we've exhausted them.
    if (response.length < LIMIT) {
      break;
    }
  }

  return tokens.includes(tokenId);
};
