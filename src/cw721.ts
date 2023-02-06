import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { KnownError } from "./error";
import { transformIpfsUrlToHttpsIfNecessary } from "./utils";

type Expiration =
  | {
      at_height: number;
    }
  | {
      at_time: string;
    }
  | {
      never: {};
    };
interface Approval {
  expires: Expiration;
  spender: string;
}
interface OwnerOfResponse {
  approvals: Approval[];
  owner: string;
}

interface NftInfoResponse {
  // Extension can be anything. Let's check if any image fields are present and
  // use them if so.
  extension?: {
    image?: string;
    image_uri?: string;
    image_url?: string;
  } | null;
  token_uri?: string | null;
}

export const getOwner = async (
  indexer: string | undefined,
  client: CosmWasmClient,
  collectionAddress: string,
  tokenId: string
): Promise<string> => {
  // Query indexer.
  if (indexer) {
    try {
      const indexerOwnerOf: OwnerOfResponse = await (
        await fetch(
          indexer +
            `/contract/${collectionAddress}/cw721/ownerOf?tokenId=${tokenId}`
        )
      ).json();

      if (indexerOwnerOf) {
        return indexerOwnerOf.owner;
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Fallback to chain.
  const chainOwnerOf: OwnerOfResponse = await client.queryContractSmart(
    collectionAddress,
    {
      owner_of: {
        token_id: tokenId,
      },
    }
  );

  return chainOwnerOf.owner;
};

export const getImageUrl = async (
  indexer: string | undefined,
  client: CosmWasmClient,
  collectionAddress: string,
  tokenId: string
): Promise<string | undefined> => {
  let info: NftInfoResponse | undefined;
  // Query indexer.
  if (indexer) {
    try {
      info = await (
        await fetch(
          indexer +
            `/contract/${collectionAddress}/cw721/nftInfo?tokenId=${tokenId}`
        )
      ).json();
    } catch (err) {
      console.error(err);
    }
  }

  // Fallback to chain.
  info = await client.queryContractSmart(collectionAddress, {
    nft_info: {
      token_id: tokenId,
    },
  });

  if (!info) {
    return;
  }

  return await getImageUrlFromInfo(info);
};

export const getImageUrlFromInfo = async (
  info: NftInfoResponse
): Promise<string | undefined> => {
  // If NFT has extension with image, we're satisfied. Checks `image`,
  // `image_uri`, and `image_url`.
  if ("extension" in info && info.extension) {
    if ("image" in info.extension && info.extension.image) {
      return info.extension.image;
    }
    if ("image_uri" in info.extension && info.extension.image_uri) {
      return info.extension.image_uri;
    }
    if ("image_url" in info.extension && info.extension.image_url) {
      return info.extension.image_url;
    }
  }

  // Check token URI data.
  let imageUrl: string | undefined;
  if ("token_uri" in info && info.token_uri) {
    try {
      // Transform IPFS url if necessary.
      const response = await fetch(
        transformIpfsUrlToHttpsIfNecessary(info.token_uri)
      );
      const data = await response.text();

      // Only try to parse if there's a good chance this is JSON, the heuristic
      // being the first non-whitespace character is a "{".
      if (data.trimStart().startsWith("{")) {
        try {
          const json = JSON.parse(data);
          if (typeof json.image === "string" && json.image) {
            imageUrl = json.image;
          }
        } catch (err) {
          console.error(err);
          throw new KnownError(
            415,
            "Invalid NFT data",
            "Failed to parse token_uri data as JSON."
          );
        }
      } else {
        // If not JSON, hope token_uri is an image.
        imageUrl = info.token_uri;
      }
    } catch (err) {
      // If error already handled, pass up the chain.
      if (err instanceof KnownError) {
        throw err;
      }

      console.error(err);
      throw new KnownError(
        500,
        "Unexpected error retrieving token_uri data",
        err
      );
    }
  }

  return imageUrl;
};
