import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'

import { KnownError } from './error'
import { objectMatchesStructure } from './objectMatchesStructure'
import { makePublicKey } from '../publicKeys'
import { AuthorizedRequest, PublicKey, RequestBody } from '../types'

// Middleware to protect routes with authentication. If it does not return, the
// request is authorized. If successful, the `parsedBody` field will be set on
// the request object, accessible by successive middleware and route handlers.
export const authMiddleware = async (
  request: AuthorizedRequest
): Promise<Response | void> => {
  try {
    const parsedBody: RequestBody = await request.json?.()

    // Verify body and add generated public key to request.
    request.publicKey = await verifyRequestBodyAndGetPublicKey(parsedBody)

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
 * Returns public key on success.
 */
export const verifyRequestBodyAndGetPublicKey = async (
  body: RequestBody
): Promise<PublicKey> => {
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
          publicKeyType: {},
          publicKeyHex: {},
        },
      },
      signature: {},
    })
  ) {
    throw new KnownError(400, 'Invalid auth body.')
  }

  // Validate public key.
  const publicKey = makePublicKey(
    body.data.auth.publicKeyType,
    body.data.auth.publicKeyHex
  )

  // Validate signature.
  if (!(await verifySignature(publicKey, body))) {
    throw new KnownError(401, 'Unauthorized. Invalid signature.')
  }

  return publicKey
}

// Verify signature.
export const verifySignature = async (
  publicKey: PublicKey,
  { data, signature }: RequestBody
): Promise<boolean> => {
  try {
    const signer = publicKey.getBech32Address(data.auth.chainBech32Prefix)

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

    return await publicKey.verifySignature(message, signature)
  } catch (err) {
    console.error('Signature verification', err)
    return false
  }
}
