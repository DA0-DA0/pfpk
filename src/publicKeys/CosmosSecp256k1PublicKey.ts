import { Secp256k1, Secp256k1Signature } from '@cosmjs/crypto'
import { fromBase64, fromHex } from '@cosmjs/encoding'
import CryptoJS from 'crypto-js'

import { PublicKeyBase } from './PublicKeyBase'

export class CosmosSecp256k1PublicKey extends PublicKeyBase {
  static type = '/cosmos.crypto.secp256k1.PubKey'

  get type(): string {
    return CosmosSecp256k1PublicKey.type
  }

  // https://github.com/cosmos/cosmos-sdk/blob/e09516f4795c637ab12b30bf732ce5d86da78424/crypto/keys/secp256k1/secp256k1.go#L152-L162
  get addressHex(): string {
    // Cosmos SDK generates address data using RIPEMD160(SHA256(pubkey)).
    const sha256Hash = CryptoJS.SHA256(
      // The `create` function is incorrectly typed to only take a `number[]`
      // type. It can also handle a `Uint8Array` type. Simply converting using
      // `Array.from` does not work because the `WordArray.create` function
      // recognizes that the bytes need to be combined into words when a
      // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
      // type as individual words (i.e. 4-byte numbers) and does not properly
      // combine them.
      CryptoJS.lib.WordArray.create(fromHex(this.hex) as any)
    )
    const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash)

    // Output Bech32 data.
    const bech32Hash = ripemd160Hash.toString(CryptoJS.enc.Hex)
    return bech32Hash
  }

  async verifySignature(
    message: Uint8Array,
    base64DerSignature: string
  ): Promise<boolean> {
    const signature = Secp256k1Signature.fromFixedLength(
      fromBase64(base64DerSignature)
    )

    const messageHash = fromHex(
      CryptoJS.SHA256(
        // The `create` function is incorrectly typed to only take a `number[]`
        // type. It can also handle a `Uint8Array` type. Simply converting using
        // `Array.from` does not work because the `WordArray.create` function
        // recognizes that the bytes need to be combined into words when a
        // `Uint8Array` is passed. Conversely, it treats elements in a
        // `number[]` type as individual words (i.e. 4-byte numbers) and does
        // not properly combine them.
        CryptoJS.lib.WordArray.create(message as any)
      ).toString(CryptoJS.enc.Hex)
    )

    return await Secp256k1.verifySignature(
      signature,
      messageHash,
      fromHex(this.hex)
    )
  }
}
