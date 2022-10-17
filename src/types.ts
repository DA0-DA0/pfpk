// Cloudflare Worker bindings.
export interface Env {
  PROFILES: KVNamespace;
}

// Stored in KV and included in the POST body when updating a profile.
export interface Profile {
  nonce: number;
  name: string | null;
  nft: ProfileNft | null;
}

export interface ProfileNft {
  chainId: string;
  tokenId: string;
  collectionAddress: string;
}

// Body of fetch profile response.
export type FetchProfileResponse =
  | (Omit<Profile, "nft"> & {
      // Add imageUrl to response so frontend doesn't have to look it up.
      nft: (ProfileNft & { imageUrl: string }) | null;
    })
  | {
      error: string;
      message?: string;
    };

// Body of profile update request.
export interface UpdateProfileRequest {
  // Allow Partial updates to profile, but require nonce.
  profile: Partial<Omit<Profile, "nonce">> & Pick<Profile, "nonce">;
  signature: string;
  signer: string;
}

// Body of profile update response.
export type UpdateProfileResponse =
  | {
      success: true;
    }
  | {
      error: string;
      message?: string;
    };

// Throws NotOwnerError if wallet does not own NFT or other more specific errors
// if failed to retrieve image data.
export type GetOwnedNftImageUrlFunction = (
  publicKey: string,
  collectionAddress: string,
  tokenId: string
) => Promise<string | undefined>;
