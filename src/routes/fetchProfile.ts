import { fromBech32, toHex } from "@cosmjs/encoding";
import { Request, RouteHandler } from "itty-router";
import { KnownError, NotOwnerError } from "../error";
import { Env, FetchProfileResponse, Profile } from "../types";
import {
  EMPTY_PROFILE,
  getProfileKey,
  getOwnedNftWithImage,
  getPublicKeyForBech32HashKey,
} from "../utils";

export const fetchProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: FetchProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    });

  // via public key
  let publicKey = request.params?.publicKey?.trim();
  // via bech32 hash
  let bech32Hash = request.params?.bech32Hash?.trim();
  // via bech32 address
  const bech32Address = request.params?.bech32Address?.trim();

  let profile: Profile;
  try {
    // If no public key nor bech32 hash is set, find bech 32 hash from address.
    if (!publicKey && !bech32Hash && bech32Address) {
      bech32Hash = toHex(fromBech32(bech32Address).data);
    }

    // If no public key but bech32 hash is, find public key.
    if (!publicKey && bech32Hash) {
      const resolvedPublicKey = await env.PROFILES.get(
        getPublicKeyForBech32HashKey(bech32Hash)
      );
      // If no public key found in KV store, no profile set.
      if (!resolvedPublicKey) {
        return respond(200, EMPTY_PROFILE);
      }

      publicKey = resolvedPublicKey;
    }

    if (!publicKey) {
      return respond(400, {
        error: "Invalid request",
        message: "Failed to resolve public key.",
      });
    }

    const stringifiedData = await env.PROFILES.get(getProfileKey(publicKey));
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
  // it. If no NFT is returned, it will be unset since it cannot be used as a
  // profile picture.
  try {
    response.nft = await getOwnedNftWithImage(env, publicKey, nft);
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

  return respond(200, response);
};
