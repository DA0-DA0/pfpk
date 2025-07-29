import { IRequestStrict } from 'itty-router'

/**
 * Profile used when updating/saving.
 */
export type ProfileUpdate = Partial<{
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
}>

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

export type ProfileNft = {
  chainId: string
  collectionAddress: string
  tokenId: string
}

export type ProfileNftWithImage = ProfileNft & {
  imageUrl: string
}

export type NonceResponse = {
  nonce: number
}

export type StatsResponse = {
  total: number
}

// Body of fetch profile response.
export type FetchProfileResponse = FetchedProfile

// Body of profile update request.
export type UpdateProfileRequest = {
  /**
   * Allow partial updates to profile.
   */
  profile: Omit<ProfileUpdate, 'nonce'>
  /**
   * Optionally use the current public key as the preference for these chains.
   * If undefined, defaults to the chain used to sign this request on profile
   * creation.
   */
  chainIds?: string[]
}

// Body of register public keys request.
export type RegisterPublicKeysRequest = {
  /**
   * List of public key authorizations to register.
   */
  publicKeys: RequestBody<
    {
      /**
       * Profile UUID or public key that is allowed to register this public key.
       */
      allow:
        | {
            uuid: string
          }
        | {
            publicKey: PublicKeyJson
          }
      /**
       * Optionally use this public key as the preference for certain chains. If
       * undefined, no preferences set.
       */
      chainIds?: string[]
    },
    true
  >[]
}

// Body of unregister public keys request.
export type UnregisterPublicKeysRequest = {
  publicKeys: PublicKeyJson[]
}

export type InvalidateTokensRequest = {
  /**
   * Token IDs to invalidate. If not provided, only expired tokens will be
   * invalidated.
   */
  tokens?: string[]
}

export type TokenJson = {
  id: string
  name: string | null
  audience: string[] | null
  role: string | null
  issuedAt: number
  expiresAt: number
}

export type FetchTokensResponse = {
  tokens: TokenJson[]
}

export type ErrorResponse = {
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

export type SearchProfilesResponse = {
  profiles: ResolvedProfile[]
}

export type ResolveProfileResponse = {
  resolved: ResolvedProfile
}

export type CreateTokensRequest = {
  /**
   * If not provided, or if an empty array, a single token will be created.
   */
  tokens?: {
    name?: string
    audience?: string[]
    role?: string
  }[]
}

export type CreateTokensResponse = {
  tokens: {
    id: string
    token: string
    name: string | null
    audience: string[] | null
    role: string | null
    issuedAt: number
    expiresAt: number
  }[]
}

export type FetchAuthenticatedResponse = {
  uuid: string
}

export type JwtTokenRequirements = {
  /**
   * Optionally verify the token contains at least one of the audiences. If
   * `current` is provided, the audience must be the current domain.
   */
  audience?: 'current' | string[]
  /**
   * Optionally verify the token contains at least one of the roles.
   */
  role?: string[]
}

export type Auth = {
  /**
   * Timestamp must be within the last 5 minutes.
   */
  timestamp: number
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: PublicKeyJson
}

export type RequestBody<
  Data extends Record<string, unknown> = Record<string, any>,
  /**
   * Whether or not the request body requires authentication.
   */
  RequireAuth extends boolean = boolean,
> = {
  data: (RequireAuth extends true
    ? {
        /**
         * Authentication data that must be provided.
         */
        auth: Auth
      }
    : {
        /**
         * Authentication data. Only set if the request is authenticated via:
         * 1. wallet signature.
         * 2. JWT token AND EITHER the public key auth provided matches the
         *    profile of the JWT token.
         *
         * If `auth` is sent in the body when using a JWT token, and it doesn't
         * match the profile, it will be stripped since it is untrusted. This is the
         * same as the `publicKey` field in the authorized request object.
         */
        auth?: Auth
      }) &
    Data
  /**
   * Signature of the `data` field using ADR-036 (see `verifySignature` in
   * `auth.ts`).
   *
   * If not provided, a valid JWT bearer token must be provided via the
   * `Authorization` header for the profile associated with the public key used
   * in the `data.auth` field.
   */
  signature?: string
}

export type AuthorizedRequest<
  Data extends Record<string, any> = Record<string, any>,
> = IRequestStrict & {
  /**
   * Validated request body.
   */
  validatedBody: RequestBody<Data>
  /**
   * Authorized profile, before nonce is incremented (if at all). The nonce is
   * incremented in the DB, but if request handlers need to access the nonce,
   * they want the nonce before the increment.
   */
  profile: DbRowProfile
  /**
   * Public key provided in the `data.auth` field. Only set if the request is
   * authenticated via:
   * 1. wallet signature.
   * 2. JWT token AND a public key was provided that matches the profile of the
   *    JWT token.
   *
   * This is the same as the `data.auth` field in the request body, since this
   * public key is generated after `data.auth` is validated.
   */
  publicKey?: PublicKey
  /**
   * The DB row ID of the profile public key. This will be set if `publicKey` is
   * set.
   */
  profilePublicKeyRowId?: number
  /**
   * The decoded JWT payload if the request is authenticated via JWT token auth.
   */
  jwtPayload?: JwtPayload
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
  updatedAt: number
}

/**
 * Profile public key chain preference database row.
 */
export type DbRowProfilePublicKeyChainPreference = {
  id: number
  profileId: number
  profilePublicKeyId: number
  chainId: string
}

export type DbRowProfileToken = {
  id: number
  profileId: number
  uuid: string
  name: string | null
  /**
   * JSON array of strings.
   */
  audience: string | null
  role: string | null
  expiresAt: number
  createdAt: number
}

export type JwtPayload = {
  sub: string
  aud?: string[]
  exp: number
  iat: number
  jti: string
  role?: string
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
