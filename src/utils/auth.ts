import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'

import {
  secp256k1PublicKeyToBech32Address,
  verifySecp256k1Signature,
} from './crypto'
import { KnownError } from './error'
import { objectMatchesStructure } from './objectMatchesStructure'
import { AuthorizedRequest, RequestBody } from '../types'

// Verify signature.
export const verifySignature = async ({
  data,
  signature,
}: RequestBody): Promise<boolean> => {
  try {
    const signer = secp256k1PublicKeyToBech32Address(
      data.auth.publicKey,
      data.auth.chainBech32Prefix
    )
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
          gas: '0',
          amount: [
            {
              denom: data.auth.chainFeeDenom,
              amount: '0',
            },
          ],
        },
        data.auth.chainId,
        '',
        0,
        0
      )
    )

    return await verifySecp256k1Signature(
      data.auth.publicKey,
      message,
      signature
    )
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}

// Middleware to protect routes with authentication. If it does not return, the
// request is authorized. If successful, the `parsedBody` field will be set on
// the request object, accessible by successive middleware and route handlers.
export const authMiddleware = async (
  request: AuthorizedRequest
): Promise<Response | void> => {
  try {
    const parsedBody: RequestBody = await request.json?.()

    await verifyRequestBody(parsedBody)

    // If all is valid, add parsed body to request and do not return to allow
    // continuing.
    request.parsedBody = parsedBody
  } catch (err) {
    if (err instanceof Response) {
      return err
    }

    // Rethrow err to be caught by global error handler.
    throw err
  }
}

/**
 * Perform verification on a parsed request body. Throws error on failure.
 */
export const verifyRequestBody = async (body: RequestBody): Promise<void> => {
  if (
    // Validate body has at least the auth fields we need.
    !objectMatchesStructure(body, {
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
    throw new KnownError(400, 'Invalid auth body.')
  }

  // Validate signature.
  if (!(await verifySignature(body))) {
    throw new KnownError(401, 'Unauthorized. Invalid signature.')
  }
}
