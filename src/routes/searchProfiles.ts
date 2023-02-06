import { Request, RouteHandler } from "itty-router";
import {
  Env,
  Profile,
  ProfileSearchHit,
  SearchProfilesResponse,
} from "../types";
import {
  getNameTakenKey,
  getOwnedNftWithImage,
  getProfileKey,
  secp256k1PublicKeyToBech32Address,
} from "../utils";

export const searchProfiles: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: SearchProfilesResponse) =>
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

  const namePrefix = request.params?.namePrefix?.trim();
  if (!namePrefix) {
    return respond(400, {
      error: "Invalid request",
      message: "Missing namePrefix.",
    });
  }
  if (namePrefix.length < 3) {
    return respond(400, {
      error: "Invalid request",
      message: "Name prefix must be at least 3 characters.",
    });
  }

  try {
    // Get 5
    const profileKeys = (
      await env.PROFILES.list<Profile>({
        limit: 5,
        prefix: getNameTakenKey(namePrefix),
      })
    ).keys;

    const profiles = (
      await Promise.all(
        profileKeys.map(async ({ name }) => {
          const publicKey = await env.PROFILES.get(name);
          const profile = publicKey
            ? await env.PROFILES.get<Profile>(getProfileKey(publicKey), "json")
            : undefined;

          const nft =
            profile?.nft && publicKey
              ? await getOwnedNftWithImage(env, publicKey, profile.nft)
              : null;
          
          if (profile && publicKey) {
            const profileWithoutNonce: Omit<Profile, 'nonce'> & Pick<Partial<Profile>, 'nonce'> = {
              ...profile,
            };
            delete profileWithoutNonce.nonce;

            return {
              publicKey,
              address: secp256k1PublicKeyToBech32Address(
                publicKey,
                bech32Prefix
              ),
              profile: {
                ...profileWithoutNonce,
                nft,
              },
            }
          }
        })
      )
    ).filter((hit): hit is ProfileSearchHit => !!hit);

    return respond(200, {
      profiles,
    });
  } catch (err) {
    console.error("Profile retrieval for search", err);

    return respond(500, {
      error: "Failed to retrieve profile for search",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }
};
