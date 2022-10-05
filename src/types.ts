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

// Stargaze API NFT object.
// The Stargaze API returns more data. These are the only fields we care about.
export interface StargazeNft {
  image: string;
  tokenId: string;
  collection: {
    contractAddress: string;
  };
}

// Body of profile update request.
export interface UpdateProfileRequest {
  // Allow Partial updates to profile, but require nonce.
  profile: Partial<
    Omit<Profile, "nonce" | "nft"> & {
      // Do not require `nft.chainId`, since for now we only support Stargaze.
      nft: Omit<ProfileNft, "chainId"> | null;
    }
  > &
    Pick<Profile, "nonce">;
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
