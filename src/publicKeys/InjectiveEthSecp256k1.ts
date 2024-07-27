import { keccak256 } from '@cosmjs/crypto'
import { fromBase64, fromHex } from '@cosmjs/encoding'
import secp256k1 from 'secp256k1'

import { PublicKeyBase } from './PublicKeyBase'

export class InjectiveEthSecp256k1 extends PublicKeyBase {
  static type = '/injective.crypto.v1beta1.ethsecp256k1.PubKey'

  get type(): string {
    return InjectiveEthSecp256k1.type
  }

  // https://github.com/InjectiveLabs/injective-ts/blob/5f44b7796441749711c170bf3ebdcbed2664bb5a/packages/sdk-ts/src/core/accounts/PublicKey.ts#L67-L84
  get addressHex(): string {
    const decompressed = injectiveDecompressPubKey(this.hex)
    const addressBuffer = Buffer.from(
      keccak256(fromHex(decompressed))
    ).subarray(-20)
    return addressBuffer.toString('hex')
  }

  async verifySignature(
    message: Uint8Array,
    base64DerSignature: string
  ): Promise<boolean> {
    return secp256k1.ecdsaVerify(
      fromBase64(base64DerSignature),
      keccak256(message),
      fromHex(this.hex)
    )
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
