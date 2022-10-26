import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import { ApolloClient, InMemoryCache, gql } from "@apollo/client";
import { getOwnedNftImageUrl as makeCw721GetOwnedNftImageUrl } from "./cw721";

const JUNO_RPC = "https://rpc.juno.strange.love:443";
const LOOP_API_TEMPLATE = "https://nft-juno-backend.loop.markets";

const GET_LOOP_NFTS_QUERY = gql`
  query GetLoopNfts($walletAddress: String!) {
    nfts(filter: { owner: { equalTo: $walletAddress } }) {
      nodes {
        contractId
        tokenID
        image
      }
    }
  }
`;

interface LoopQuery {
  nfts: {
    nodes: {
      contractId: string;
      tokenID: string;
      image: string | null;
    }[];
  };
}

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

  try {
    const apolloClient = new ApolloClient({
      uri: LOOP_API_TEMPLATE,
      cache: new InMemoryCache(),
    });

    // Search Loop API for this address's NFTs. If the desired NFT is not present,
    // public key does not own it on Loop.
    const loopQuery = await apolloClient.query<LoopQuery>({
      query: GET_LOOP_NFTS_QUERY,
      variables: {
        walletAddress: junoAddress,
      },
    });

    const loopNft = loopQuery.data.nfts.nodes.find(
      (nft) => nft.contractId === collectionAddress && nft.tokenID === tokenId
    );

    // If found, return image.
    if (loopNft?.image) {
      return loopNft.image;
    }
  } catch (err) {
    console.error(err);
    throw new KnownError(
      500,
      "Unexpected error retrieving NFT info from Loop API",
      err
    );
  }

  // If NFT not found, fallback to checking CW721 contract directly.
  return await makeCw721GetOwnedNftImageUrl(JUNO_RPC, junoAddress)(
    publicKey,
    collectionAddress,
    tokenId
  );
};
