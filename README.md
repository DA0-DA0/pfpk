# pfpk

pic for private key. A [Cloudflare
Worker](https://developers.cloudflare.com/workers) that allows associating a
name and [Stargaze](https://stargaze.zone) or [Juno](https://junonetwork.io) NFT
with a given [Cosmos](https://cosmos.network) wallet / keypair.

Currently deployed at https://pfpk.daodao.zone

## Setup

```
npm install -g wrangler
npm install
```

## Development

```
npm run dev
```

### Configuration

1. Create KV namespaces for production and development:

```sh
npx wrangler kv:namespace create PROFILES
npx wrangler kv:namespace create PROFILES --preview
```

2. Update the binding IDs in `wrangler.toml`:

```toml
kv-namespaces = [
  { binding = "PROFILES", id = "<INSERT PROFILES_ID>", preview_id = "<INSERT PROFILES_PREVIEW_ID>" },
]
```

3. Configure secrets:

```sh
echo <VALUE> | npx wrangler secret put INDEXER_API_KEY
```

## API

### `GET /:publicKey`

`publicKey` is the hexadecimal representation of a secp256k1 public key used in
the Cosmos.

You can alternatively use the bech32 address or hash to query for the profile:

- `GET /address/:bech32Address`
- `GET /bech32/:bech32Hash`

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
NFT has an image URL set. If the public key no longer owns the NFT, or there is
no image URL set, no NFT is returned.

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

### `GET /search/:bech32Prefix/:namePrefix`

`bech32Prefix` is the bech32 prefix of the chain, such as `juno` or `stars`. It
will transform the public keys associated with names to the bech32 address.

`namePrefix` is the prefix of the name to search for. It is case-insensitive.

The returned type is:

```ts
type SearchProfilesResponse = {
  profiles: Array<{
    publicKey: string;
    address: string;
    profile: {
      name: string | null;
      nft: {
        chainId: string;
        collectionAddress: string;
        tokenId: string;
        imageUrl: string;
      } | null;
    };
  }>;
};
```

or in the case of an error:

```ts
type SearchProfilesResponse = {
  error: string;
  message: string;
};
```

This route lets you search for profiles with names that have a given prefix. It
returns the top 5 results.

### `GET /resolve/:bech32Prefix/:name`

`bech32Prefix` is the bech32 prefix of the chain, such as `juno` or `stars`. It
will transform the public keys associated with names to the bech32 address.

`name` is the name to resolve. It is case-insensitive.

The returned type is:

```ts
type ResolveProfileResponse = {
  resolved: {
    publicKey: string;
    address: string;
    profile: {
      name: string | null;
      nft: {
        chainId: string;
        collectionAddress: string;
        tokenId: string;
        imageUrl: string;
      } | null;
    };
  } | null;
};
```

or in the case of an error:

```ts
type ResolveProfileResponse = {
  error: string;
  message: string;
};
```

This route lets you resolve a profile from its name.
