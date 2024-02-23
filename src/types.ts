import { Request as IttyRequest } from 'itty-router'

// Cloudflare Worker bindings.
export interface Env {
  PROFILES: KVNamespace
  DB: D1Database

  // Secrets.
  INDEXER_API_KEY: string
}

// Stored in KV and included in the POST body when updating a profile.
export interface Profile {
  nonce: number
  name: string | null
  nft: ProfileNft | null
  /**
   * Map of chain ID to preferred public key for that chain.
   */
  chains?: Record<string, string>
}

export type ProfileWithId = Profile & { id: number }

export interface ProfileNft {
  chainId: string
  collectionAddress: string
  tokenId: string
}

export interface ProfileNftWithImage extends ProfileNft {
  imageUrl: string
}

export type ProfileWithImage = Omit<Profile, 'nft'> & {
  nft: ProfileNftWithImage | null
}

// Body of fetch profile response.
export type FetchProfileResponse =
  // Add imageUrl to response so frontend doesn't have to look it up.
  | ProfileWithImage
  | {
      error: string
    }

// Body of profile update request.
export type UpdateProfileRequest = {
  // Allow Partial updates to profile, but require nonce.
  profile: Partial<Omit<Profile, 'nonce'>> & Pick<Profile, 'nonce'>
  // Optionally use the current public key as the preference for these chains on
  // profile creation. If undefined, defaults to the chain used to sign this
  // request.
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
    // Public key that is allowed to register this public key.
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
  publicKeys: string[]
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
  publicKey: string,
  collectionAddress: string,
  tokenId: string
) => Promise<string | undefined>

export type ProfileSearchHit = {
  publicKey: string
  address: string
  profile: Omit<ProfileWithImage, 'nonce'>
}

export type SearchProfilesResponse =
  | {
      profiles: ProfileSearchHit[]
    }
  | {
      error: string
    }

export type ResolveProfileResponse =
  | {
      resolved: ProfileSearchHit | null
    }
  | {
      error: string
    }

export interface Auth {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: string
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
}

/**
 * Profile database row.
 */
export type DbRowProfile = {
  id: number
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
  publicKey: string
  bech32Hash: string
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
