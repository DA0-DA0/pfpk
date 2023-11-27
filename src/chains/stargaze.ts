import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError, NotOwnerError } from "../error";
import { secp256k1PublicKeyToBech32Address } from "../utils";
import * as Cw721 from "../cw721";
import * as DaoVotingCw721Staked from "../daoVotingCw721Staked";

const STARGAZE_API_TEMPLATE =
  "https://nft-api.stargaze-apis.com/api/v1beta/profile/{{address}}/nfts";
const STARGAZE_INDEXER = "https://stargaze-mainnet.indexer.zone";
const STARGAZE_RPC = "https://rpc.stargaze-apis.com";
const STARGAZE_PREFIX = "stars";

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
  _,
  publicKey,
  collectionAddress,
  tokenId
) => {
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

  const client = await CosmWasmClient.connect(STARGAZE_RPC);
  const owner = await Cw721.getOwner(
    STARGAZE_INDEXER,
    client,
    collectionAddress,
    tokenId
  );

  // If public key does not own the NFT, check if it was staked in a DAO by this
  // wallet.
  if (owner !== stargazeAddress) {
    // Check if NFT is staked in a DAO.
    const isStakingContract = await DaoVotingCw721Staked.isContract(
      STARGAZE_INDEXER,
      client,
      owner
    );

    if (isStakingContract) {
      const addressStakedToken = await DaoVotingCw721Staked.addressStakedToken(
        STARGAZE_INDEXER,
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
      // If NFT is not staked in a DAO, public key does not own it.
      throw new NotOwnerError();
    }
  }

  // Search Stargaze API for the owner's NFTs to retrieve the image.
  const stargazeNfts: StargazeNft[] = await (
    await fetch(STARGAZE_API_TEMPLATE.replace("{{address}}", owner))
  ).json();

  const stargazeNft = stargazeNfts.find(
    (stargazeNft) =>
      stargazeNft.collection.contractAddress === collectionAddress &&
      stargazeNft.tokenId === tokenId
  );

  if (stargazeNft) {
    return stargazeNft.image;
  }

  throw new NotOwnerError();
};
