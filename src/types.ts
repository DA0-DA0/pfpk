import { Request as IttyRequest } from "itty-router";

// Cloudflare Worker bindings.
export interface Env {
  PROFILES: KVNamespace;

  // Secrets.
  INDEXER_API_KEY: string;
}

// Stored in KV and included in the POST body when updating a profile.
export interface Profile {
  nonce: number;
  name: string | null;
  nft: ProfileNft | null;
}

export interface ProfileNft {
  chainId: string;
  collectionAddress: string;
  tokenId: string;
}

export interface ProfileNftWithImage extends ProfileNft {
  imageUrl: string;
}

export type ProfileWithImage = Omit<Profile, "nft"> & {
  nft: ProfileNftWithImage | null;
};

// Body of fetch profile response.
export type FetchProfileResponse =
  // Add imageUrl to response so frontend doesn't have to look it up.
  | ProfileWithImage
  | {
      error: string;
      message?: string;
    };

// Body of profile update request.
export interface UpdateProfileRequest {
  // Allow Partial updates to profile, but require nonce.
  profile: Partial<Omit<Profile, "nonce">> & Pick<Profile, "nonce">;
}

// Body of profile update response.
export type UpdateProfileResponse =
  | {
      success: true;
    }
  | {
      error: string;
      message: string;
    };

// Throws NotOwnerError if wallet does not own NFT or other more specific errors
// if failed to retrieve image data.
export type GetOwnedNftImageUrlFunction = (
  env: Env,
  publicKey: string,
  collectionAddress: string,
  tokenId: string
) => Promise<string | undefined>;

export type ProfileSearchHit = {
  publicKey: string;
  address: string;
  profile: Omit<ProfileWithImage, "nonce">;
};

export type SearchProfilesResponse =
  | {
      profiles: ProfileSearchHit[];
    }
  | {
      error: string;
      message: string;
    };

export type ResolveProfileResponse =
  | {
      resolved: ProfileSearchHit | null;
    }
  | {
      error: string;
      message: string;
    };

export interface Auth {
  type: string;
  nonce: number;
  chainId: string;
  chainFeeDenom: string;
  chainBech32Prefix: string;
  publicKey: string;
}

export type RequestBody<
  Data extends Record<string, unknown> = Record<string, any>
> = {
  data: {
    auth: Auth
  } & Data
  signature: string
}

export type AuthorizedRequest<
  Data extends Record<string, any> = Record<string, any>
> = IttyRequest & {
  parsedBody: RequestBody<Data>
}
