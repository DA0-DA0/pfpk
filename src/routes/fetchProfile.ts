import { Request, RouteHandler } from "itty-router";
import { getOwnedNftImageUrl } from "../chains";
import { KnownError, NotOwnerError } from "../error";
import { Env, FetchProfileResponse, Profile } from "../types";
import { EMPTY_PROFILE } from "../utils";

export const fetchProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: FetchProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    });

  const publicKey = request.params?.publicKey?.trim();
  if (!publicKey) {
    return respond(400, {
      error: "Invalid request",
      message: "Missing publicKey.",
    });
  }

  let profile: Profile;
  try {
    const stringifiedData = await env.PROFILES.get(publicKey);
    // If no data found in KV store, no profile set. Respond with empty data.
    if (!stringifiedData) {
      return respond(200, EMPTY_PROFILE);
    }

    profile = JSON.parse(stringifiedData);
  } catch (err) {
    console.error("Profile retrieval or parsing", err);

    return respond(500, {
      error: "Failed to retrieve or parse profile",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Response object for mutating with NFT if present.
  const response: FetchProfileResponse = {
    nonce: profile.nonce,
    name: profile.name?.trim() || null,
    nft: null,
  };

  // Get NFT from stored profile data.
  const { nft } = profile;
  // If no NFT, respond with name potentially set.
  if (!nft) {
    return respond(200, response);
  }

  // Verify selected NFT still belongs to the public key before responding with
  // it. If image is empty, it will be unset since it cannot be used as a
  // profile picture.
  let imageUrl: string | undefined;
  try {
    imageUrl = await getOwnedNftImageUrl(
      nft.chainId,
      publicKey,
      nft.collectionAddress,
      nft.tokenId
    );
  } catch (err) {
    if (err instanceof KnownError) {
      return respond(err.statusCode, err.responseJson);
    }

    // If some other error, return unexpected. Otherwise if NotOwnerError,
    // chainNftImageUrl remains undefined, which is handled below.
    if (!(err instanceof NotOwnerError)) {
      return respond(500, {
        error: "Unexpected verification error",
        message: err instanceof Error ? err.message : `${err}`,
      });
    }
  }

  // If found NFT, add to response.
  if (imageUrl) {
    response.nft = {
      chainId: nft.chainId,
      collectionAddress: nft.collectionAddress,
      tokenId: nft.tokenId,
      imageUrl,
    };
  } else {
    // Otherwise unset NFT from this address since they no longer own it.
    await env.PROFILES.put(
      publicKey,
      JSON.stringify({
        ...profile,
        nft: undefined,
      })
    );
  }

  return respond(200, response);
};
