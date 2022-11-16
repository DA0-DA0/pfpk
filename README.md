# pfpk

pic for private key. A [Cloudflare Worker](https://developers.cloudflare.com/workers) that allows associating a name and
[Stargaze](https://stargaze.zone) NFT with a given [Cosmos](https://cosmos.network) wallet / keypair.

## Setup

```
npm install -g wrangler
npm install
```

## Development

```
npm run dev
```

## Architecture

### `GET /:publicKey`

`publicKey` is the hexadecimal representation of a public key in the Cosmos.

The returned type is:

```ts
type FetchProfileResponse = {
  nonce: number;
  name: string | null;
  nft: {
    chainId: string;
    collectionAddress: string;
    tokenId: string;
    imageUrl: string;
  } | null;
};
```

or in the case of an error:

```ts
type FetchProfileResponse = {
  error: string;
  message: string;
};
```

This route checks if profile information has been set for the given public key,
verifies that the NFT is still owned by the public key, and verifies that the
NFT has an image URL set. If the public key no longer owns the NFT, or there
is no image URL set, the NFT is removed from the profile to prevent future
unnecessary checks.

The retrieval of the image URL depends on the chain:

- For Stargaze, it is fetched from the Stargaze API.
- For Juno, it queries the `nft_info` method on the smart contract of the NFT's
  `collectionAddress`. If `extension` is present, it checks for `image`,
  `image_uri`, and `image_url`, in that order. If any is present, it uses that
  one. If not, it tries to fetch the data located at the URL provided by the
  `token_uri` field. If this response is JSON, it assumes the data conforms to
  the [ERC721 Metadata JSON
  Schema](https://github.com/ethereum/EIPs/blob/master/EIPS/eip-721.md#specification)
  standard, and uses the `image` field from that response. If the response is
  not JSON, it just uses `token_uri` directly and hopes it is an image. Some
  NFTs use that field for the image, and not all servers set the correct
  mimetype headers (such as IPFS URLs that don't care about the contents of the
  data).

### `POST /:publicKey`

`publicKey` is the hexadecimal representation of a public key in the Cosmos.

The expected request body type is:

```ts
type UpdateProfileRequest = {
  profile: {
    nonce: number;
    name?: string | null;
    nft?: {
      chainId: string;
      collectionAddress: string;
      tokenId: string;
    } | null;
  };
  signature: string;
};
```

The returned type is:

```ts
type UpdateProfileResponse = {
  success: true;
};
```

or in the case of an error:

```ts
type UpdateProfileResponse = {
  error: string;
  message: string;
};
```

This route lets someone perform partial updates to their profile. If `name` or
`nft` is `null`, that field is cleared. If either is `undefined` or omitted,
nothing happens to that field.

The nonce from the latest GET request must be provided to prevent replay
attacks. It starts at 0, and the GET request will return an empty profile with a
nonce of 0 if nothing has been set. The name must be unique, at least 1
character long, and at most 32 characters long. The NFT must be owned by the
public key, and the signature must be made by the same public key. If the NFT
has no image, it will fail.

The signature is derived by calling `OfflineAminoSigner`'s `signAmino` function
with the `signDoc` argument generated using `makeSignDoc` from the
`@cosmjs/amino` package. This can be seen in the signature verification code
located in [src/index.ts](./src/index.ts#L250) around line 250.
