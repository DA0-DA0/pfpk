import { CosmosSecp256k1PublicKey } from './CosmosSecp256k1PublicKey'
import { InjectiveEthSecp256k1 } from './InjectiveEthSecp256k1'
import { PublicKey, PublicKeyJson } from '../types'
import { KnownError } from '../utils'

export * from './PublicKeyBase'

export const PublicKeys = [
  CosmosSecp256k1PublicKey,
  InjectiveEthSecp256k1,
] as const

export const makePublicKey = (
  type: string,
  publicKeyHex: string
): PublicKey => {
  const PublicKeyClass = PublicKeys.find((publicKey) => publicKey.type === type)
  if (!PublicKeyClass) {
    throw new KnownError(400, 'Unsupported public key type: ' + type)
  }

  return new PublicKeyClass(publicKeyHex)
}

export const makePublicKeyFromJson = (json: PublicKeyJson): PublicKey =>
  makePublicKey(json.type, json.hex)
