import { makeSignDoc, serializeSignDoc } from '@cosmjs/amino'
import { keccak256 } from '@cosmjs/crypto'
import { fromBase64, toBech32 } from '@cosmjs/encoding'
import secp256k1 from 'secp256k1'

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
  const getMessage = (signer: string): Uint8Array =>
    serializeSignDoc(
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

  // Injective uses different address derivation and signature verification.
  if (data.auth.chainId === 'injective-1') {
    try {
      // https://github.com/InjectiveLabs/injective-ts/blob/5f44b7796441749711c170bf3ebdcbed2664bb5a/packages/sdk-ts/src/core/accounts/PublicKey.ts#L67-L84
      const decompressed = injectiveDecompressPubKey(data.auth.publicKey)
      const addressBuffer = Buffer.from(
        keccak256(Buffer.from(decompressed, 'hex'))
      ).subarray(-20)

      const signer = toBech32(data.auth.chainBech32Prefix, addressBuffer)
      const message = getMessage(signer)

      return secp256k1.ecdsaVerify(
        fromBase64(signature),
        keccak256(message),
        Buffer.from(data.auth.publicKey, 'hex')
      )
    } catch (err) {
      console.error('Injective signature verification', err)
      return false
    }
  }

  try {
    const signer = secp256k1PublicKeyToBech32Address(
      data.auth.publicKey,
      data.auth.chainBech32Prefix
    )
    const message = getMessage(signer)

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

// https://github.com/InjectiveLabs/injective-ts/blob/6e25b3f156d964666db8bc7885df653166aac523/packages/sdk-ts/src/utils/crypto.ts#L70-L84
const injectiveDecompressPubKey = (startsWith02Or03: string) => {
  // if already decompressed an not has trailing 04
  const testBuffer = Buffer.from(startsWith02Or03, 'hex')

  if (testBuffer.length === 64) startsWith02Or03 = '04' + startsWith02Or03

  let decompressed = Buffer.from(
    secp256k1.publicKeyConvert(Buffer.from(startsWith02Or03, 'hex'), false)
  ).toString('hex')

  // remove trailing 04
  decompressed = decompressed.substring(2)

  return decompressed
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
