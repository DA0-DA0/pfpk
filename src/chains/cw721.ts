import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { GetOwnedNftImageUrlFunction } from "../types";
import { KnownError, NotOwnerError } from "../error";
import * as Cw721 from "../cw721";
import * as DaoVotingCw721Staked from "../daoVotingCw721Staked";

export const getOwnedNftImageUrl =
  (rpc: string, walletAddress: string): GetOwnedNftImageUrlFunction =>
  async (_, collectionAddress, tokenId) => {
    let imageUrl: string | undefined;
    try {
      const client = await CosmWasmClient.connect(rpc);

      const owner = await Cw721.getOwner(client, collectionAddress, tokenId);
      // If wallet does not directly own NFT, check if staked with a DAO voting
      // module.
      if (owner !== walletAddress) {
        const isStakingContract = await DaoVotingCw721Staked.isContract(
          client,
          owner
        );
        if (isStakingContract) {
          const addressStakedToken =
            await DaoVotingCw721Staked.addressStakedToken(
              client,
              owner,
              collectionAddress,
              tokenId
            );

          if (!addressStakedToken) {
            throw new NotOwnerError();
          }
        } else {
          throw new NotOwnerError();
        }
      }

      imageUrl = await Cw721.getImageUrl(client, collectionAddress, tokenId);
    } catch (err) {
      // If error already handled, pass up the chain.
      if (err instanceof KnownError || err instanceof NotOwnerError) {
        throw err;
      }

      console.error(err);
      throw new KnownError(
        500,
        "Unexpected error retrieving NFT info from chain",
        err
      );
    }

    return imageUrl;
  };
