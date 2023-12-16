import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GetOwnedNftImageUrlFunction } from "../types";
import {
  KnownError,
  NotOwnerError,
  secp256k1PublicKeyToBech32Address,
  DaoVotingCw721Staked,
} from "../utils";

const STARGAZE_GQL_URI = "https://graphql.mainnet.stargaze-apis.com/graphql";
const STARGAZE_INDEXER_BASE = "https://stargaze-mainnet.indexer.zone";
const STARGAZE_RPC = "https://rpc.stargaze-apis.com";
const STARGAZE_PREFIX = "stars";

const stargazeIndexerClient = new ApolloClient({
  uri: STARGAZE_GQL_URI,
  cache: new InMemoryCache(),
});

const STARGAZE_GQL_TOKEN_QUERY = gql`
  query tokenQuery($collectionAddr: String!, $tokenId: String!) {
    token(collectionAddr: $collectionAddr, tokenId: $tokenId) {
      tokenId
      collection {
        contractAddress
      }
      media {
        url
      }
      owner {
        address
      }
    }
  }
`;

// Stargaze API NFT object. The Stargaze API returns more data. These are the
// only fields we care about.
interface StargazeNft {
  image: string;
  tokenId: string;
  collection: {
    contractAddress: string;
  };
}

export const getOwnedNftImageUrl: GetOwnedNftImageUrlFunction = async (
  { INDEXER_API_KEY },
  publicKey,
  collectionAddress,
  tokenId
) => {
  const indexer = STARGAZE_INDEXER_BASE + "/" + INDEXER_API_KEY;

  let stargazeAddress;
  try {
    stargazeAddress = secp256k1PublicKeyToBech32Address(
      publicKey,
      STARGAZE_PREFIX
    );
  } catch (err) {
    console.error("PK to Address", err);
    throw new KnownError(400, "Invalid public key", err);
  }

  const { error, data } = await stargazeIndexerClient.query({
    query: STARGAZE_GQL_TOKEN_QUERY,
    variables: {
      collectionAddr: collectionAddress,
      tokenId,
    },
  });

  if (error) {
    console.error("Failed to load data from Stargaze indexer", error);
    throw error;
  }

  if (!data) {
    console.error("Failed to load data from Stargaze indexer");
    throw new KnownError(500, "Failed to load token from Stargaze indexer");
  }

  const owner = data.token?.owner?.address;
  if (!owner) {
    throw new KnownError(500, "Failed to load owner from Stargaze indexer");
  }

  // If public key does not own the NFT, check if it was staked in a DAO by this
  // wallet.
  if (owner !== stargazeAddress) {
    const client = await CosmWasmClient.connect(STARGAZE_RPC);

    // Check if NFT is staked in a DAO.
    const isStakingContract = await DaoVotingCw721Staked.isContract(
      indexer,
      client,
      owner
    );

    if (isStakingContract) {
      const addressStakedToken = await DaoVotingCw721Staked.addressStakedToken(
        indexer,
        client,
        // Owner is the staking contract.
        owner,
        stargazeAddress,
        tokenId
      );

      // If address did not stake the NFT, public key does not own it.
      if (!addressStakedToken) {
        throw new NotOwnerError();
      }
    } else {
      // Not owned nor staked by this public key.
      throw new NotOwnerError();
    }
  }

  if (data.token?.media?.url) {
    return data.token.media.url;
  }
};
