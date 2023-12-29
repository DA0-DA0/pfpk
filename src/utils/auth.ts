import { serializeSignDoc, makeSignDoc } from "@cosmjs/amino";
import {
  secp256k1PublicKeyToBech32Address,
  verifySecp256k1Signature,
} from "./crypto";
import { AuthorizedRequest, Env, RequestBody } from "../types";
import { objectMatchesStructure } from "./objectMatchesStructure";
import { respondError } from "./error";

// Verify signature.
export const verifySignature = async ({
  data,
  signature,
}: RequestBody): Promise<boolean> => {
  try {
    const signer = secp256k1PublicKeyToBech32Address(
      data.auth.publicKey,
      data.auth.chainBech32Prefix
    );
    const message = serializeSignDoc(
      makeSignDoc(
        [
          {
            type: data.auth.type,
            value: {
              signer,
              data: JSON.stringify(data, undefined, 2),
            },
          },
        ],
        {
          gas: "0",
          amount: [
            {
              denom: data.auth.chainFeeDenom,
              amount: "0",
            },
          ],
        },
        data.auth.chainId,
        "",
        0,
        0
      )
    );

    return await verifySecp256k1Signature(
      data.auth.publicKey,
      message,
      signature
    );
  } catch (err) {
    console.error("Signature verification", err);
    return false;
  }
};

// Middleware to protect routes with the above function. If it does not return,
// the request is authorized. If successful, the `parsedBody` field will be set
// on the request object, accessible by successive middleware and route
// handlers.
export const authMiddleware = async (
  request: AuthorizedRequest,
  env: Env
): Promise<Response | void> => {
  try {
    const parsedBody: RequestBody = await request.json?.();

    if (
      // Validate body has at least the auth fields we need.
      !objectMatchesStructure(parsedBody, {
        data: {
          auth: {
            type: {},
            nonce: {},
            chainId: {},
            chainFeeDenom: {},
            chainBech32Prefix: {},
            publicKey: {},
          },
        },
        signature: {},
      })
    ) {
      return respondError(400, "Invalid body");
    }

    // Validate signature.
    if (!(await verifySignature(parsedBody))) {
      throw respondError(401, "Unauthorized. Invalid signature.");
    }

    // If all is valid, add parsed body to request and do not return to allow
    // continuing.
    request.parsedBody = parsedBody;
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }

    // Rethrow err to be caught by global error handler.
    throw err;
  }
};
