import { fromHex, toBech32 } from '@cosmjs/encoding'

import { PublicKey, PublicKeyJson } from '../types'

export abstract class PublicKeyBase implements PublicKey {
  static type: string

  constructor(public readonly hex: string) {}

  abstract get type(): string
  abstract get addressHex(): string

  abstract verifySignature(
    message: Uint8Array,
    base64DerSignature: string
  ): Promise<boolean>

  get json(): PublicKeyJson {
    return {
      type: this.type,
      hex: this.hex,
    }
  }

  getBech32Address(bech32Prefix: string): string {
    return toBech32(bech32Prefix, fromHex(this.addressHex))
  }

  static publicKeysEqual(a: PublicKeyJson, b: PublicKeyJson): boolean {
    return a.type === b.type && a.hex === b.hex
  }
}
