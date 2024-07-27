import { Request as IttyRequest } from 'itty-router'

// Cloudflare Worker bindings.
export type Env = {
  PROFILES: KVNamespace
  DB: D1Database

  // Secrets.
  INDEXER_API_KEY: string
}

/**
 * Profile used when updating/saving.
 */
export type UpdateProfile = {
  /**
   * Next profile nonce.
   */
  nonce: number
  /**
   * Profile name.
   */
  name: string | null
  /**
   * Profile NFT.
   */
  nft: ProfileNft | null
}

/**
 * Profile used when fetching directly.
 */
export type FetchedProfile = {
  /**
   * Unique ID. If no profile set, this will be empty.
   */
  uuid: string
  /**
   * Next profile nonce.
   */
  nonce: number
  /**
   * Profile name.
   */
  name: string | null
  /**
   * Profile NFT with image loaded.
   */
  nft: ProfileNftWithImage | null
  /**
   * Map of chain ID to public key and address.
   */
  chains: Record<
    string,
    {
      publicKey: PublicKeyJson
      address: string
    }
  >
}

/**
 * Profile used when searching/resolving by name on a specific chain.
 */
export type ResolvedProfile = {
  /**
   * Unique ID.
   */
  uuid: string
  /**
   * Profile public key for this chain.
   */
  publicKey: PublicKeyJson
  /**
   * Profile address for this chain.
   */
  address: string
  /**
   * Profile name.
   */
  name: string | null
  /**
   * Profile NFT with image loaded.
   */
  nft: ProfileNftWithImage | null
}

export type UpdateProfileWithId = UpdateProfile & { id: number }

export type ProfileNft = {
  chainId: string
  collectionAddress: string
  tokenId: string
}

export type ProfileNftWithImage = ProfileNft & {
  imageUrl: string
}

// Body of fetch profile response.
export type FetchProfileResponse =
  | FetchedProfile
  | {
      error: string
    }

// Body of profile update request.
export type UpdateProfileRequest = {
  // Allow partial updates to profile, but require nonce.
  profile: Partial<Omit<UpdateProfile, 'nonce'>> & Pick<UpdateProfile, 'nonce'>
  // Optionally use the current public key as the preference for these chains.
  // If undefined, defaults to the chain used to sign this request on profile
  // creation.
  chainIds?: string[]
}

// Body of profile update response.
export type UpdateProfileResponse =
  | {
      success: true
    }
  | {
      error: string
    }

// Body of register public key request.
export type RegisterPublicKeyRequest = {
  // List of public key authorizations that allow this public key to register.
  publicKeys: RequestBody<{
    // Public key hex that is allowed to register this public key.
    allow: string
    // Optionally use this public key as the preference for chains. If
    // undefined, no preferences set.
    chainIds?: string[]
  }>[]
}

// Body of register public key response.
export type RegisterPublicKeyResponse =
  | {
      success: true
    }
  | {
      error: string
    }

// Body of unregister public key request.
export type UnregisterPublicKeyRequest = {
  publicKeys: PublicKeyJson[]
}

// Body of unregister public key response.
export type UnregisterPublicKeyResponse =
  | {
      success: true
    }
  | {
      error: string
    }

// Throws NotOwnerError if wallet does not own NFT or other more specific errors
// if failed to retrieve image data.
export type GetOwnedNftImageUrlFunction = (
  env: Env,
  publicKey: PublicKey,
  collectionAddress: string,
  tokenId: string
) => Promise<string | undefined>

export type SearchProfilesResponse =
  | {
      profiles: ResolvedProfile[]
    }
  | {
      error: string
    }

export type ResolveProfileResponse =
  | {
      resolved: ResolvedProfile
    }
  | {
      error: string
    }

export type Auth = {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKeyType: string
  publicKeyHex: string
}

export type RequestBody<
  Data extends Record<string, unknown> = Record<string, any>,
> = {
  data: {
    auth: Auth
  } & Data
  signature: string
}

export type AuthorizedRequest<
  Data extends Record<string, any> = Record<string, any>,
> = IttyRequest & {
  parsedBody: RequestBody<Data>
  publicKey: PublicKey
}

/**
 * Profile database row.
 */
export type DbRowProfile = {
  id: number
  uuid: string
  nonce: number
  name: string | null
  nftChainId: string | null
  nftCollectionAddress: string | null
  nftTokenId: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Profile public key database row.
 */
export type DbRowProfilePublicKey = {
  id: number
  profileId: number
  type: string
  publicKeyHex: string
  addressHex: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Profile public key chain preference database row.
 */
export type DbRowProfilePublicKeyChainPreference = {
  id: number
  profileId: number
  profilePublicKeyId: number
  chainId: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Known public key types.
 */
export enum PublicKeyType {
  CosmosSecp256k1 = '/cosmos.crypto.secp256k1.PubKey',
  InjectiveEthSecp256k1 = '/injective.crypto.v1beta1.ethsecp256k1.PubKey',
}

export type PublicKeyJson = {
  /**
   * Type of public key.
   */
  type: string
  /**
   * Public key data hexstring.
   */
  hex: string
}

export interface PublicKey extends PublicKeyJson {
  /**
   * Address data hexstring.
   */
  addressHex: string
  /**
   * JSON representation of public key data.
   */
  json: PublicKeyJson

  getBech32Address(bech32Prefix: string): string
  verifySignature(
    message: Uint8Array,
    base64DerSignature: string
  ): Promise<boolean>
}
