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

export interface Nft {
  collectionAddress: string;
  tokenId: string;
  imageUrl: string;
}

// Returns null if wallet does not own NFT or image could not be found.
export type GetOwnedNftImageUrlFunction = (
  publicKey: string,
  collectionAddress: string,
  tokenId: string
) => Promise<string | null>;

export class VerificationError extends Error {
  errorString?: string;

  constructor(public statusCode: number, public label: string, error?: unknown) {
    super(label);
    this.name = "VerificationError";
    if (error) {
      this.errorString = error instanceof Error ? error.message : `${error}`;
    }
  }

  get responseJson() {
    return {
      error: this.label,
      ...(this.errorString && {
        message: this.errorString,
      }),
    };
  }
}
