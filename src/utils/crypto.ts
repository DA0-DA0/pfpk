import { Secp256k1, Secp256k1Signature, keccak256 } from '@cosmjs/crypto'
import { fromBase64, fromHex, toBech32 } from '@cosmjs/encoding'
import CryptoJS from 'crypto-js'
import secp256k1 from 'secp256k1'

import { mustGetChain } from './chain'

// https://github.com/chainapsis/keplr-wallet/blob/088dc701ce14df77a1ee22b7e39c651e50879d9f/packages/crypto/src/key.ts#L56-L63
export const secp256k1PublicKeyToBech32HexHash = (
  hexPublicKey: string
): string => {
  // https://github.com/cosmos/cosmos-sdk/blob/e09516f4795c637ab12b30bf732ce5d86da78424/crypto/keys/secp256k1/secp256k1.go#L152-L162
  // Cosmos SDK generates address data using RIPEMD160(SHA256(pubkey)).
  const sha256Hash = CryptoJS.SHA256(
    // The `create` function is incorrectly typed to only take a `number[]`
    // type. It can also handle a `Uint8Array` type. Simply converting using
    // `Array.from` does not work because the `WordArray.create` function
    // recognizes that the bytes need to be combined into words when a
    // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
    // type as individual words (i.e. 4-byte numbers) and does not properly
    // combine them.
    CryptoJS.lib.WordArray.create(fromHex(hexPublicKey) as any)
  )
  const ripemd160Hash = CryptoJS.RIPEMD160(sha256Hash)

  // Output Bech32 data.
  const bech32Hash = ripemd160Hash.toString(CryptoJS.enc.Hex)
  return bech32Hash
}

export const bech32HashToAddress = (
  bech32Hash: string,
  bech32Prefix: string
): string => toBech32(bech32Prefix, fromHex(bech32Hash))

export const secp256k1PublicKeyToBech32Address = (
  hexPublicKey: string,
  bech32Prefix: string
): string => {
  const addressData = secp256k1PublicKeyToBech32HexHash(hexPublicKey)
  return bech32HashToAddress(addressData, bech32Prefix)
}

export const hexPublicKeyToBech32Address = (
  chainId: string,
  hexPublicKey: string
): string => {
  const { bech32_prefix: bech32Prefix } = mustGetChain(chainId)

  // Injective uses different address derivation and signature verification.
  if (chainId === 'injective-1') {
    // https://github.com/InjectiveLabs/injective-ts/blob/5f44b7796441749711c170bf3ebdcbed2664bb5a/packages/sdk-ts/src/core/accounts/PublicKey.ts#L67-L84
    const decompressed = injectiveDecompressPubKey(hexPublicKey)
    const addressBuffer = Buffer.from(
      keccak256(Buffer.from(decompressed, 'hex'))
    ).subarray(-20)
    return toBech32(bech32Prefix, addressBuffer)
  }

  return secp256k1PublicKeyToBech32Address(hexPublicKey, bech32Prefix)
}

export const verifySecp256k1Signature = async (
  hexPublicKey: string,
  message: Uint8Array,
  base64DerSignature: string
): Promise<boolean> => {
  const publicKeyData = fromHex(hexPublicKey)
  const signature = Secp256k1Signature.fromFixedLength(
    fromBase64(base64DerSignature)
  )

  const messageHash = fromHex(
    CryptoJS.SHA256(
      // The `create` function is incorrectly typed to only take a `number[]`
      // type. It can also handle a `Uint8Array` type. Simply converting using
      // `Array.from` does not work because the `WordArray.create` function
      // recognizes that the bytes need to be combined into words when a
      // `Uint8Array` is passed. Conversely, it treats elements in a `number[]`
      // type as individual words (i.e. 4-byte numbers) and does not properly
      // combine them.
      CryptoJS.lib.WordArray.create(message as any)
    ).toString(CryptoJS.enc.Hex)
  )

  return await Secp256k1.verifySignature(signature, messageHash, publicKeyData)
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
