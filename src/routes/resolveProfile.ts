import { Request, RouteHandler } from "itty-router";
import {
  Env,
  Profile,
  ProfileSearchHit,
  ResolveProfileResponse,
} from "../types";
import {
  getPublicKeyForNameTakenKey,
  getOwnedNftWithImage,
  getProfileKey,
  secp256k1PublicKeyToBech32Address,
} from "../utils";

export const resolveProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: ResolveProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    });

  const bech32Prefix = request.params?.bech32Prefix?.trim();
  if (!bech32Prefix) {
    return respond(400, {
      error: "Invalid request",
      message: "Missing bech32Prefix.",
    });
  }

  const name = request.params?.name?.trim();
  if (!name) {
    return respond(400, {
      error: "Invalid request",
      message: "Missing name.",
    });
  }

  try {
    let resolved: ProfileSearchHit | null = null;

    const publicKey = await env.PROFILES.get(getPublicKeyForNameTakenKey(name));
    const profile = publicKey
      ? await env.PROFILES.get<Profile>(getProfileKey(publicKey), "json")
      : undefined;

    const nft =
      profile?.nft && publicKey
        ? await getOwnedNftWithImage(env, publicKey, profile.nft)
        : null;

    if (profile && publicKey) {
      const profileWithoutNonce: Omit<Profile, "nonce"> &
        Pick<Partial<Profile>, "nonce"> = {
        ...profile,
      };
      delete profileWithoutNonce.nonce;

      resolved = {
        publicKey,
        address: secp256k1PublicKeyToBech32Address(publicKey, bech32Prefix),
        profile: {
          ...profileWithoutNonce,
          nft,
        },
      };
    }

    return respond(200, {
      resolved,
    });
  } catch (err) {
    console.error("Profile retrieval for search", err);

    return respond(500, {
      error: "Failed to retrieve profile for search",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }
};
