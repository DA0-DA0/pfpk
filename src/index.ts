import { serializeSignDoc } from "@cosmjs/amino";
import { toBase64, toUtf8 } from "@cosmjs/encoding";
import { createCors } from "itty-cors";
import { Router } from "itty-router";
import { getOwnedNftImageUrl } from "./chains";
import {
  Profile,
  FetchProfileResponse,
  UpdateProfileResponse,
  UpdateProfileRequest,
  Env,
  VerificationError,
} from "./types";
import { verifySecp256k1Signature } from "./utils";

const EMPTY_PROFILE = {
  nonce: 0,
  name: null,
  nft: null,
};

const getNameTakenKey = (name: string) => `nameTaken:${name}`;
const NAME_TAKEN_VALUE = "1";

// Create CORS handlers.
const { preflight, corsify } = createCors({
  methods: ["GET", "POST"],
  origins: ["*"],
  maxAge: 3600,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  },
});

const router = Router();

// Handle CORS preflight OPTIONS request.
router.options("*", preflight);

// Fetch profile.
router.get("/:publicKey", async (request, env: Env) => {
  const respond = (status: number, response: FetchProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    });

  const publicKey = request.params?.publicKey?.trim();
  if (!publicKey) {
    return respond(400, { error: "Missing publicKey." });
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
      error: "Failed to retrieve or parse profile.",
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
  // it.
  let chainNftImageUrl;
  try {
    chainNftImageUrl = await getOwnedNftImageUrl(
      nft.chainId,
      publicKey,
      nft.collectionAddress,
      nft.tokenId
    );
  } catch (err) {
    if (err instanceof VerificationError) {
      return respond(400, err.responseJson);
    }

    return respond(500, {
      error: "Unexpected verification error.",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // If found NFT, add to response.
  if (chainNftImageUrl) {
    response.nft = {
      chainId: nft.chainId,
      collectionAddress: nft.collectionAddress,
      tokenId: nft.tokenId,
      imageUrl: chainNftImageUrl,
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
});

// Update profile.
router.post("/:publicKey", async (request, env: Env) => {
  const respond = (status: number, response: UpdateProfileResponse) =>
    new Response(JSON.stringify(response), {
      status,
    });

  const publicKey = request.params?.publicKey?.trim();
  if (!publicKey) {
    return respond(400, { error: "Missing publicKey." });
  }

  let requestBody: UpdateProfileRequest;
  try {
    requestBody = await request.json?.();
    // Validate body.
    if (!requestBody) {
      throw new Error("Missing.");
    }
    if (!("profile" in requestBody)) {
      throw new Error("Missing profile.");
    }
    if (!requestBody.profile || !("nonce" in requestBody.profile)) {
      throw new Error("Missing profile.nonce.");
    }
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
    if (!("signature" in requestBody)) {
      throw new Error("Missing signature.");
    }
    if (!("signer" in requestBody)) {
      throw new Error("Missing signer.");
    }
  } catch (err) {
    console.error("Parsing request body", err);

    return respond(400, {
      error: "Invalid body.",
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
      error: "Failed to retrieve or parse existing profile.",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Validate nonce to prevent replay attacks.
  if (requestBody.profile.nonce !== existingProfile.nonce) {
    return respond(401, {
      error: `Invalid nonce. Expected: ${existingProfile.nonce}`,
    });
  }

  try {
    // Verify signature. (`requestBody.profile` contains `nonce`)
    // https://github.com/chainapsis/keplr-wallet/blob/54aaaf6112d41944eaf23826db823eb044b09e78/packages/provider/src/core.ts#L329-L349
    const message = serializeSignDoc({
      chain_id: "",
      account_number: "0",
      sequence: "0",
      fee: {
        gas: "0",
        amount: [],
      },
      msgs: [
        {
          type: "sign/MsgSignData",
          value: {
            signer: requestBody.signer,
            data: toBase64(toUtf8(JSON.stringify(requestBody.profile))),
          },
        },
      ],
      memo: "",
    });
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
      error: "Signature verification failed.",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  // Normalize name to prevent impersonation via whitespace.
  const normalizedName =
    requestBody.profile.name && requestBody.profile.name.trim();

  // If setting name, verify unique.
  if (typeof normalizedName === "string") {
    try {
      const nameTaken =
        (await env.PROFILES.get(getNameTakenKey(normalizedName))) ===
        NAME_TAKEN_VALUE;
      if (nameTaken) {
        return respond(500, {
          error: "Name already exists.",
        });
      }
    } catch (err) {
      console.error("Name uniqueness retrieval", err);

      return respond(500, {
        error: "Failed to check name uniqueness.",
        message: err instanceof Error ? err.message : `${err}`,
      });
    }
  }

  // If setting NFT, verify it belongs to the public key.
  if (requestBody.profile.nft) {
    try {
      if (
        !(await getOwnedNftImageUrl(
          requestBody.profile.nft.chainId,
          publicKey,
          requestBody.profile.nft.collectionAddress,
          requestBody.profile.nft.tokenId
        ))
      ) {
        throw new VerificationError(
          401,
          "Unauthorized.",
          "You do not own this NFT."
        );
      }
    } catch (err) {
      if (err instanceof VerificationError) {
        return respond(err.statusCode, err.responseJson);
      }

      return respond(500, {
        error: "Unexpected ownership verification error.",
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
    // If setting new name, save name taken.
    if (profile.name && profile.name !== existingProfile.name) {
      await env.PROFILES.put(getNameTakenKey(profile.name), NAME_TAKEN_VALUE);
    }

    // Save new profile.
    await env.PROFILES.put(publicKey, JSON.stringify(profile));

    // If profile had name set, unset taken.
    if (existingProfile.name) {
      await env.PROFILES.delete(getNameTakenKey(existingProfile.name));
    }
  } catch (err) {
    console.error("Profile save", err);

    return respond(500, {
      error: "Failed to save profile.",
      message: err instanceof Error ? err.message : `${err}`,
    });
  }

  return respond(200, { success: true });
});

// 404
router.all("*", () => new Response("404", { status: 404 }));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .handle(request, env)
      .catch(
        (err) =>
          new Response(
            JSON.stringify({
              error: "Unknown",
              message: err instanceof Error ? err.message : `${err}`,
            }),
            {
              status: 500,
            }
          )
      )
      .then(corsify);
  },
};
