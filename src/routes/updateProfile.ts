import { serializeSignDoc, makeSignDoc } from "@cosmjs/amino";
import { RouteHandler, Request } from "itty-router";
import { CHAINS, getOwnedNftImageUrl } from "../chains";
import { JUNO_CHAIN_ID } from "../constants";
import { KnownError, NotOwnerError } from "../error";
import {
  Env,
  UpdateProfileResponse,
  UpdateProfileRequest,
  Profile,
} from "../types";
import {
  EMPTY_PROFILE,
  getNameTakenKey,
  secp256k1PublicKeyToBech32Address,
  verifySecp256k1Signature,
} from "../utils";

export const updateProfile: RouteHandler<Request> = async (
  request,
  env: Env
) => {
  const respond = (status: number, response: UpdateProfileResponse) =>
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

  let requestBody: UpdateProfileRequest;
  try {
    requestBody = await request.json?.();
    // Validate body.
    if (!requestBody) {
      throw new Error("Missing.");
    }
    if (!("profile" in requestBody) || !requestBody.profile) {
      throw new Error("Missing profile.");
    }
    if (
      !("nonce" in requestBody.profile) ||
      typeof requestBody.profile.nonce !== "number"
    ) {
      throw new Error("Missing profile.nonce.");
    }
    // Only validate name if truthy, since it can be set to null to clear it.
    if (
      "name" in requestBody.profile &&
      typeof requestBody.profile.name === "string" &&
      requestBody.profile.name.trim().length === 0
    ) {
      throw new Error("Name cannot be empty.");
    }
    if (
      "name" in requestBody.profile &&
      typeof requestBody.profile.name === "string" &&
      requestBody.profile.name.trim().length > 32
    ) {
      throw new Error("Name cannot be longer than 32 characters.");
    }
    // Only validate NFT properties if truthy, since it can be set to null to
    // clear it.
    if (
      "nft" in requestBody.profile &&
      requestBody.profile.nft &&
      (!("chainId" in requestBody.profile.nft) ||
        !requestBody.profile.nft.chainId ||
        !("collectionAddress" in requestBody.profile.nft) ||
        !requestBody.profile.nft.collectionAddress ||
        !("tokenId" in requestBody.profile.nft) ||
        // tokenId could be an empty string, so only perform a typecheck here.
        typeof requestBody.profile.nft.tokenId !== "string")
    ) {
      throw new Error("NFT needs chainId, collectionAddress, and tokenId.");
    }
    // Validate chainId supported.
    if (
      "nft" in requestBody.profile &&
      requestBody.profile.nft &&
      (!("chainId" in requestBody.profile.nft) ||
        !requestBody.profile.nft.chainId ||
        !(requestBody.profile.nft.chainId in CHAINS))
    ) {
      throw new Error(
        `NFT's chainId must be one of: ${Object.keys(CHAINS).join(", ")}`
      );
    }
    if (!("signature" in requestBody)) {
      throw new Error("Missing signature.");
    }
  } catch (err) {
    console.error("Parsing request body", err);

    return respond(400, {
      error: "Invalid body",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Get existing profile.
  let existingProfile: Profile = { ...EMPTY_PROFILE };
  try {
    const stringifiedData = await env.PROFILES.get(publicKey);
    if (stringifiedData) {
      existingProfile = JSON.parse(stringifiedData);
    }
  } catch (err) {
    console.error("Profile retrieval or parsing", err);

    return respond(500, {
      error: "Failed to retrieve or parse existing profile",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Validate nonce to prevent replay attacks.
  if (requestBody.profile.nonce !== existingProfile.nonce) {
    return respond(401, {
      error: "Invalid body",
      message: `Invalid nonce. Expected: ${existingProfile.nonce}`,
    });
  }

  try {
    // Verify signature. (`requestBody.profile` contains `nonce`)
    const signer = secp256k1PublicKeyToBech32Address(publicKey, "juno");
    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: "PFPK Verification",
            value: {
              signer,
              data: JSON.stringify(requestBody.profile, undefined, 2),
            },
          },
        ],
        {
          gas: "0",
          amount: [
            {
              denom: "ujuno",
              amount: "0",
            },
          ],
        },
        JUNO_CHAIN_ID,
        "",
        0,
        0
      )
    );

    if (
      !(await verifySecp256k1Signature(
        publicKey,
        message,
        requestBody.signature
      ))
    ) {
      throw new Error("Invalid signature.");
    }
  } catch (err) {
    console.error("Signature verification", err);

    return respond(400, {
      error: "Signature verification failed",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Normalize name to prevent impersonation via whitespace.
  const normalizedName =
    requestBody.profile.name && requestBody.profile.name.trim();

  // If setting name, verify unique.
  if (typeof normalizedName === "string") {
    try {
      if (await env.PROFILES.get(getNameTakenKey(normalizedName))) {
        return respond(500, {
          error: "Invalid name",
          message: "Name already exists.",
        });
      }
    } catch (err) {
      console.error("Name uniqueness retrieval", err);

      return respond(500, {
        error: "Failed to check name uniqueness",
        message: err instanceof Error ? err.message : `${err}`,
      });
    }
  }

  // If setting NFT, verify it belongs to the public key.
  if (requestBody.profile.nft) {
    try {
      // Will throw error on ownership or image access error.
      const imageUrl = await getOwnedNftImageUrl(
        requestBody.profile.nft.chainId,
        publicKey,
        requestBody.profile.nft.collectionAddress,
        requestBody.profile.nft.tokenId
      );

      // If image is empty, cannot be used as profile picture.
      if (!imageUrl) {
        throw new KnownError(
          415,
          "Invalid NFT image",
          "Failed to retrieve image from NFT."
        );
      }
    } catch (err) {
      if (err instanceof NotOwnerError) {
        return respond(401, {
          error: "Unauthorized",
          message: "You do not own this NFT.",
        });
      }

      // If already handled, respond with specific error.
      if (err instanceof KnownError) {
        return respond(err.statusCode, err.responseJson);
      }

      return respond(500, {
        error: "Unexpected ownership verification error",
        message: err instanceof Error ? err.message : `${err}`,
      });
    }
  }

  const profile = { ...existingProfile };

  // Update fields with body data available. Both are nullable, so allow setting
  // to null or new value.
  if (normalizedName !== undefined) {
    profile.name = normalizedName;
  }
  if (requestBody.profile.nft !== undefined) {
    // Explicitly copy over values to prevent the user from setting whatever
    // values they want in this object.
    profile.nft = requestBody.profile.nft && {
      chainId: requestBody.profile.nft.chainId,
      tokenId: requestBody.profile.nft.tokenId,
      collectionAddress: requestBody.profile.nft.collectionAddress,
    };
  }
  // Increment nonce to prevent replay attacks.
  profile.nonce++;

  // Save.
  try {
    // If setting new name, set name taken to public key.
    if (profile.name && profile.name !== existingProfile.name) {
      await env.PROFILES.put(getNameTakenKey(profile.name), publicKey);

      // If profile had name previously set, unset previous name taken.
      if (existingProfile.name) {
        await env.PROFILES.delete(getNameTakenKey(existingProfile.name));
      }
    }

    // Save new profile.
    await env.PROFILES.put(publicKey, JSON.stringify(profile));
  } catch (err) {
    console.error("Profile save", err);

    return respond(500, {
      error: "Failed to save profile",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  return respond(200, { success: true });
};
